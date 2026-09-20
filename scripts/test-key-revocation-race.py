"""Exercise real PostgreSQL row-lock ordering in the disposable CI database."""
import os
import subprocess
import time


def sql(text):
    return subprocess.check_output(['psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', text], text=True, timeout=10).strip()


def process(text, name):
    return subprocess.Popen(['psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', text], env={**os.environ, 'PGAPPNAME': name}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def wait_for_lock(name):
    until = time.monotonic() + 10
    while time.monotonic() < until:
        if sql(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock'") == '1':
            return
        time.sleep(.05)
    raise AssertionError('Expected database lock wait: ' + name)


sql("insert into public.api_keys(key_hash) values('race-hash')")
controller = subprocess.Popen(['psql', '-XAtq', '-v', 'ON_ERROR_STOP=1'], env={**os.environ, 'PGAPPNAME': 'canli-race-controller'}, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
children = [controller]
try:
    controller.stdin.write('BEGIN; SELECT pg_advisory_xact_lock(3410285);\n')
    controller.stdin.flush()
    until = time.monotonic() + 10
    while sql("select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='canli-race-controller' and l.locktype='advisory' and l.granted") != '1':
        if time.monotonic() > until: raise AssertionError('Controller lock missing')
        time.sleep(.05)
    revoker = process("BEGIN; SELECT public.revoke_key('race-hash'); SELECT pg_advisory_xact_lock(3410285); COMMIT;", 'canli-race-revoker')
    children.append(revoker)
    wait_for_lock('canli-race-revoker')
    consumer = process("select public.consume_quota('race-hash',1000)", 'canli-race-consumer')
    children.append(consumer)
    wait_for_lock('canli-race-consumer')
    controller.communicate('COMMIT;\n\\q\n', timeout=10)
    _, error = revoker.communicate(timeout=10)
    assert revoker.returncode == 0, error
    output, error = consumer.communicate(timeout=10)
    assert consumer.returncode == 0, error
    assert output.strip() == '-2', output
    assert sql("select count(*) from public.api_usage_daily u join public.api_keys k on k.id=u.key_id where k.key_hash='race-hash'") == '0'
    print('PASS: quota admission waiting behind revocation is rejected without charging usage')
finally:
    for child in children:
        if child.poll() is None:
            child.terminate()
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill(); child.wait()
