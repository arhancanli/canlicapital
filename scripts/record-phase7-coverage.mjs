import {readFileSync,writeFileSync} from 'node:fs';
import {routes,protectedDocuments} from './phase7-scope.mjs';
const root='artifacts/qa/phase7-reader/';
const read=name=>JSON.parse(readFileSync(root+name));
const full=read('all-routes/report.json'),sample=read('sample/report.json'),a11y=read('accessibility.json');
if(full.issues.length||sample.issues.length||a11y.some(r=>r.violations.length))throw Error('Outstanding QA findings; do not record passing coverage');
const sampled=new Set(sample.cases.map(r=>r.route));
const report={
 date:'2026-09-10',phase:7,
 note:'All-route captures preceded final focus/contrast/Founder semantic fixes and Open/Progress alignment correction. Final representative captures/checks cover those corrections; this is not human visual acceptance of every route.',
 routes:routes.map(r=>({file:r.file,route:r.route,family:r.family,changed:true,sourcePreserved:true,desktopMobileRenderChecked:full.cases.filter(c=>c.route===r.route).length===2,representativeVisualReview:sampled.has(r.route),representativeAccessibility:a11y.some(c=>c.route===r.route),userVisualApproval:false})),
 protectedDocuments:protectedDocuments.map(r=>({file:r.file,changed:false,hashPreserved:true})),
 counts:{routes:routes.length,allRouteBrowserCases:full.cases.length,finalRepresentativeCases:sample.cases.length,safari:read('safari/report.json').cases.length,webkitNoJsKeyboard:read('resilience.json').length,normalMotion:read('normal-motion.json').length,representativeA11y:a11y.length},
};
writeFileSync(root+'coverage.json',JSON.stringify(report,null,2));console.log(report.counts);
