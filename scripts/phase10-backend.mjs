// Explicit, preview-only provisioning. Secrets stay in ignored mode-0600 state.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const org='zhtvcnjwjqntugkaxbuh',name='canlicapital-preview';
const file='.vercel/phase10-private.json';
const token=execFileSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
async function api(path,body){
 const r=await fetch('https://api.supabase.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw Error(`Supabase ${body?'POST':'GET'} ${path}: HTTP ${r.status}; response omitted to protect credentials`);
 return r.json();
}
const save=s=>{mkdirSync('.vercel',{recursive:true});writeFileSync(file,JSON.stringify(s),{mode:0o600});};
const command=process.argv[2];
let state=existsSync(file)?JSON.parse(readFileSync(file)):{};
const organization=await api('/organizations/'+org);
if(organization.plan!=='free')throw Error('Stopped: approved budget is $0 and organization is not Free');
const projects=await api('/projects');
if(command==='create'){
 if(projects.some(p=>p.organization_id===org&&p.name===name))throw Error('Matching project exists; inspect before another creation');
 if(state.creationAttempted)throw Error('Creation was already attempted; inspect project list instead of retrying blindly');
 state={org,name,dbPassword:randomBytes(32).toString('base64url'),clientSalt:randomBytes(32).toString('hex'),creationAttempted:true};save(state);
 const p=await api('/projects',{organization_slug:org,name,db_pass:state.dbPassword,region:'us-east-1',desired_instance_size:'nano'});
 state.projectRef=p.id;save(state);console.log({created:true,projectRef:p.id,name:p.name,status:p.status,organizationPlan:organization.plan});
}else{
 const p=projects.find(p=>p.id===state.projectRef);
 if(!p||p.organization_id!==org||p.name!==name||p.id==='bpnensyowfmdwhqmfdrg')throw Error('Preview target identity check failed');
 console.log({projectRef:p.id,name:p.name,status:p.status,organizationPlan:organization.plan});
 if(command==='schema'){
  if(state.schemaApplied)throw Error('Schema already applied; use status/checks instead');
  const migrations=['20260905_validation_api.sql','20260906_key_source.sql','20260906_usage_summary.sql','20260906_usage_summary_v2.sql'];
  const waitlist=`create table if not exists public.waitlist (id bigint generated always as identity primary key,email text not null unique,created_at timestamptz not null default now()); alter table public.waitlist enable row level security; revoke all on public.waitlist from anon, authenticated;`;
  await api(`/projects/${p.id}/database/query`,{query:'begin;\n'+migrations.map(f=>readFileSync('supabase/migrations/'+f,'utf8')).join('\n')+'\n'+waitlist+'\ncommit;'});
  state.schemaApplied=true;save(state);console.log({schemaApplied:true,migrations,waitlistIncluded:true});
 }else if(command==='keys'){
  const keys=await api(`/projects/${p.id}/api-keys?reveal=true`);
  const service=keys.find(k=>k.name==='service_role'),anon=keys.find(k=>k.name==='anon');
  if(!service?.api_key||!anon?.api_key)throw Error('Expected project keys unavailable');
  state.serviceKey=service.api_key;state.anonKey=anon.api_key;state.url=`https://${p.id}.supabase.co`;save(state);console.log({previewKeysStoredLocally:true,valuesPrinted:false});
 }else if(command==='check'){
  const posture=await api(`/projects/${p.id}/database/query/read-only`,{query:`select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') as anon_select,has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('api_keys','api_usage_daily','api_key_issuance','receipts','waitlist');`});
  const rpc=await api(`/projects/${p.id}/database/query/read-only`,{query:`select p.proname,has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('issue_key','consume_quota','usage_summary');`});
  const counts=await api(`/projects/${p.id}/database/query/read-only`,{query:`select (select count(*) from public.api_keys) as keys,(select count(*) from public.receipts) as receipts,(select count(*) from public.waitlist) as waitlist;`});
  console.log(JSON.stringify({posture,rpc,counts}));
  if(posture.length!==5||posture.some(r=>!r.relrowsecurity||r.anon_select||r.authenticated_select)||rpc.length!==3||rpc.some(r=>!r.service_execute||r.anon_execute||r.authenticated_execute))throw Error('Database isolation posture failed');
  mkdirSync('artifacts/qa/phase10-backend',{recursive:true});writeFileSync('artifacts/qa/phase10-backend/database-checks.json',JSON.stringify({checkedAt:new Date().toISOString(),projectRef:p.id,organizationPlan:organization.plan,posture,rpc,counts},null,2)+'\n');
 }else if(command!=='status')throw Error('Unknown command');
}
