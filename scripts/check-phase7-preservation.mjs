import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripReader} from './phase7-scope.mjs';
const base=JSON.parse(readFileSync('artifacts/qa/phase7-reader/before.json'));
const failures=[];
for(const r of [...base.routes,...base.protectedDocuments]){
 const original=readFileSync(r.file,'utf8');
 const source=r.file.startsWith('public/')?original:original.replace(/\n<!-- release-style:start -->[\s\S]*?<!-- release-style:end -->/,'');
 const hash=createHash('sha256').update(r.file.startsWith('public/')?source:stripReader(source)).digest('hex');
 if(hash!==r.sha256)failures.push(r.file);
}
const report={pages:base.routes.length,protectedOriginals:base.protectedDocuments.length,failures};
writeFileSync('artifacts/qa/phase7-reader/preservation.json',JSON.stringify(report,null,2));console.log(report);
if(failures.length)process.exitCode=1;
