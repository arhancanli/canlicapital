// Pure reading/navigation transforms shared by normal and standalone generators.
import { htmlText, escapeHtml } from './html-text.mjs';
export const stripReader=html=>html.replace(/ data-reader="[^"]*"/,'').replace(/\n<link rel="stylesheet" href="\/css\/reader-experience.css" \/>/,'').replace(/\n<script type="module" src="\/js\/reader-experience.js"><\/script>/,'').replace(/<!-- reader-index:start -->[\s\S]*?<!-- reader-index:end -->/,'').replace(/ id="reader-section-\d+" data-reader-anchor="true"/g,'').replace(/ tabindex="0" data-reader-focus="true"/g,'').replace(/<dd class="reader-definition-note">(<small>[\s\S]*?<\/small>)<\/dd>/g,'$1');

export function applyReaderPresentation(source,{file,family}) {
 let html=stripReader(source);
 const kind=family==='top-level'?file.replace('.html',''):family;
 html=html.replace('<html ',`<html data-reader="${kind}" `).replace('</head>','\n<link rel="stylesheet" href="/css/reader-experience.css" /></head>').replace('</body>','\n<script type="module" src="/js/reader-experience.js"></script></body>');
 const match=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
 if(!match)throw Error(`${file}: no main; needs explicit layout review`);
 let n=0;const links=[];
 let body=match[1].replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/g,(all,attrs,label)=>{
  n++;let id=attrs.match(/\bid="([^"]+)"/)?.[1];
  if(!id){id=`reader-section-${n}`;attrs+=` id="${id}" data-reader-anchor="true"`;}
  const text=htmlText(label).replace(/\s+/g,' ').trim();
  if(text)links.push(`<a href="#${escapeHtml(id)}">${escapeHtml(text)}</a>`);
  return `<h2${attrs}>${label}</h2>`;
 });
 body=body.replace(/<(pre|table)\b([^>]*)>/g,(all,tag,attrs)=>/\btabindex=/.test(attrs)?all:`<${tag}${attrs} tabindex="0" data-reader-focus="true">`);
 if(file==='founder.html')body=body.replace(/(<dd>[^<]*<\/dd>)<small>([\s\S]*?)<\/small>/g,'$1<dd class="reader-definition-note"><small>$2</small></dd>');
 const parent=family==='measurements'?'/measurements':family==='trials'||file==='trials.html'?'/trials':family==='notes'||file==='notes.html'?'/notes':family==='publication'?'/research':family==='research'?'/research':'/systems';
 const nav=`<!-- reader-index:start --><aside class="reader-index"><a class="reader-index__back" href="${parent}">Explore ${parent.slice(1)}</a>${links.length?`<details><summary>In this document</summary><nav aria-label="Document sections">${links.join('')}</nav></details>`:''}<a class="reader-index__verify" href="/verify">How to verify a claim ↗</a></aside><!-- reader-index:end -->`;
 html=html.replace(match[0],()=>match[0].replace(match[1],()=>nav+body));
 return html;
}

export function applyHubNavigation(source,{file,links=[]}) {
 let html=source;const key=file.replace('.html','');
 html=html.replace(/\sdata-hub="[^"]*"/,'').replace('<html ',`<html data-hub="${key.startsWith('research/topics/')?'topic':key}" `);
 if(!html.includes('href="/css/hub-experience.css"'))html=html.replace('</head>','<link rel="stylesheet" href="/css/hub-experience.css" />\n</head>');
 html=html.replace(/\n?<!-- hub-index:start -->[\s\S]*?<!-- hub-index:end -->\n?/,'');

 for(const [id] of links)if(!html.includes(`id="${id}"`))throw Error(`${file}: missing navigation target ${id}`);
 const items=links.map(([id,label])=>`<a href="#${id}">${label}</a>`);
 if(!items.length)items.push('<a href="/research">Research library</a>','<a href="/methodology">Methodology</a>','<a href="/measurements">Measurements</a>','<a href="/verify">Verify a claim</a>');
 const nav=`<!-- hub-index:start --><nav class="hub-index" aria-label="${links.length?'On this page':'Related evidence hubs'}"><span>${links.length?'On this page':'Explore the evidence'}</span>${items.join('')}</nav><!-- hub-index:end -->\n`;
 html=html.replace(/(<main\b[^>]*>)/,`$1\n${nav}`);
 if(!html.includes('src="/js/hub-experience.js"'))html=html.replace('</body>','<script type="module" src="/js/hub-experience.js"></script>\n</body>');
 return html;
}
