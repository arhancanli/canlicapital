import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptOrigin} from './receipt-origin.js';
import {Readable} from 'node:stream';
import {validatorHandler} from './handler.js';
import {createReceiptHandler} from '../v1/receipts/[id].js';
test('production and local receipt origin remain unchanged',()=>{
 assert.equal(receiptOrigin({}),'https://canlicapital.com');
 assert.equal(receiptOrigin({VERCEL_ENV:'production',VERCEL_URL:'other.vercel.app'}),'https://canlicapital.com');
});
test('preview receipt origin stays on its own deployment',()=>{
 assert.equal(receiptOrigin({VERCEL_ENV:'preview',VERCEL_URL:'meridian-example-team.vercel.app'}),'https://meridian-example-team.vercel.app');
});
test('invalid or absent preview configuration never falls back to production',()=>{
 for(const value of [undefined,'','https://a.vercel.app','canlicapital.com','a.vercel.app.evil.test','user@a.vercel.app','a.vercel.app/path','a.vercel.app:443'])
  assert.throws(()=>receiptOrigin({VERCEL_ENV:'preview',VERCEL_URL:value}));
});
test('validator receipt and badge links stay isolated with mocked storage',async()=>{
 const previous={VERCEL_ENV:process.env.VERCEL_ENV,VERCEL_URL:process.env.VERCEL_URL};
 process.env.VERCEL_ENV='preview';process.env.VERCEL_URL='canli-isolation-test.vercel.app';
 try {
  let saved;
  const store={consumeQuota:async()=>({remaining:99}),saveReceipt:async row=>{saved=row;},getReceipt:async()=>saved};
  const res=()=>({statusCode:0,setHeader(){},end(body){this.body=JSON.parse(body);}});
  const req=Readable.from([Buffer.from('{"x":2}')]);req.method='POST';req.headers={authorization:'Bearer ck_live_mocked',host:'canlicapital.com'};
  const result=res();await validatorHandler({endpoint:'validate/breadth',sourcesPaths:['js/breadth-core.js'],compute:body=>({x:body.x}),store})(req,result);
  assert.equal(result.statusCode,200);
  const url=`https://canli-isolation-test.vercel.app/api/v1/receipts/${saved.id}`;
  assert.equal(result.body.receipt.url,url);
  const read=res();await createReceiptHandler({store})({method:'GET',query:{id:saved.id},headers:{host:'evil.test'}},read);
  assert.equal(read.statusCode,200);assert.equal(read.body.data.badge_url,url+'/badge.svg');
  const certificate=`https://canli-isolation-test.vercel.app/audit/${saved.id}`;
  assert.equal(read.body.data.certificate_url,certificate);
  assert.equal(read.body.data.embed_markdown,`[![Canli receipt](${url}/badge.svg)](${certificate})`);
 } finally {for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
