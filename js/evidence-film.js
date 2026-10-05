// A continuous spatial archive. Each plane is one published trial identity.
// The arrangements explain a process; they are not an execution simulation.
const SOURCE = '/glassbox/trial_sharpe_distribution.json';
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const VERTEX = `
attribute vec3 origin;
attribute vec3 destination;
attribute vec2 corner;
attribute float score;
uniform mat4 projection;
uniform mat4 camera;
uniform float progress;
uniform float phase;
varying vec2 uv;
varying float measured;
varying float depth;
void main(){
 vec3 center=mix(origin,destination,progress);
 vec3 p=center+vec3(corner.x*.25,corner.y*.32,corner.x*.28);
 vec4 view=camera*vec4(p,1.);
 gl_Position=projection*view;
 uv=corner;measured=score;depth=-view.z;
}`;
const FRAGMENT = `
precision mediump float;
varying vec2 uv;
varying float measured;
varying float depth;
uniform float phase;
void main(){
 float rim=smoothstep(.89,.98,max(abs(uv.x),abs(uv.y)));
 float rule=1.-smoothstep(.015,.05,abs(uv.y-.38));
 float light=pow(max(0.,1.-length(uv-vec2(-.6,.7))*.55),3.);
 vec3 ice=vec3(.57,.82,.89);
 vec3 amber=vec3(.85,.58,.37);
 vec3 tint=mix(ice,measured>0.?ice:amber,clamp(phase-1.,0.,1.));
 float fog=clamp(1.-depth/30.,.08,1.);
 vec3 col=tint*(.6+rim*.55+light*.7);
 float alpha=(.075+rim*.58+rule*.12+light*.15)*fog;
 gl_FragColor=vec4(col,alpha);
}`;

function spatialArchive(records) {
 const vertices = [ -1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1 ];
 const states = Array.from({length:3},()=>[]);
 const corners=[],scores=[];
 const columns=Math.ceil(Math.sqrt(records.length*1.3));
 const rows=Math.ceil(records.length/columns);
 let seed=9187;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<records.length;i++) {
  const metric=Number(records[i].annualized_sharpe);
  const col=i%columns,row=Math.floor(i/columns);
  const poses=[
   [(random()-.5)*14+4,(random()-.5)*9,(random()-.5)*8],
   [(col-(columns-1)/2)*.65+4,((rows-1)/2-row)*.8,Math.sin(col*.3)*1.6],
   [(col-(columns-1)/2)*.7+4,clamp(metric,-4,4)*.65,(row-(rows-1)/2)*.7]
  ];
  for(let v=0;v<6;v++) {
   for(let stage=0;stage<3;stage++)states[stage].push(...poses[stage]);
   corners.push(vertices[v*2],vertices[v*2+1]);scores.push(metric);
  }
 }
 return {states:states.map(s=>new Float32Array(s)),corners:new Float32Array(corners),scores:new Float32Array(scores),count:records.length*6};
}

function createArchive(canvas,records) {
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});
 if(!gl)return null;
 const shaders=[];
 const compile=(type,source)=>{
  const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Evidence film shader unavailable');
  return shader;
 };
 const program=gl.createProgram();
 gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;
 const data=spatialArchive(records),buffers={};
 gl.useProgram(program);
 const attribute=(name,values,size)=>{
  const buffer=gl.createBuffer();buffers[name]=buffer;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,values,gl.DYNAMIC_DRAW);
  const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
 };
 attribute('origin',data.states[0],3);attribute('destination',data.states[1],3);attribute('corner',data.corners,2);attribute('score',data.scores,1);
 const uniforms=Object.fromEntries(['projection','camera','progress','phase'].map(n=>[n,gl.getUniformLocation(program,n)]));
 gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
 let uploaded=-1;
 return {
  draw(value) {
   const ratio=Math.min(devicePixelRatio||1,1.5);
   const width=Math.max(1,Math.round(canvas.clientWidth*ratio)),height=Math.max(1,Math.round(canvas.clientHeight*ratio));
   if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
   const phase=clamp(value)*2,segment=Math.min(1,Math.floor(phase)),local=phase-segment;
   if(uploaded!==segment){for(const [name,state] of [['origin',segment],['destination',segment+1]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[name]);gl.bufferSubData(gl.ARRAY_BUFFER,0,data.states[state]);}uploaded=segment;}
   const f=1/Math.tan(.85/2),near=.1,far=60;
   const projection=new Float32Array([f/(width/height),0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
   const angle=-.22+value*.44,c=Math.cos(angle),s=Math.sin(angle),distance=13-value*1.8;
   const camera=new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,-.3,-distance,1]);
   gl.uniformMatrix4fv(uniforms.projection,false,projection);gl.uniformMatrix4fv(uniforms.camera,false,camera);
   gl.uniform1f(uniforms.progress,local*local*(3-2*local));gl.uniform1f(uniforms.phase,phase);
   gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,data.count);
  },
  dispose(){for(const buffer of Object.values(buffers))gl.deleteBuffer(buffer);for(const shader of shaders)gl.deleteShader(shader);gl.deleteProgram(program);}
 };
}

