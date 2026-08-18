import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9356;
const proc=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',`--remote-debugging-port=${PORT}`,'--remote-allow-origins=*','about:blank'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const getJSON=async(p,m='GET')=>(await fetch(`http://127.0.0.1:${PORT}${p}`,{method:m})).json();
for(let i=0;i<40;i++){try{await getJSON('/json/version');break;}catch(e){await wait(250);}}
async function run(url,width,height,label){
  const tab=await getJSON('/json/new?about:blank','PUT');
  const ws=new WebSocket(tab.webSocketDebuggerUrl,{maxPayload:200*1024*1024});
  await new Promise(r=>ws.on('open',r));
  let id=0;const pending=new Map();
  ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
  await send('Page.navigate',{url});await wait(3500);
  await send('Runtime.evaluate',{expression:`(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,30));}window.scrollTo(0,0);})()`,awaitPromise:true});
  await wait(1000);
  const expr=`(function(){
    // find the literal "null" token in context
    const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nullHits=[];let n;
    while(n=tw.nextNode()){const t=n.nodeValue;if(/(^|[>\\s,(])null([<\\s,).]|$)/.test(t)){nullHits.push((n.parentElement?.tagName||'?')+': '+t.trim().slice(0,80));}}
    // find elements wider than viewport (overflow culprits)
    const vw=document.documentElement.clientWidth;const wide=[];
    document.querySelectorAll('body *').forEach(el=>{const r=el.getBoundingClientRect();if(r.right>vw+1||r.left<-1){if(r.width>40)wide.push({tag:el.tagName,cls:(el.className&&el.className.toString().slice(0,40))||'',right:Math.round(r.right),left:Math.round(r.left),w:Math.round(r.width)});}});
    return {nullHits:nullHits.slice(0,15),vw,wide:wide.slice(0,12)};
  })()`;
  const res=await send('Runtime.evaluate',{expression:expr,returnByValue:true});
  ws.close();return {label,...res.result.value};
}
const r1=await run('http://localhost:8731/',1440,900,'landing@1440');
const r2=await run('http://localhost:8731/',390,844,'landing@390');
console.log(JSON.stringify({r1,r2},null,1));
proc.kill();process.exit(0);
