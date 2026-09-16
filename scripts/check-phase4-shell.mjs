// Additional immutable shell snapshot. Never replaces the original main baseline.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { renderProductShellHeader, renderProductShellFooter } from './product-shell.mjs';

const dir='artifacts/qa/phase4-shell';
const file=dir+'/shell-before.json';
const header=renderProductShellHeader({dynamicStatus:true});
const footer=renderProductShellFooter();
const links=html=>[...new Set([...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]))].sort();
const data={headerLinks:links(header),footerLinks:links(footer),header,footer};
mkdirSync(dir,{recursive:true});
if(process.argv.includes('--snapshot')){
  writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  console.log('Saved immutable Phase 4 shell snapshot.');
}else{
  const before=JSON.parse(readFileSync(file,'utf8'));
  for(const key of ['headerLinks','footerLinks']) for(const href of before[key]) assert.ok(data[key].includes(href),`${key}: lost ${href}`);
  assert.match(header,/id="header-broker-status"/);
  for(const phrase of ['No managed capital, copy trading, investment advice or promised return.','The public paper','record begins 2026-08-07','A receipt is not proof of future returns.','Inputs, rules and the failed trials.','Your inputs. Declared arithmetic.','Sources, corrections and boundaries.']) assert.ok(footer.includes(phrase),`Lost footer boundary: ${phrase}`);
  const report={passed:true,headerDestinations:data.headerLinks.length,footerDestinations:data.footerLinks.length,originalDestinationsPreserved:true};
  writeFileSync(dir+'/shell-preservation.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