export async function initEvidenceFilm() {
 const canvas=document.getElementById('evidence-film-canvas');
 const chapters=[...document.querySelectorAll('[data-film-scene]')];
 if(!canvas||chapters.length!==3)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const small=matchMedia('(max-width: 767px)');
 let records,scene,frame=0,bounds=[],disposed=false,loading=false,position=0,target=0;
 const stop=()=>{cancelAnimationFrame(frame);frame=0;};
 const measure=()=>{bounds=chapters.map(e=>e.getBoundingClientRect().top+scrollY);};
 const update=()=>{
  if(reduced.matches||small.matches){void sync();return;}
  const y=scrollY+innerHeight*.3;
  const segment=y<bounds[1]?0:1;
  target=clamp((segment+clamp((y-bounds[segment])/Math.max(1,bounds[segment+1]-bounds[segment])))/2);
  if(scene&&!document.hidden&&scrollY<bounds[2]+chapters[2].offsetHeight&&!frame)frame=requestAnimationFrame(draw);
 };
 const draw=()=>{
  frame=0;
  if(!scene||document.hidden)return;
  if(reduced.matches||small.matches){void sync();return;}
  position+=(target-position)*.12;scene.draw(position);
  document.body.dataset.filmScene=String(Math.min(2,Math.round(position*2)));
  if(Math.abs(position-target)>.0001)frame=requestAnimationFrame(draw);
 };
 const sync=async()=>{
  if(disposed)return;
  if(reduced.matches||small.matches){stop();scene?.dispose();scene=null;document.body.dataset.filmRenderer='static';return;}
  if(!scene&&!loading){
   loading=true;
   try{
    if(!records){const response=await fetch(SOURCE,{cache:'force-cache'});if(!response.ok)throw Error('Trial records unavailable');const data=await response.json();records=data.ranked;}
    if(!Array.isArray(records)||!records.length||records.some(r=>!Number.isFinite(r.annualized_sharpe)))throw Error('Trial observations incomplete');
    if(disposed||reduced.matches||small.matches)return;
    scene=createArchive(canvas,records);
    if(!scene)return;
    document.body.dataset.filmRenderer='webgl';document.body.dataset.filmSource=SOURCE;document.body.dataset.filmIdentities=String(records.length);
    measure();update();
   }catch{document.body.dataset.filmRenderer='static';}finally{loading=false;}
  }else if(document.hidden)stop();else update();
 };
 const resize=()=>{measure();update();if(scene&&!frame&&!document.hidden)frame=requestAnimationFrame(draw);};
 const lost=e=>{e.preventDefault();stop();scene=null;document.body.dataset.filmRenderer='static';};
 // A preference change can collapse the entire pinned chapter. Observe the
 // canvas as well as media events so cleanup completes after that reflow.
 const responsive=new ResizeObserver(()=>{measure();void sync();});
 responsive.observe(canvas);
 const cleanup=()=>{disposed=true;stop();responsive.disconnect();scene?.dispose();scene=null;removeEventListener('scroll',update);removeEventListener('resize',resize);removeEventListener('pagehide',cleanup);document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);small.removeEventListener('change',sync);canvas.removeEventListener('webglcontextlost',lost);};
 addEventListener('scroll',update,{passive:true});addEventListener('resize',resize);addEventListener('pagehide',cleanup,{once:true});
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);small.addEventListener('change',sync);canvas.addEventListener('webglcontextlost',lost);
 measure();await sync();
}
