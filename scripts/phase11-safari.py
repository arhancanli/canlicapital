"""Approved synthetic duplicate signup through actual Safari. No email delivery."""
import base64,json,time
from pathlib import Path
from urllib.request import Request,urlopen
out=Path('artifacts/qa/phase11-integration')
report=json.loads((out/'report.json').read_text());assert report['passed'] is True
origin='https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app';assert report['base']==origin
def call(method,path,data=None):
 req=Request('http://127.0.0.1:64411'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method=method)
 with urlopen(req,timeout=30) as r:result=json.load(r)['value']
 if isinstance(result,dict) and result.get('error'):raise RuntimeError(result['error'])
 return result
sid=call('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'safari'}}})['sessionId'];prefix='/session/'+sid
def js(script):return call('POST',prefix+'/execute/sync',{'script':script,'args':[]})
def element(selector):return call('POST',prefix+'/element',{'using':'css selector','value':selector})['element-6066-11e4-a52e-4f735466cecf']
def wait(script):
 deadline=time.monotonic()+25
 while not js(script):
  if time.monotonic()>deadline:raise AssertionError('Safari state timeout')
  time.sleep(.2)
try:
 call('POST',prefix+'/url',{'url':origin})
 wait('return document.readyState==="complete" && !!document.querySelector("#form-status")')
 assert js('return location.origin')==origin
 js("window.phase11Requests=[];const originalFetch=window.fetch;window.fetch=async function(input,init={}){const url=new URL(typeof input==='string'?input:input.url,location.href);const method=init.method||'GET';if(method==='POST'&&(url.origin!==location.origin||url.pathname!=='/api/waitlist'))throw new Error('Unapproved test write blocked');const response=await originalFetch(input,init);if(method==='POST')phase11Requests.push({path:url.pathname,status:response.status});return response;};document.querySelector('#waitlist-form').scrollIntoView({block:'center',behavior:'instant'});")
 field=element('#email');button=element('#waitlist-form button[type=submit]')
 call('POST',prefix+'/element/'+field+'/value',{'text':'invalid'})
 call('POST',prefix+'/element/'+button+'/click',{})
 wait('return document.querySelector("#email").getAttribute("aria-invalid")==="true"')
 assert js('return phase11Requests.length')==0
 call('POST',prefix+'/element/'+field+'/clear',{})
 call('POST',prefix+'/element/'+field+'/value',{'text':'phase11-20260910@example.invalid'})
 call('POST',prefix+'/element/'+button+'/click',{})
 wait('return document.querySelector("#form-status").textContent.startsWith("You\'re on the research update list")')
 assert js('return document.querySelector("#waitlist-form button").disabled') is False
 assert js('return document.querySelector("#email").value')==''
 requests=js('return phase11Requests');assert requests==[{'path':'/api/waitlist','status':200}]
 (out/'safari-signup.png').write_bytes(base64.b64decode(call('GET',prefix+'/screenshot')))
 (out/'safari.json').write_text(json.dumps({'browser':'actual macOS Safari','origin':origin,'invalidInputBlockedBeforeNetwork':True,'duplicateSignupConfirmed':True,'requests':requests,'passed':True},indent=2)+'\n')
 print({'safariSignupChecksPassed':True,'networkSubmissions':1})
finally:call('DELETE',prefix)
