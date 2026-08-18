import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9355;
const proc=spawn(CHROME,[
  '--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--remote-allow-origins=*','about:blank'
],{stdio:'ignore'});
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
async function getJSON(path,method='GET'){const r=await fetch(`http://127.0.0.1:${PORT}${path}`,{method});return r.json();}

let ready=false;
for(let i=0;i<40;i++){try{await getJSON('/json/version');ready=true;break;}catch(e){await wait(250);}}
if(!ready){console.log('CHROME_NOT_READY');process.exit(1);}

async function renderPage(url,width,height,label){
  const tab=await getJSON('/json/new?about:blank','PUT');
  const ws=new WebSocket(tab.webSocketDebuggerUrl,{maxPayload:200*1024*1024});
  await new Promise((res,rej)=>{ws.on('open',res);ws.on('error',rej);});
  let id=0;const pending=new Map();const consoleErrors=[];const pageErrors=[];
  ws.on('message',d=>{
    const m=JSON.parse(d);
    if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
    if(m.method==='Runtime.consoleAPICalled'&&(m.params.type==='error'||m.params.type==='assert')){
      consoleErrors.push(m.params.args.map(a=>a.value||a.description||a.type).join(' '));}
    if(m.method==='Runtime.exceptionThrown'){const e=m.params.exceptionDetails;pageErrors.push(e.exception?.description||e.text||'exception');}
    if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'){consoleErrors.push('[net] '+m.params.entry.text);}
  });
  function send(method,params={}){return new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});}
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
  await send('Page.navigate',{url});
  await wait(3500);
  await send('Runtime.evaluate',{expression:`(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40));}window.scrollTo(0,0);})()`,awaitPromise:true});
  await wait(1500);
  const checkExpr=`(function(){
    const txt=document.body.innerText;const out={};
    out.bodyLen=txt.length;
    out.hasNaN=/\\bNaN\\b/.test(txt);
    out.hasUndefined=/\\bundefined\\b/.test(txt);
    out.hasNullToken=/(^|[>\\s,(])null([<\\s,).]|$)/.test(txt);
    out.hasAlphaForge=txt.includes('AlphaForge');
    out.hasAlphaMax=txt.includes('AlphaMax');
    out.hasALPHAC=txt.includes('ALPHAC');
    out.hasFlagshipWord=/[Ff]lagship/.test(txt);
    out.has07to10=txt.includes('0.7 to 1.0');
    out.has146=txt.includes('1.46');
    out.hasCplus=/C\\s*\\+|C plus|grade of C/.test(txt);
    out.has068=txt.includes('0.68');
    out.has091=txt.includes('0.91');
    const accents=new Set();
    document.querySelectorAll('*').forEach(el=>{const cs=getComputedStyle(el);
      [cs.color,cs.borderTopColor,cs.borderBottomColor,cs.backgroundColor,cs.fill,cs.stroke].forEach(c=>{
        const m=c&&c.match&&c.match(/rgba?\\(([^)]+)\\)/);if(!m)return;
        const [r,g,b]=m[1].split(',').map(s=>parseFloat(s));
        if(r>150&&r<235&&g>45&&g<135&&b>25&&b<120&&(r-b)>70&&(r-g)>50) accents.add(Math.round(r)+','+Math.round(g)+','+Math.round(b));});});
    out.signalAccents=[...accents];
    out.scrollW=document.documentElement.scrollWidth;out.clientW=document.documentElement.clientWidth;
    out.overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
    return out;})()`;
  const res=await send('Runtime.evaluate',{expression:checkExpr,returnByValue:true});
  ws.close();
  return {label,width,consoleErrors,pageErrors,dom:res.result?.value};
}
const results=[];
for(const [url,w,h,label] of [
  ['http://localhost:8731/',1440,900,'landing@1440'],
  ['http://localhost:8731/',390,844,'landing@390'],
]){try{results.push(await renderPage(url,w,h,label));}catch(e){results.push({label,error:String(e)});}}
console.log(JSON.stringify(results,null,1));
proc.kill();process.exit(0);
