// Aggregate retained runs without replacing failed attempts or old baselines.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='artifacts/qa/phase8-release/';
const read=name=>JSON.parse(readFileSync(root+name,'utf8'));
const finding=r=>Boolean(r.failure||r.errors?.length||r.violations?.length||r.overflow?.length||r.status!==200);
const original=read('routes-after.json'), retries=read('routes-after-retry.json');
const merged=new Map(original.map(r=>[r.route,r]));
for(const row of retries) merged.set(row.route,row);
const routes=[...merged.values()];
if(routes.length!==489||routes.some(finding)) throw new Error('Unresolved route checks');
const suites={
 journeys:read('journeys.json'),normalJourneys:read('journeys-normal.json'),
 shell:read('regressions/phase4-shell/browser/report.json'),
 safari:read('regressions/phase4-shell/safari/report.json').results,
};
for(const rows of Object.values(suites)) if(rows.some(r=>!r.passed)) throw new Error('Failed regression suite');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
const files=walk('dist').sort();
const manifest=files.map(file=>({file,sha256:hash(file)}));
writeFileSync(root+'build-manifest.json',JSON.stringify(manifest,null,2)+'\n');
const summary={
 date:new Date().toISOString(),phase:8,origin:'http://127.0.0.1:4188',
 status:'local release checks complete; hosted and user visual approval pending',
 routeAudit:{routes:routes.length,geometryCases:routes.length*2,mobileWcagTaggedViolations:0,initialTimeouts:original.filter(finding).length,targetedRetries:retries.length,unresolved:0},
 suiteCases:Object.fromEntries(Object.entries(suites).map(([name,rows])=>[name,rows.length])),
 startup:Object.fromEntries(['before','after','throttled'].map(label=>{const r=read('startup-'+label+'.json');return [label,{samples:r.length,maxLcpMs:Math.max(...r.map(x=>x.lcp)),maxCls:Math.max(...r.map(x=>x.cls))}]})),
 sourceSha256:Object.fromEntries(['js/navigation.js','js/reader-experience.js','css/release-readiness.css','scripts/build-reader-experience.mjs','scripts/build-release-readiness.mjs'].map(file=>[file,hash(file)])),
 buildFiles:files.length,buildManifestSha256:hash(root+'build-manifest.json'),
 limits:[
  'All-route and startup runs preceded the final navigation focus fix and cross-document transition opt-out; final cross-family, shell and Safari runs cover those changes.',
  'Automated WCAG-tagged rule checks are not WCAG certification or assistive-technology validation.',
  'Local startup measurements are not field performance, Lighthouse scores, INP or continuous frame-rate checks.',
  'No hosted candidate deployment, real key issuance, subscriptions, trading, new Figma frames or marketing.'
 ]
};
writeFileSync(root+'summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
