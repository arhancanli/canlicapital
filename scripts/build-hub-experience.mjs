// Phase 6's explicit route boundary. Run after the source generators.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {applyHubNavigation} from './lib/reading-layout.mjs';
import {normalizeEditableCopy} from './editable-copy.mjs';
const navs={
 systems:[['data','Data'],['factors','Factors'],['portfolio','Portfolio'],['backtester','Backtester'],['overlays','Risk overlays'],['paper-loop','Paper execution'],['end-to-end','One decision']],
 performance:[['measures','Measures'],['facts','Operating facts'],['results','Results'],['capacity','Capacity'],['standing','Limitations'],['book','The book']],
 research:[['book','Strategies'],['factors','Factor tests'],['researchLibrary','Document library'],['method','Research process'],['frontier','Planned research']],
 methodology:[['deflated-sharpe','Selection pressure'],['validate-a-backtest','Validation'],['point-in-time','Data integrity'],['pre-registration','Pre-registration'],['gate','Admission'],['corrections','Corrections']],
 verify:[['l1','Hashes'],['l2','Signatures'],['l3','Reproduction'],['limits','Limits'],['found-something','Report a mismatch']],
 review:[['bench','Review bench'],['protocol-title','Protocol'],['states-title','Review states'],['close-title','Contribute']],
 foundry:[['airgap-title','Execution boundary'],['lifecycle-title','Identity lifecycle'],['migration-title','Failure preservation'],['acceptance-title','Receipts'],['source-title','Local verification']],measurements:[],
};
const files=[...Object.keys(navs).map(n=>n+'.html'),...readdirSync('research/topics').filter(n=>n.endsWith('.html')).map(n=>'research/topics/'+n)];
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
for(const file of files){
 let html=applyHubNavigation(readFileSync(file,'utf8'),{file,links:navs[file.replace('.html','')]??[]});const key=file.replace('.html','');
 if(key==='research'){
  const index=JSON.parse(readFileSync('public/research-index.json','utf8'));
  const rows=index.papers.map(p=>`<li class="research-library__item"><a class="research-library__link" href="${escape(p.path)}"><span class="research-library__title">${escape(p.title)}</span><span class="research-library__desc">${escape(p.description||'')}</span></a></li>`).join('');
  html=html.replace(/(<div[^>]*id="researchLibrary") hidden/,'$1');
  html=html.replace(/(id="library-head" data-rl="title">)[\s\S]*?(<\/h3>)/,(_,start,end)=>`${start}<!-- hub-library-title:start -->${index.papers.length} research documents<!-- hub-library-title:end -->${end}`);
  // A function replacer keeps dollar signs in source prose literal ($&, $1, etc.).
  const library=/<ul class="research-library" id="researchLibraryList">[\s\S]*?(?=\n      <\/div>\n\n      <div class="frontier__probe-results")/;
  if(!library.test(html))throw Error('Research library template changed; refusing partial enhancement');
  html=html.replace(library,()=>`<ul class="research-library" id="researchLibraryList"><!-- hub-library:start -->${normalizeEditableCopy(rows)}<!-- hub-library:end --></ul>`);
 }
 if(key==='review'||key==='foundry')html=html.replace(/(<dd>[^<]*<\/dd>)<small>([^<]*)<\/small>/g,'$1<dd class="hub-definition-note"><small>$2</small></dd>');
 writeFileSync(file,html);
}
console.log(`Hub experience: ${files.length} explicit routes; original documents untouched.`);
