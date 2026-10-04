import {readFileSync} from 'node:fs';
const inventory=JSON.parse(readFileSync('artifacts/qa/redesign-scope/inventory.json'));
const covered=new Set(['index.html','developers.html','tools.html','systems.html','performance.html','research.html','methodology.html','measurements.html','verify.html','review.html','foundry.html']);
export const routes=inventory.routes.filter(r=>!covered.has(r.file)&&r.family!=='tools'&&!r.file.startsWith('research/topics/'));
export const protectedDocuments=inventory.protectedDocuments;
export {stripReader} from './lib/reading-layout.mjs';
