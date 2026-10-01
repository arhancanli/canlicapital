import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storeExport } from '../src/journal-export-file.mjs';

const fixture=t=>{const root=fs.mkdtempSync(join(tmpdir(),'canli-export-parent-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const home=join(root,'home'),foreign=join(root,'foreign');fs.mkdirSync(home,{mode:0o700});fs.mkdirSync(foreign,{mode:0o700});return{root,home,foreign};};
const restore=t=>{t.mock.restoreAll();syncBuiltinESMExports();};
test('a shared existing home refuses before creating an artifact directory',t=>{
 const{home}=fixture(t);fs.chmodSync(home,0o755);
 assert.throws(()=>storeExport(home,Buffer.from('synthetic private payload')),/directory must be private/);
 assert.equal(fs.existsSync(join(home,'exports')),false);
});
test('a real directory swap before artifact open refuses before payload write',t=>{
 const{home,foreign}=fixture(t),nativeOpen=fs.openSync;let swapped=false;
 t.mock.method(fs,'openSync',(path,...args)=>{
  if(!swapped&&String(path).endsWith('.json')){swapped=true;fs.renameSync(join(home,'exports'),join(home,'previous-exports'));fs.symlinkSync(foreign,join(home,'exports'));}
  return nativeOpen(path,...args);
 });syncBuiltinESMExports();
 try{assert.throws(()=>storeExport(home,Buffer.from('synthetic private payload')),/directory.*changed/);assert.equal(swapped,true);for(const file of fs.readdirSync(foreign))assert.equal(fs.readFileSync(join(foreign,file)).length,0);}
 finally{restore(t);}
});
test('a directory replacement after write refuses and preserves unrelated replacement files',t=>{
 const{home}=fixture(t),nativeWrite=fs.writeFileSync;let replaced=false,sentinel;
 t.mock.method(fs,'writeFileSync',(file,...args)=>{
  const result=nativeWrite(file,...args);
  if(!replaced&&typeof file==='number'){
   replaced=true;const name=fs.readdirSync(join(home,'exports'))[0];fs.renameSync(join(home,'exports'),join(home,'previous-exports'));fs.mkdirSync(join(home,'exports'),{mode:0o700});sentinel=join(home,'exports',name);nativeWrite(sentinel,'unrelated replacement',{mode:0o600});
  }return result;
 });syncBuiltinESMExports();
 try{assert.throws(()=>storeExport(home,Buffer.from('synthetic private payload')),/directory.*changed/);assert.equal(replaced,true);assert.equal(fs.readFileSync(sentinel,'utf8'),'unrelated replacement');}
 finally{restore(t);}
});
test('a same-directory filename replacement refuses and is never removed as cleanup',t=>{
 const{home}=fixture(t),nativeWrite=fs.writeFileSync;let replaced=false,sentinel;
 t.mock.method(fs,'writeFileSync',(file,...args)=>{
  const result=nativeWrite(file,...args);
  if(!replaced&&typeof file==='number'){replaced=true;sentinel=join(home,'exports',fs.readdirSync(join(home,'exports'))[0]);fs.unlinkSync(sentinel);nativeWrite(sentinel,'unrelated replacement',{mode:0o600});}
  return result;
 });syncBuiltinESMExports();
 try{assert.throws(()=>storeExport(home,Buffer.from('synthetic private payload')),/export file.*changed/);assert.equal(replaced,true);assert.equal(fs.readFileSync(sentinel,'utf8'),'unrelated replacement');}
 finally{restore(t);}
});
