import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const file='.vercel/phase10-private.json',state=JSON.parse(readFileSync(file));
const project=JSON.parse(readFileSync('.vercel/project.json'));
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
if(project.projectId!=='prj_8Tz8L3XtQvz2iW3h86o8DASbIUb2'||project.orgId!=='team_8dPaWPFPofID3XMKcrwEiuaK'||branch!=='design/glassbox-website-20260908'||state.projectRef!=='gdqrwikuqzxioxhequtc'||!state.schemaApplied)throw Error('Preview identity guard failed');
const values={SUPABASE_URL:state.url,SUPABASE_SERVICE_ROLE_KEY:state.serviceKey,API_CLIENT_SALT:state.clientSalt};
for(const [name,value] of Object.entries(values)){
 if(!value)throw Error(`Missing ${name}`);
 if(state.vercelConfigured?.includes(name)){console.log({name,alreadyConfigured:true});continue;}
 try{
  execFileSync('/Users/arhancanli/.nvm/versions/node/v22.23.2/bin/node',['/Users/arhancanli/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','env','add',name,'preview','--git-branch',branch,'--sensitive','--yes','--scope','arhans-projects-ac470eaa'],{input:value,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:45000});
 }catch(error){
  let diagnostic=String(error.stderr||'')+String(error.stdout||'');
  for(const secret of Object.values(values))if(secret)diagnostic=diagnostic.replaceAll(secret,'[REDACTED]');
  console.log(diagnostic.split('\n').filter(line=>/error|git|connect/i.test(line)).join('\n'));
  throw Error(`Adding ${name} failed; inspect metadata before retrying.`);
 }
 state.vercelConfigured=[...(state.vercelConfigured||[]),name];writeFileSync(file,JSON.stringify(state),{mode:0o600});console.log({name,target:'preview',branch,configured:true});
}
