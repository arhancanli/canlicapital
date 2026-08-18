import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9357;
const proc=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,'--remote-allow-origins=*','about:blank'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const getJSON=async(p,m='GET')=>(await fetch(`http://127.0.0.1:${PORT}${p}`,{method:m})).json();
for(let i=0;i<40;i++){try{await getJSON('/json/version');break;}catch(e){await wait(250);}}
async function run(width,height,mobile){
  const tab=await getJSON('/json/new?about:blank','PUT');
  const ws=new WebSocket(tab.webSocketDebuggerUrl,{maxPayload:200*1024*1024});
  await new Promise(r=>ws.on('open',r));
  let id=0;const pending=new Map();
  ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}});
  const send=(method,params={})=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await send('Page.navigate',{url:'http://localhost:8731/'});await wait(3000);
  const res=await send('Runtime.evaluate',{expression:`({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,bw:document.body.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`,returnByValue:true});
  ws.close();return {width,mobile,...res.result.value};
}
console.log(JSON.stringify({
  m390_mobileTrue:await run(390,844,true),
  m390_mobileFalse:await run(390,844,false),
  m1440:await run(1440,900,false),
},null,1));
proc.kill();process.exit(0);
