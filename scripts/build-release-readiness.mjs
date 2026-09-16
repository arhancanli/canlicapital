import {readFileSync,writeFileSync} from 'node:fs';
const {routes}=JSON.parse(readFileSync('artifacts/qa/redesign-scope/inventory.json'));
const chain=JSON.parse(readFileSync('public/glassbox/transparency_log.json'));
const chainCount=chain.entries.length;
for(const {file} of routes){
 let html=readFileSync(file,'utf8').replace(/\n<!-- release-style:start -->[\s\S]*?<!-- release-style:end -->/,'');
 if(file==='index.html') html=html.replace(/(<strong id="trust-chain">)[^<]*(<\/strong>)/,`$1${chainCount.toLocaleString('en-GB')}$2`);
 html=html.replace('</head>','\n<!-- release-style:start --><link rel="stylesheet" href="/css/release-readiness.css" /><!-- release-style:end --></head>');
 if(file==='research.html'){
  html=html.replace(/<!-- release-basis:start -->[\s\S]*?<!-- release-basis:end -->/,'');
  html=html.replace(/(<p class="hero__sub body-l reveal-fade" data-es="description">[\s\S]*?<\/p>)/,'$1<!-- release-basis:start --><p class="research-execution-basis">Execution basis: paper trading and local simulation. “Live” below describes running systems, not funded execution. Model expectations are not measured forward returns. <a href="/measurements/forward-evidence-maturity">Inspect the forward evidence.</a></p><!-- release-basis:end -->');
 }
 writeFileSync(file,html);
}
console.log(`Release layer: ${routes.length} site pages; original publication artifacts excluded.`);
