import {readFileSync,writeFileSync} from 'node:fs';
const out='artifacts/qa/phase10-backend';
const {url}=JSON.parse(readFileSync(out+'/deployment.json'));
if(!/^https:\/\/meridian-[a-z0-9]+-arhans-projects-ac470eaa\.vercel\.app$/.test(url))throw Error('Unexpected target');
const rows=[];
for(const [path,expected] of [['/',200],['/developers',200],['/research',200],['/api/v1/validate/status',200],['/api/v1/keys',405],['/api/waitlist',405],['/api/v1/receipts/'+'0'.repeat(24),404],['/api/v1/receipts/'+'0'.repeat(24)+'/badge.svg',404]]){
 const response=await fetch(url+path,{signal:AbortSignal.timeout(30000)});
 const row={path,status:response.status,expected,passed:response.status===expected,cacheControl:response.headers.get('cache-control')};
 if(path==='/api/v1/validate/status'){
  const body=await response.json();row.health=body.data;
  row.passed&&=body.data.store_reachable===true&&body.data.usage_available===true&&body.data.usage.keys_issued_today===0&&body.data.usage.validations_total===0;
 }
 rows.push(row);
}
writeFileSync(out+'/hosted-checks.json',JSON.stringify({url,checkedAt:new Date().toISOString(),rows},null,2)+'\n');
console.log({checks:rows.length,failures:rows.filter(r=>!r.passed),health:rows.find(r=>r.health)?.health});
if(rows.some(r=>!r.passed))process.exitCode=1;
