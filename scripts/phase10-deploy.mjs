// Per-deployment runtime variables: no Git integration or project-wide env edits.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const state=JSON.parse(readFileSync('.vercel/phase10-private.json'));
// Keep each approved phase's deployment evidence separate.
const out=process.argv[2] || 'artifacts/qa/phase10-backend';
if(!/^artifacts\/qa\/phase(?:10-backend|14-preview)$/.test(out))throw Error('Unexpected evidence directory');
const project=JSON.parse(readFileSync('.vercel/project.json'));
if(project.projectId!=='prj_8Tz8L3XtQvz2iW3h86o8DASbIUb2'||state.projectRef!=='gdqrwikuqzxioxhequtc'||state.url!=='https://gdqrwikuqzxioxhequtc.supabase.co'||!state.schemaApplied)throw Error('Preview identity guard failed');
const values={SUPABASE_URL:state.url,SUPABASE_SERVICE_ROLE_KEY:state.serviceKey,API_CLIENT_SALT:state.clientSalt};
if(Object.values(values).some(v=>!v))throw Error('Missing preview credentials');
const args=['/Users/arhancanli/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','deploy','--target','preview','--archive','tgz','--yes','--no-wait','--scope','arhans-projects-ac470eaa',...Object.keys(values).flatMap(k=>['--env',k])];
let output;
try{output=execFileSync('/Users/arhancanli/.nvm/versions/node/v22.23.2/bin/node',args,{env:{...process.env,...values},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000});}
catch{throw Error('Preview deploy failed; inspect deployment metadata before retrying. Raw output withheld to protect credentials.');}
for(const secret of Object.values(values))output=output.replaceAll(secret,'[REDACTED]');
const url=output.match(/https:\/\/meridian-[a-z0-9]+-arhans-projects-ac470eaa\.vercel\.app/)?.[0];
const id=output.match(/"id":\s*"(dpl_[^"]+)"/)?.[1];
if(!url||!id)throw Error('Deployment returned unexpected output; inspect metadata');
mkdirSync(out,{recursive:true});
writeFileSync(out+'/deployment.json',JSON.stringify({url,id,target:'preview',runtimeVariableNames:Object.keys(values),scope:'this deployment only'},null,2)+'\n');
console.log({url,id,target:'preview',runtimeVariableNames:Object.keys(values),scope:'this deployment only'});
