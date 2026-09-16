import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const root='artifacts/qa/phase14-preview';
const read=p=>JSON.parse(readFileSync(`${root}/${p}`));
const routes=read('http/routes.json'),rechecks=read('http/route-rechecks.json');
const extra=read('http/http-checks-corrected.json');
const targeted=read('targeted/report.json'),journeys=read('normal/journeys-normal.json');
const safari=read('safari/report.json').results,contrast=read('contrast/contrast.json');
const health=read('health.json').rows;
assert.equal(routes.length,489);
assert(routes.every(row=>row.passed||rechecks.some(recheck=>recheck.route===row.route&&recheck.passed)));
for(const rows of [rechecks,extra,targeted,journeys,safari,health])assert(rows.every(row=>row.passed));
assert(contrast.every(row=>row.violations.length===0));
const summary={
 ...read('deployment.json'),checkedAt:new Date().toISOString(),
 initialRoutePasses:routes.filter(row=>row.passed).length,
 initialRouteFailures:routes.filter(row=>!row.passed),
 routeRechecks:rechecks,allRoutesVerifiedAfterBoundedRecheck:true,
 additionalHttpChecksPassed:extra.length,
 protectedOriginalsPreserved:extra.filter(row=>row.originalBytesPreserved).length,
 targetedBrowserCasesPassed:targeted.length,normalMotionJourneysPassed:journeys.length,
 actualSafariRoutesPassed:safari.length,desktopContrastRoutesPassed:contrast.length,
 apiChecksPassed:health.length,startupShiftSums:read('startup/startup-trace.json').map(row=>row.clsSum),
 figmaSync:'blocked-incomplete-required-figma-use-resource',productionChanged:false,
 phaseFullyComplete:false,userVisualApproval:'pending'
};
writeFileSync(`${root}/summary.json`,JSON.stringify(summary,null,2)+'\n');
console.log(summary);
