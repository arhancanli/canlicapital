"""Finite stdlib/Git/GitHub metadata capture; never imports or executes project code."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

HEAD, RUN, ROOT_JOB, MCP_JOB, BASE, EXPECTED_MAIN, EXPECTED_NEW, EXPECTED_MANIFEST_SHA = sys.argv[1:]
ROOT = Path('/Users/arhancanli/canlicapital-research-cache-bounds-20261002')
DEST = Path(__file__).parent
TAG = HEAD[:8]
PINS = []


def call(args):
    process = subprocess.run(args, capture_output=True, timeout=45)
    if process.returncode:
        raise RuntimeError(f'metadata command failed: {args[:3]!r}, code={process.returncode}')
    if len(process.stdout) > 8 * 1024 * 1024:
        raise RuntimeError('metadata capture exceeds 8MiB')
    return process.stdout


def retain(suffix, args):
    path = DEST / f'secondary-{TAG}-{suffix}'
    if path.exists():
        data = path.read_bytes()  # Preserve and inspect original capture, never relabel it as fresh.
    else:
        data = call(args)
        with path.open('xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    PINS.append({'path': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    return data


def api(suffix, endpoint):
    return json.loads(retain(suffix, ['gh', 'api', endpoint]))


def clean(data):
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', data.decode('utf-8'))
    return re.sub(r'^\d{4}-\d{2}-\d{2}T\S+\s', '', text, flags=re.M)


def summaries(text):
    rows = []
    for key, count in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$', text, re.M):
        if key == 'tests':
            rows.append({})
        rows[-1][key] = int(count)
    return rows


try:
    assert call(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']).decode().strip() == HEAD
    working_status = call(['git', '-C', str(ROOT), 'status', '--porcelain=v1'])
    manifest_path = DEST / f'source-{TAG}.json'
    manifest_bytes = manifest_path.read_bytes()
    assert hashlib.sha256(manifest_bytes).hexdigest() == EXPECTED_MANIFEST_SHA
    manifest = json.loads(manifest_bytes)
    assert manifest['head'] == HEAD and manifest['clean'] is True and manifest['signature'] == 'G'
    tree = call(['git', '-C', str(ROOT), 'rev-parse', 'HEAD^{tree}']).decode().strip()
    signature = call(['git', '-C', str(ROOT), 'show', '-s', '--format=%G?', 'HEAD']).decode().strip()
    assert signature == 'G' and manifest['tree'] == tree
    root_log = clean(retain('root-ci-original.log', ['gh', 'api', '--allow-escape-sequences', f'repos/arhancanli/canlicapital/actions/jobs/{ROOT_JOB}/logs']))
    mcp_log = clean(retain('mcp-ci-original.log', ['gh', 'api', '--allow-escape-sequences', f'repos/arhancanli/canlicapital/actions/jobs/{MCP_JOB}/logs']))
    checks = json.loads(retain('checks-original.json', ['gh', 'pr', 'checks', '366', '--repo', 'arhancanli/canlicapital', '--json', 'name,state,bucket,link']))
    run = api('run-original.json', f'repos/arhancanli/canlicapital/actions/runs/{RUN}')
    pr = api('pr-original.json', 'repos/arhancanli/canlicapital/pulls/366')
    alerts = api('codeql-alerts-original.json', 'repos/arhancanli/canlicapital/code-scanning/alerts?ref=refs%2Fpull%2F366%2Fmerge&per_page=100')
    analyses = api('codeql-analyses-original.json', 'repos/arhancanli/canlicapital/code-scanning/analyses?ref=refs%2Fpull%2F366%2Fmerge&per_page=100')
    assert isinstance(alerts, list) and alerts == []
    assert isinstance(analyses, list) and len(analyses) < 100
    assert len(checks) == 7 and all(row['state'] == 'SUCCESS' and row['bucket'] == 'pass' for row in checks)
    assert run['head_sha'] == HEAD and run['status'] == 'completed' and run['conclusion'] == 'success' and run['run_attempt'] == 1
    assert pr['head']['sha'] == HEAD and pr['state'] == 'open'
    merges = [re.search(r'log -1 --format=%H\n([0-9a-f]{40})\n', text).group(1) for text in (root_log, mcp_log)]
    assert merges[0] == merges[1]
    merge = api('tested-merge-original.json', f'repos/arhancanli/canlicapital/git/commits/{merges[0]}')
    assert merge['tree']['sha'] == tree
    assert [row['sha'] for row in merge['parents']] == [BASE, HEAD]
    source = call(['git', '-C', str(ROOT), 'show', f'{HEAD}:mcp-research/test/cache-bounds.test.mjs']).decode()
    names = re.findall(r'^test\("([^"]+)"', source, re.M)
    expected_new = int(EXPECTED_NEW)
    assert len(names) == expected_new and len(set(names)) == expected_new
    root_actual = [row for row in re.findall(r'^(ok|not ok) (\d+) - (.*)$', root_log, re.M) if row[2] in names]
    assert root_actual == []  # Client dependency exists only in the existing MCP package job.
    actual = [row for row in re.findall(r'^(ok|not ok) (\d+) - (.*)$', mcp_log, re.M) if row[2] in names]
    assert len(actual) == expected_new and len({row[2] for row in actual}) == expected_new
    assert set(names) == {row[2] for row in actual} and all(row[0] == 'ok' for row in actual)
    root_suites, mcp_suites = summaries(root_log), summaries(mcp_log)
    assert [row['tests'] for row in root_suites] == [6, int(EXPECTED_MAIN), 9]
    assert [row['tests'] for row in mcp_suites] == [141, 1, 47 + expected_new, 119, 139]
    for row in root_suites + mcp_suites:
        assert row['tests'] == row['pass'] and all(row[key] == 0 for key in ['fail', 'cancelled', 'skipped', 'todo'])
    tap_suites = {}
    for label, text, expected_counts in [('root', root_log, [6, int(EXPECTED_MAIN), 9]), ('mcp', mcp_log, [141, 1, 47 + expected_new, 119, 139])]:
        blocks = re.split(r'^TAP version 13\n', text, flags=re.M)[1:]
        assert len(blocks) == len(expected_counts)
        tap_suites[label] = []
        for block, expected in zip(blocks, expected_counts):
            plan = re.findall(r'^1\.\.(\d+)$', block, re.M)
            tests = re.findall(r'^(ok|not ok) (\d+) - (.*)$', block, re.M)
            duration = re.findall(r'^# duration_ms ([0-9.]+)$', block, re.M)
            assert plan == [str(expected)] and len(tests) == expected
            assert [int(row[1]) for row in tests] == list(range(1, expected + 1))
            assert all(row[0] == 'ok' for row in tests)
            assert len(duration) == 1 and float(duration[0]) >= 0
            tap_suites[label].append({'plan': expected, 'top_level_ordinals_exact': True, 'all_top_level_results_ok': True, 'duration_ms': float(duration[0])})
    assert 'v22.23.3' in root_log and 'v22.23.3' in mcp_log
    latest = {}
    for row in sorted(analyses, key=lambda item: item['created_at'], reverse=True):
        latest.setdefault(json.loads(row['environment'])['language'], row)
    assert set(latest) == {'javascript-typescript', 'python'}
    for row in latest.values():
        assert row['commit_sha'] == merges[0] and row['results_count'] == 0 and not row.get('error')
    result = {
        'schema': 'canli.secondary.research-cache-bounds.exact-retained-ci.v1',
        'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source': HEAD, 'tree': tree, 'signature': signature, 'base': BASE,
        'frozen_source_manifest': {'path': str(manifest_path), 'bytes': len(manifest_bytes), 'sha256': EXPECTED_MANIFEST_SHA},
        'working_tree_clean_during_metadata_capture': working_status == b'',
        'working_tree_metadata_capture_does_not_execute_source': True,
        'verdict': 'PASS_EXACT_CURRENT_CI_INDEPENDENT_EXTENSIONS_PENDING',
        'root_run': int(RUN), 'root_job': int(ROOT_JOB), 'mcp_job': int(MCP_JOB),
        'tested_merge': merges[0], 'tested_tree': merge['tree']['sha'],
        'tested_parents': [row['sha'] for row in merge['parents']],
        'root_suites': root_suites, 'mcp_suites': mcp_suites, 'complete_TAP_plans_ordinals_and_durations': tap_suites,
        'research_actual_mcp_pass': expected_new, 'research_mcp_cases': [{'name': row[2], 'number': int(row[1]), 'result': row[0]} for row in actual],
        'existing_research_cases_preserved': 47, 'research_suite_total': 47 + expected_new,
        'research_actual_root_pass': 0, 'research_not_registered_in_root': True,
        'runtime': 'Node v22.23.3 (existing remote CI)', 'checks': checks,
        'codeql_current_ref_alerts': 0,
        'codeql_latest_analyses': {key: {field: row.get(field) for field in ['id', 'commit_sha', 'created_at', 'results_count', 'error', 'environment']} for key, row in latest.items()},
        'codeql_scope': 'Captured pull/366/merge ref; fewer100 rows returned at each bounded endpoint. Historical rows retained; latest per language selected.',
        'original_pins': PINS, 'verified_humans_expertise_independence_rights': None,
        'provider_current_indexed': None, 'distinct_admitted_canonical': None, 'qualified_progress': None,
        'local_project_job_or_grant': False, 'full_owner_goal': 'ACTIVE',
        'scope': 'Byte-exact original logs/API captures for the immutable signed frozen Git source; any working changes are separate unexecuted future source; parser view only removes timestamps/ANSI. No local project runtime or CI rerun. Future head/archive/integration/actual delivery requires separate gates.',
    }
    path = DEST / f'secondary-{TAG}-exact-ci.json'
    data = (json.dumps(result, indent=2) + '\n').encode()
    with path.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    print(json.dumps({'receipt': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                      'source': HEAD, 'tested_merge': merges[0], 'actual_research_mcp_cases': len(actual), 'root_suites': root_suites,
                      'fundamentals': mcp_suites[-2], 'execution': mcp_suites[-1], 'all_checks': len(checks)}))
except BaseException as error:
    path = DEST / f'secondary-{TAG}-capture-error-{datetime.datetime.now(datetime.timezone.utc).strftime("%H%M%S%f")}.json'
    data = (json.dumps({'error_class': type(error).__name__, 'error': str(error), 'source': HEAD,
                       'originals_preserved': PINS, 'no_project_runtime': True}, indent=2) + '\n').encode()
    with path.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    raise
