import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {routes} from './phase7-scope.mjs';
const hashes=()=>routes.map(r=>createHash('sha256').update(readFileSync(r.file)).digest('hex')).join();
const before=hashes();
for(let i=0;i<2;i++){
 execFileSync(process.execPath,['scripts/build-reader-experience.mjs']);
 if(hashes()!==before)throw Error('Reader enhancement is not idempotent');
}
console.log(`Two repeat enhancements identical across ${routes.length} pages.`);
