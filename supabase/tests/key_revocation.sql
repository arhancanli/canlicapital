-- Disposable database only; no production connection.
do $$
declare first_time timestamptz;
begin
  perform public.issue_key('test-client', 5, 'test-hash', 'revocation test');
  if public.consume_quota('test-hash', 1) <> 0 then raise exception 'first quota admission'; end if;
  if public.consume_quota('test-hash', 1) <> -1 then raise exception 'quota exhaustion'; end if;
  insert into public.receipts(id,key_id,endpoint,input_sha256,output,bindings)
    select repeat('a',24),id,'test','test','{}','{}' from public.api_keys where key_hash='test-hash';
  if not (public.revoke_key('test-hash')->>'revoked')::boolean then raise exception 'revoke exhausted key'; end if;
  if public.consume_quota('test-hash', 1000) <> -2 then raise exception 'revoked key admitted'; end if;
  update public.api_keys set revoked_at='2026-01-01T00:00:00Z' where key_hash='test-hash';
  first_time := (public.revoke_key('test-hash')->>'revoked_at')::timestamptz;
  if first_time <> '2026-01-01T00:00:00Z'::timestamptz then raise exception 'repeated revoke changed timestamp'; end if;
  if (public.revoke_key('unknown')->>'revoked')::boolean then raise exception 'unknown key revoked'; end if;
  if (select count(*) from public.receipts) <> 1 then raise exception 'receipt deleted'; end if;
  if has_function_privilege('anon','public.revoke_key(text)','EXECUTE') or has_function_privilege('authenticated','public.revoke_key(text)','EXECUTE') then raise exception 'client role can revoke directly'; end if;
  if has_function_privilege('anon','public.consume_quota(text,integer)','EXECUTE') then raise exception 'client role can consume directly'; end if;
  if not has_function_privilege('service_role','public.revoke_key(text)','EXECUTE') then raise exception 'service role cannot revoke'; end if;
  perform public.issue_key('test-client',5,'service-test-hash','role test');
end $$;
set role service_role;
select public.revoke_key('service-test-hash');
reset role;
do $$ begin
 if not exists(select 1 from public.api_keys where key_hash='service-test-hash' and revoked_at is not null) then raise exception 'service role revocation failed'; end if;
end $$;
