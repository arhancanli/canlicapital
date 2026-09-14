// Read-only runtime checks. The isolated store already contains approved Phase 11 test records.
import {readFileSync,writeFileSync} from 'node:fs';
const out='artifacts/qa/phase14-preview';
const {url}=JSON.parse(readFileSync(out+'/deployment.json'));
if(!/^https:\/\/meridian-[a-z0-9]+-arhans-projects-ac470eaa\.vercel\.app$/.test(url))throw Error('Unexpected preview target');
const rows=[];
for(const [path,expected] of [['/api/v1/validate/status',200],['/api/v1/keys',405],['/api/waitlist',405],['/api/v1/receipts/'+'0'.repeat(24),404],['/api/v1/receipts/'+'0'.repeat(24)+'/badge.svg',404]]){
 const response=await fetch(url+path,{signal:AbortSignal.timeout(30000)});
 const row={path,status:response.status,expected,passed:response.status===expected};
 if(path==='/api/v1/validate/status'){
  const body=await response.json();row.health=body.data;
  row.passed&&=body.data.store_reachable===true&&body.data.usage_available===true;
 }
 rows.push(row);
}
writeFileSync(out+'/health.json',JSON.stringify({url,checkedAt:new Date().toISOString(),method:'GET only',rows},null,2)+'\n');
console.log({checks:rows.length,failures:rows.filter(r=>!r.passed),health:rows.find(r=>r.health)?.health});
if(rows.some(r=>!r.passed))process.exitCode=1;
