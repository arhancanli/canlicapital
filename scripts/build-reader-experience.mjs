import {readFileSync,writeFileSync} from 'node:fs';
import {routes,stripReader} from './phase7-scope.mjs';
for(const {file,family} of routes){
 let html=stripReader(readFileSync(file,'utf8'));
 const kind=family==='top-level'?file.replace('.html',''):family;
 html=html.replace('<html ',`<html data-reader="${kind}" `).replace('</head>','\n<link rel="stylesheet" href="/css/reader-experience.css" /></head>').replace('</body>','\n<script type="module" src="/js/reader-experience.js"></script></body>');
 const match=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
 if(!match)throw Error(`${file}: no main; needs explicit layout review`);
 let n=0;const links=[];
 let body=match[1].replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/g,(all,attrs,label)=>{
  n++;let id=attrs.match(/\bid="([^"]+)"/)?.[1];
  if(!id){id=`reader-section-${n}`;attrs+=` id="${id}" data-reader-anchor="true"`;}
  const text=label.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
  if(text)links.push(`<a href="#${id}">${text}</a>`);
  return `<h2${attrs}>${label}</h2>`;
 });
 body=body.replace(/<(pre|table)\b([^>]*)>/g,(all,tag,attrs)=>/\btabindex=/.test(attrs)?all:`<${tag}${attrs} tabindex="0" data-reader-focus="true">`);
 if(file==='founder.html')body=body.replace(/(<dd>[^<]*<\/dd>)<small>([\s\S]*?)<\/small>/g,'$1<dd class="reader-definition-note"><small>$2</small></dd>');
 const parent=family==='measurements'?'/measurements':family==='trials'||file==='trials.html'?'/trials':family==='notes'||file==='notes.html'?'/notes':family==='publication'?'/research':family==='research'?'/research':'/systems';
 const nav=`<!-- reader-index:start --><aside class="reader-index"><a class="reader-index__back" href="${parent}">Explore ${parent.slice(1)}</a>${links.length?`<details><summary>In this document</summary><nav aria-label="Document sections">${links.join('')}</nav></details>`:''}<a class="reader-index__verify" href="/verify">How to verify a claim ↗</a></aside><!-- reader-index:end -->`;
 html=html.replace(match[0],()=>match[0].replace(match[1],()=>nav+body));
 writeFileSync(file,html);
}
console.log(`Reader layouts: ${routes.length} routes; protected originals excluded.`);
