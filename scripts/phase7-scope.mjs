import {readFileSync} from 'node:fs';
const inventory=JSON.parse(readFileSync('artifacts/qa/redesign-scope/inventory.json'));
const covered=new Set(['index.html','developers.html','tools.html','systems.html','performance.html','research.html','methodology.html','measurements.html','verify.html','review.html','foundry.html']);
export const routes=inventory.routes.filter(r=>!covered.has(r.file)&&r.family!=='tools'&&!r.file.startsWith('research/topics/'));
export const protectedDocuments=inventory.protectedDocuments;
export const stripReader=html=>html.replace(/ data-reader="[^"]*"/,'').replace(/\n<link rel="stylesheet" href="\/css\/reader-experience.css" \/>/,'').replace(/\n<script type="module" src="\/js\/reader-experience.js"><\/script>/,'').replace(/<!-- reader-index:start -->[\s\S]*?<!-- reader-index:end -->/,'').replace(/ id="reader-section-\d+" data-reader-anchor="true"/g,'').replace(/ tabindex="0" data-reader-focus="true"/g,'').replace(/<dd class="reader-definition-note">(<small>[\s\S]*?<\/small>)<\/dd>/g,'$1');
