import {DEVICE_HEADERS,deviceColumns,localDate} from '../src/device-schema.js';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseCsv,validateWorkspace,SAMPLE} from '../src/core.js';

const root=path.resolve('dist'),artifacts=path.resolve('.artifacts','timepix-check-'+Date.now());
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'packlane-qa-'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith('/packlane/')){res.writeHead(404).end();return;}
  const relative=pathname.slice('/packlane/'.length)||'index.html';
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/packlane/';
const chromePath=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome=spawn(chromePath,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
let socket,id=0;const pending=new Map(),errors=[],requests=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(action,label,timeout=15000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){try{const result=await action();if(result)return result;}catch{}await sleep(80);}
 throw new Error('Timed out: '+label);
}
function send(method,params={}){
 return new Promise((resolve,reject)=>{
  const call=++id,timeout=setTimeout(()=>{pending.delete(call);reject(new Error('CDP timeout: '+method));},20000);
  pending.set(call,{resolve,reject,timeout});socket.send(JSON.stringify({id:call,method,params}));
 });
}
async function evaluate(expression){
 const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
 return result.result.value;
}
async function clickText(text,selector='button'){
 await evaluate("(()=>{const b=[...document.querySelectorAll("+JSON.stringify(selector)+")].find(x=>x.textContent.trim()==="+JSON.stringify(text)+");if(!b)throw Error('Missing button');b.click();return true;})()");
}
async function setInput(selector,value){
 await evaluate("(()=>{const i=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(i.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:i.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(i,"+JSON.stringify(value)+");i.dispatchEvent(new Event(i.tagName==='SELECT'?'change':'input',{bubbles:true}));})()");
 await sleep(100);
}
async function reload(){const previous=await evaluate('performance.timeOrigin');await send('Page.reload');await waitFor(()=>evaluate('performance.timeOrigin>'+previous+'&&document.readyState==='+JSON.stringify('complete')),'navigation complete');}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(path.join(artifacts,name),Buffer.from(r.data,'base64'));}
try{
 const port=await waitFor(async()=>(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0],'Chrome start');
 const targets=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());
 socket=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{
  const data=JSON.parse(event.data);
  if(data.id){const p=pending.get(data.id);if(p){clearTimeout(p.timeout);pending.delete(data.id);data.error?p.reject(new Error(data.error.message)):p.resolve(data.result);}}
  if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);
  if(data.method==='Network.requestWillBeSent')requests.push(data.params.request.url);
 });
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts});
 await send('Page.navigate',{url});
 await waitFor(()=>evaluate("document.querySelector('.sample-button')&&!document.querySelector('.sample-button').disabled"),'workspace ready');
 await waitFor(()=>evaluate("document.querySelector('.page-footer').textContent.includes('Available offline')"),'service worker precache');
 const cacheUrls=await evaluate("caches.keys().then(async keys=>(await Promise.all(keys.map(async k=>(await (await caches.open(k)).keys()).map(r=>r.url)))).flat())");
 assert(cacheUrls.some(x=>x.includes('qr-scanner-worker')),'decoder worker cached');
 await waitFor(()=>evaluate('navigator.serviceWorker.controller!==null'),'service worker control');
 assert.equal(await evaluate("document.querySelector('.project-logo').naturalWidth>0"),true);
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.primary')).backgroundColor"),'rgb(23, 188, 186)');
 assert(cacheUrls.some(x=>x.includes('timepix-school-logo.png')),'logo cached');
 assert(cacheUrls.some(x=>x.includes('timepix-template.csv')),'CSV template cached');
 await screenshot('desktop-empty.png');
 console.log('PASS production app, repository subpath, CSP and offline decoder precache');
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await reload();
 await waitFor(()=>evaluate("document.querySelector('.sample-button')&&!document.querySelector('.sample-button').disabled"),'offline reload');
 await evaluate("document.querySelector('.sample-button').click()");
 await waitFor(()=>evaluate("!!document.querySelector('[role=dialog]')"),'import preview');
 await clickText('Import 3 devices');
 await waitFor(()=>evaluate("document.querySelectorAll('.inventory-table tbody tr').length===3"),'sample import');
 console.log('PASS offline reload and mapped CSV import');
 await setInput('.manual-entry input',' f06-w0316 ');
 await evaluate("document.querySelector('.manual-entry').requestSubmit()");
 await waitFor(()=>evaluate("document.querySelector('.modal-header h2')?.textContent==='Serial number 3680'"),'lookup by chip ID');
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Readout chip ID\"]').value"),'F06-W0316');
 assert.equal(await evaluate("[...document.querySelector('[aria-label=Destination]').options].some(o=>['3680','F06-W0316'].includes(o.textContent))"),false,'device IDs do not appear as destinations');
 await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
 console.log('PASS serial 3680 and chip F06-W0316 identify the same device, separately from destination');
 await setInput('.manual-entry input',' 3680 ');
 await evaluate("document.querySelector('.manual-entry').requestSubmit()");
 await waitFor(()=>evaluate("document.querySelector('.modal-header h2')?.textContent==='Serial number 3680'"),'manual serial lookup');
 assert.equal(await evaluate("[...document.querySelectorAll('.modal button')].find(x=>x.textContent==='Mark as packed').disabled"),true);
 assert.equal(await evaluate("[...document.querySelector('[aria-label=Destination]').options].some(o=>o.textContent==='Netherlands')"),true,'CSV destinations are selectable');
 await setInput('[aria-label=Destination]','new');
 await setInput('[aria-label="New destination"]','Berlin Dispatch');
 await setInput('[aria-label=Comments]','Checked before shipment');
 await evaluate("document.querySelectorAll('.modal input[type=checkbox]').forEach(x=>x.click())");
 await sleep(100);await clickText('Mark as packed');
 await waitFor(()=>evaluate("!document.querySelector('[role=dialog]')"),'packing save');
 assert.equal(await evaluate("document.querySelectorAll('.inventory-table .status.packed').length"),1);
 console.log('PASS normalized serial entry, edited destination, confirmed checklist and atomic packing save');
 // A destination saved on one device is immediately selectable for another.
 await setInput('.manual-entry input','3681');
 await evaluate("document.querySelector('.manual-entry').requestSubmit()");
 await waitFor(()=>evaluate("document.querySelector('.modal-header h2')?.textContent==='Serial number 3681'"),'second device lookup');
 const savedOption=await evaluate("[...document.querySelector('[aria-label=Destination]').options].find(o=>o.textContent==='Berlin Dispatch')?.value");
 assert.notEqual(savedOption,undefined,'newly saved destination offered for reuse');
 await setInput('[aria-label=Destination]',savedOption);
 assert.equal(await evaluate("document.querySelector('[aria-label=\"New destination\"]')===null"),true,'existing destinations need no typing');
 await clickText('Save progress');
 await waitFor(()=>evaluate("!document.querySelector('[role=dialog]')"),'reused destination saved');
 console.log('PASS imported destinations, add-new destination, and reuse on another device');
 await evaluate("document.querySelector('.file-menu').open=true");
 await clickText('Export CSV','.file-options button');

 const csvName=await waitFor(async()=>(await readdir(artifacts)).find(x=>x.endsWith('.csv')),'CSV download');
 const exported=parseCsv(await readFile(path.join(artifacts,csvName),'utf8'));
 const columns=deviceColumns(exported.headers);
 assert.equal(exported.rows[0][columns.destination],'Berlin Dispatch');
 assert.equal(exported.rows[1][columns.destination],'Berlin Dispatch','reused destination exported');
 assert.equal(exported.rows[0][columns.chip],'F06-W0316');
 assert.equal(exported.rows[0][columns.thickness],'300um');
 assert.equal(exported.rows[0][columns.sensorClass],'A');
 assert.equal(exported.rows[0][columns.condition],'OK');
 assert.equal(exported.rows[0][columns.cable],'Yes');
 assert.equal(exported.rows[0][columns.usb],'Yes');
 assert.equal(exported.rows[0][columns.guide],'Yes');
 assert.equal(exported.rows[0][columns.comments],'Checked before shipment');
 assert.equal(exported.rows[0][columns.packingDate],localDate());
 assert.equal(exported.rows[0][exported.headers.indexOf('__packlane_status')],'packed');
 assert.deepEqual(exported.headers.slice(0,DEVICE_HEADERS.length),DEVICE_HEADERS);
 await evaluate("document.querySelector('.file-menu').open=true");
 await clickText('Backup & recovery','.file-options button');
 await clickText('Download backup');
 const backupName=await waitFor(async()=>(await readdir(artifacts)).find(x=>x.endsWith('.json')),'JSON download');
 const backup=validateWorkspace(JSON.parse(await readFile(path.join(artifacts,backupName),'utf8')));
 assert.equal(backup.rows[0].status,'packed');assert.equal(backup.rows[0].cells[deviceColumns(backup.headers).destination],'Berlin Dispatch');
 await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
 await reload();
 await waitFor(()=>evaluate("document.querySelectorAll('.inventory-table tbody tr').length===3"),'IndexedDB reload');
 assert.equal(await evaluate("document.querySelectorAll('.inventory-table .status.packed').length"),1);
 await setInput('.manual-entry input','3680');await evaluate("document.querySelector('.manual-entry').requestSubmit()");
 await waitFor(()=>evaluate("document.querySelector('.toast')?.textContent.includes('Duplicate scan')"),'duplicate scan warning');
 await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
 await setInput('.manual-entry input','3681');
 await evaluate("document.querySelector('.manual-entry').requestSubmit()");
 await waitFor(()=>evaluate("document.querySelector('.modal-header h2')?.textContent==='Serial number 3681'"),'reused destination after reload');
 assert.equal(await evaluate("document.querySelector('[aria-label=Destination]').selectedOptions[0].textContent"),'Berlin Dispatch');
 assert.equal(await evaluate("[...document.querySelector('[aria-label=Destination]').options].filter(o=>o.textContent==='Berlin Dispatch').length"),1,'repeated destinations listed once');
 await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
 console.log('PASS reusable destinations persist after reload and duplicate choices are removed');
 console.log('PASS CSV original columns, JSON backup, persistence after reload and duplicate scan detection');
 // Import a malformed database; verify rejection leaves the saved inventory intact.
 await evaluate("(()=>{const dt=new DataTransfer();dt.items.add(new File(['Serial,Destination\\nDUP,Berlin\\n dup ,Paris'],'duplicate.csv',{type:'text/csv'}));const i=document.querySelector('input[accept=\".csv,text/csv\"]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await waitFor(()=>evaluate("document.querySelector('.modal .inline-error')?.textContent.includes('Duplicate serial')"),'duplicate import rejection');
 assert.equal(await evaluate("document.querySelectorAll('.inventory-table tbody tr').length"),3);
 await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
 const duplicateChips=SAMPLE.replace('F07-W0316',' f06-w0316 ');
 await evaluate("(()=>{const dt=new DataTransfer();dt.items.add(new File(["+JSON.stringify(duplicateChips)+"],'duplicate-chip.csv',{type:'text/csv'}));const i=document.querySelector('input[accept=\".csv,text/csv\"]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await waitFor(()=>evaluate("document.querySelector('.modal .inline-error')?.textContent.includes('Duplicate readout chip ID')"),'duplicate chip rejected');
 assert.equal(await evaluate("document.querySelectorAll('.inventory-table tbody tr').length"),3);
 await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
 console.log('PASS requested device fields, presence columns, automatic packing date and duplicate chip rejection');
 await clickText('Device list','[role=tab]');
 await evaluate("document.querySelector('.toast button')?.click()");
 const headings=await evaluate("[...document.querySelectorAll('.overview-table th')].map(x=>x.textContent)");
 for(const heading of ['Serial number','Readout chip ID','Sensor','Condition','Destination','Packed contents','Packing date','Comments'])assert(headings.includes(heading),'overview column '+heading);
 const summary=await evaluate("(()=>{const r=document.querySelector('.overview-table tr[data-serial=\"3680\"]');return {serial:r.querySelector('[data-device-field=serial]').textContent.trim(),chip:r.querySelector('[data-device-field=chip]').textContent,destination:r.querySelector('[data-device-field=destination]').textContent,contents:r.querySelector('.contents-list').textContent,comments:r.querySelector('.overview-comments').textContent};})()");
 assert.equal(summary.serial,'3680');assert.equal(summary.chip,'F06-W0316');assert.equal(summary.destination,'Berlin Dispatch');
 for(const label of ['Extension USB cable','USB stick','Starter guide'])assert(summary.contents.includes(label));
 assert.equal(summary.comments,'Checked before shipment');
 await setInput('[aria-label="Filter condition"]','BAD');
 await waitFor(()=>evaluate("document.querySelectorAll('.overview-table tbody tr').length===1"),'BAD condition filter');
 assert.equal(await evaluate("document.querySelector('.overview-table tbody tr').dataset.serial"),'3682');
 await setInput('[aria-label="Filter condition"]','');
 await setInput('[aria-label="Filter destination"]','destination:Berlin Dispatch');
 await waitFor(()=>evaluate("document.querySelectorAll('.overview-table tbody tr').length===2"),'destination filter');
 await setInput('[aria-label="Filter destination"]','all');
 await setInput('[aria-label="Search inventory"]','F06-W0316');
 await waitFor(()=>evaluate("document.querySelectorAll('.overview-table tbody tr').length===1"),'search by chip ID');
 assert.equal(await evaluate("document.querySelector('.overview-table tbody tr').dataset.serial"),'3680');
 await setInput('[aria-label="Search inventory"]','');
 await waitFor(()=>evaluate("document.querySelectorAll('.overview-table tbody tr').length===3"),'filters reset');
 await evaluate("document.querySelector('.overview-table tr[data-serial=\"3680\"] .overview-edit').click()");
 await waitFor(()=>evaluate("document.querySelector('.modal-header h2')?.textContent==='Serial number 3680'"),'edit from overview');
 await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
 console.log('PASS comprehensive contents overview, explicit identity columns, condition/destination filters, chip search and edit action');
 await screenshot('desktop-inventory.png');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await sleep(150);
 assert.equal(await evaluate("document.documentElement.scrollWidth<=390"),true,'no phone page overflow');
 assert.equal(await evaluate("document.querySelectorAll('.view-tabs button').length"),2);
 await evaluate("document.querySelector('.toast button')?.click();window.scrollTo(0,0)");
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.inventory-cards')).display"),'grid');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.comprehensive-table')).display"),'none');
 assert.equal(await evaluate("document.querySelector('.device-card[data-serial=\"3680\"] [data-device-field=destination]').textContent"),'Berlin Dispatch');
 await screenshot('mobile-inventory.png');
 await evaluate("document.querySelector('.device-card[data-serial=\"3680\"] .overview-edit').click()");
 await waitFor(()=>evaluate("document.querySelector('.modal-header h2')?.textContent==='Serial number 3680'"),'phone edit action');
 await screenshot('mobile-device-editor.png');
 await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
 await clickText('Scan','[role=tab]');
 await screenshot('mobile-scan.png');
 // Camera failure must leave manual entry usable, without a stream.
 await evaluate("navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Permission denied','NotAllowedError'))");
 await clickText('Start scanning');
 await waitFor(()=>evaluate("document.querySelector('.scanner-panel .inline-error')?.textContent.includes('Camera unavailable')"),'camera fallback');
 assert.equal(await evaluate("document.querySelector('.manual-entry input').disabled"),false);
 assert.equal(errors.length,0,JSON.stringify(errors));
 assert.equal(requests.filter(x=>/^https?:/.test(x)&&!x.startsWith(url)).length,0,'no external application requests');
 console.log('PASS phone layout, camera permission fallback, no runtime exceptions and no external app requests');
 console.log('Screenshots and exported QA fixtures: '+artifacts);
}catch(error){
 console.error('Browser errors:',JSON.stringify(errors));
 try{console.error(await evaluate('document.body.innerText'));await screenshot('failure.png');}catch{}
 throw error;
}finally{
 socket?.close();for(const p of pending.values())clearTimeout(p.timeout);
 chrome.kill();await new Promise(resolve=>server.close(resolve));await sleep(500);
 // The only recursively removed directory is this run's resolved temp profile.
 const resolved=path.resolve(profile),prefix=path.resolve(tmpdir())+path.sep+'packlane-qa-';
 if(resolved.startsWith(prefix))await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:300}).catch(()=>{});
}