import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,makeWorkspace,validateMapping,normalizeSerial,exportCsv,validateWorkspace,finishRecord,META,SAMPLE} from '../src/core.js';
import {DEVICE_HEADERS,TEMPLATE,deviceColumns,upgradeWorkspace,localDate,indexDevices} from '../src/device-schema.js';
const CSV=DEVICE_HEADERS.join(',')+',Original column\r\n'+
 '000123,F06-W0316,300um,A,OK,No,Berlin,,No,No,"hello, world",keep\r\n'+
 'SN-2,F07-W0316,300um,B,BAD,No,Paris,,Yes,No,"Line one\nLine two",preserve';
const create=(csv=CSV)=>{const p=parseCsv(csv);return makeWorkspace(p,p.serialColumn,p.destinationColumn,'devices.csv');};
const ready=(w,index=0)=>({...w.rows[index],confirmed:true,checked:[...w.accessories]});

test('template has the requested ordered fields and no current location',()=>{
 assert.deepEqual(DEVICE_HEADERS,['Serial number','Readout chip ID','Sensor thickness','Sensor class','Condition','Extension USB cable','Destination','Packing date','USB stick','Starter guide','Comments']);
 assert.equal(TEMPLATE,DEVICE_HEADERS.join(',')+'\r\n');assert.equal(create(SAMPLE).rows.length,3);
});
test('CSV preserves IDs, quoted comments, newlines and unknown original columns',()=>{
 const w=create(),c=deviceColumns(w.headers);
 assert.equal(w.rows[0].cells[0],'000123');assert.equal(w.rows[0].cells[c.chip],'F06-W0316');
 assert.equal(w.rows[0].cells[c.comments],'hello, world');assert.equal(w.rows[1].cells[c.comments],'Line one\nLine two');
 const p=parseCsv(exportCsv(w,false));assert.deepEqual(p.headers,[...w.headers,...META]);
 assert.deepEqual(p.rows.map(r=>r.slice(0,w.headers.length)),w.rows.map(r=>r.cells));
});
test('serial numbers and chip IDs are independently unique after normalization',()=>{
 assert.equal(normalizeSerial(' ab-01 '),'AB-01');
 assert.throws(()=>create('Serial,Destination,Readout chip ID\nAB-01,Berlin,F01\n ab-01 ,Paris,F02'),/Duplicate serial.*lines 2 and 3/);
 assert.throws(()=>create('Serial,Destination,Readout chip ID\nA,Berlin,F01\nB,Paris, f01 '),/Duplicate readout chip ID.*lines 2 and 3/);
 assert.throws(()=>create('Serial,Destination,Readout chip ID\nA,Berlin,'),/Missing readout chip ID/);
 assert.throws(()=>create('Serial,Destination\nA,Berlin'),/Readout chip ID column/);
});
test('condition, sensor class, presence and calendar dates reject invalid values',()=>{
 for(const [from,to,message] of [
  [',A,OK,',',D,OK,',/Sensor class/],
  [',A,OK,',',A,BROKEN,',/Condition/],
  [',No,Berlin,',',maybe,Berlin,',/Yes or No/],
  [',Berlin,,',',Berlin,2026-02-30,',/Packing date/],
 ])assert.throws(()=>create(CSV.replace(from,to)),message);
 assert.equal(create().rows[0].cells[2],create().rows[1].cells[2],'repeated sensor thickness is allowed');
});
test('malformed CSV and ambiguous mapping are rejected',()=>{
 for(const csv of ['', 'Serial,Destination\nA', 'Serial,Serial\nA,B', 'Serial,Destination\n"A,B'])assert.throws(()=>create(csv));
 const p=parseCsv(SAMPLE);assert.throws(()=>makeWorkspace(p,0,0,'x'),/different columns/);
});
test('formula protection covers cells and headers; exact mode retains originals',()=>{
 const w=create('Serial,Destination,Readout chip ID,=HEADER\n0001,Berlin,F01,=SUM(A1)');
 const exact=parseCsv(exportCsv(w,false));assert.equal(exact.headers[3],'=HEADER');assert.equal(exact.rows[0][3],'=SUM(A1)');
 const safe=parseCsv(exportCsv(w));assert.equal(safe.headers[3],"'=HEADER");assert.equal(safe.rows[0][3],"'=SUM(A1)");
 w.rows[0].cells[3]='  @malicious';assert.equal(parseCsv(exportCsv(w)).rows[0][3],"'  @malicious");
});
test('untrusted HTML and prototype-like columns remain literal text',()=>{
 const w=create('Serial,Destination,Readout chip ID,__proto__,Notes\n0001,<script>alert(1)</script>,F01,prototype,<img src=x onerror=alert(1)>');
 assert.equal(w.rows[0].cells[3],'prototype');assert.deepEqual(parseCsv(exportCsv(w,false)).rows[0].slice(0,5),w.rows[0].cells.slice(0,5));
});
test('only the extension cable is a required accessory; media presence is independent',()=>{
 const w=create(),c=deviceColumns(w.headers);
 assert.deepEqual(w.accessories,['Extension USB cable']);
 assert.throws(()=>finishRecord(w,w.rows[0],true),/Confirm/);
 assert.throws(()=>finishRecord(w,{...w.rows[0],confirmed:true},true),/extension USB cable/);
 const packed=finishRecord(w,ready(w),true);
 assert.equal(packed.cells[c.cable],'Yes');assert.equal(packed.cells[c.usb],'No');assert.equal(packed.cells[c.guide],'No');
 const missingClass=ready(w);missingClass.cells=[...missingClass.cells];missingClass.cells[c.sensorClass]='';
 assert.throws(()=>finishRecord(w,missingClass,true),/sensor class/);
 assert.equal(finishRecord(w,ready(w,1),true).cells[c.condition],'BAD','BAD condition is recorded without silently rewriting it');
});
test('packing date uses the local calendar date and changes only on packing transitions',()=>{
 const w=create(),c=deviceColumns(w.headers),today=new Date(2026,9,16,23,59),tomorrow=new Date(2026,9,17,1);
 assert.equal(finishRecord(w,ready(w),false,today).cells[c.packingDate],'');
 const packed=finishRecord(w,ready(w),true,today);assert.equal(packed.cells[c.packingDate],'2026-10-16');
 assert.equal(packed.updatedAt,today.toISOString());assert.equal(localDate(today),'2026-10-16');
 w.rows[0]=packed;
 const edited=finishRecord(w,packed,true,tomorrow);assert.equal(edited.cells[c.packingDate],'2026-10-16');
 const reopened=finishRecord(w,packed,false,tomorrow);assert.equal(reopened.cells[c.packingDate],'2026-10-16');
 assert.equal(finishRecord(w,reopened,true,tomorrow).cells[c.packingDate],'2026-10-17');
});
test('editing a chip ID cannot duplicate another device',()=>{
 const w=create(),row=ready(w),c=deviceColumns(w.headers);
 row.cells=[...row.cells];row.cells[c.chip]=' f07-w0316 ';
 assert.throws(()=>finishRecord(w,row,false),/Duplicate readout chip ID/);
});
test('CSV metadata and all device fields round-trip after packing',()=>{
 const w=create(),c=deviceColumns(w.headers);w.rows[0]=finishRecord(w,ready(w),true,new Date(2026,9,16));
 const p=parseCsv(exportCsv(w,false)),restored=makeWorkspace(p,p.serialColumn,p.destinationColumn,'export.csv');
 assert.equal(restored.rows[0].status,'packed');assert.equal(restored.rows[0].cells[c.packingDate],'2026-10-16');assert.deepEqual(restored.rows[0].checked,w.accessories);
 assert.equal(restored.rows[0].cells[c.chip],'F06-W0316');
});
test('JSON validation rejects forged state, missing dates and mismatched cable presence',()=>{
 const w=create();assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(w))),w);
 const forged=structuredClone(w);forged.rows[0].status='packed';assert.throws(()=>validateWorkspace(forged),/Packed records/);
 w.rows[0]=finishRecord(w,ready(w),true);const c=deviceColumns(w.headers);
 const noDate=structuredClone(w);noDate.rows[0].cells[c.packingDate]='';assert.throws(()=>validateWorkspace(noDate),/packing date/);
 const cable=structuredClone(w);cable.rows[0].cells[c.cable]='No';assert.throws(()=>validateWorkspace(cable),/does not match/);
 const duplicate=structuredClone(w);duplicate.rows[1].id=duplicate.rows[0].id;assert.throws(()=>validateWorkspace(duplicate),/Invalid device/);
 assert.throws(()=>validateWorkspace({version:1}),/valid Packlane/);
});
test('older saved inventories retain original columns and comments during upgrade',()=>{
 const legacy={version:1,revision:4,headers:['Serial','Destination','Notes','Asset'],serialColumn:0,destinationColumn:1,accessories:['Power adapter'],filename:'old.csv',activity:[],rows:[{id:'1',cells:['3680','CERN','Keep this comment','asset-01'],checked:['Power adapter'],confirmed:true,status:'packed',updatedAt:'2026-10-15T12:00:00.000Z'}]};
 const upgraded=upgradeWorkspace(validateWorkspace(legacy));
 assert.deepEqual(upgraded.headers.slice(0,4),legacy.headers);assert.deepEqual(upgraded.rows[0].cells.slice(0,4),legacy.rows[0].cells);
 assert.deepEqual(upgraded.accessories,['Extension USB cable']);assert.equal(upgraded.rows[0].status,'in-progress');assert.equal(upgraded.rows[0].cells[deviceColumns(upgraded.headers).comments],'Keep this comment');
 assert.deepEqual(validateWorkspace(upgraded),upgraded);
});
test('oversized files and repeated headers remain rejected',()=>{
 assert.throws(()=>parseCsv('a'.repeat(10*1024*1024+1)),/10 MB/);
 assert.throws(()=>create('Serial,Destination,Notes,Notes\nA,B,C,D'),/unique/);
});
test('3680 and F06-W0316 are device identifiers, never inferred as destination columns',()=>{
 const p=parseCsv(SAMPLE);
 assert.equal(p.serialColumn,0);assert.equal(p.destinationColumn,6);
 assert.equal(p.rows[0][p.serialColumn],'3680');
 assert.equal(p.rows[0][deviceColumns(p.headers).chip],'F06-W0316');
 assert.equal(p.rows[0][p.destinationColumn],'Germany');
 assert.throws(()=>validateMapping(p,1,0),/Serial number identifies/);
 assert.throws(()=>validateMapping(p,0,1),/Readout chip ID identifies/);
 assert.throws(()=>validateMapping(p,0,4),/Destination column/);
 const noDestination=parseCsv('Serial number,Readout chip ID,Comments\n3680,F06-W0316,example');
 assert.equal(noDestination.destinationColumn,-1,'missing destination must not default to the serial column');
});
test('lookup supports either unique identifier and exposes cross-identifier ambiguity',()=>{
 const w=create(SAMPLE),index=indexDevices(w);
 assert.equal(index.get('3680')[0].cells[0],'3680');
 assert.equal(index.get(normalizeSerial(' f06-w0316 '))[0].cells[0],'3680');
 assert.equal(index.get('NOT-A-DEVICE'),undefined);
 const conflict=structuredClone(w);conflict.rows[1].cells[deviceColumns(w.headers).chip]='3680';
 assert.equal(indexDevices(conflict).get('3680').length,2,'ambiguous matches must not pick a device silently');
});
test('saved mapping mistakes are repaired without changing original serial, chip or destination cells',()=>{
 const w=create(SAMPLE),packed=finishRecord(w,ready(w),true);
 const wrong={...w,serialColumn:1,destinationColumn:0,rows:[packed,...w.rows.slice(1)]};
 const repaired=validateWorkspace(wrong);
 assert.equal(repaired.serialColumn,0);assert.equal(repaired.destinationColumn,6);
 assert.deepEqual(repaired.rows[0].cells,packed.cells);
 assert.equal(repaired.rows[0].confirmed,false);assert.equal(repaired.rows[0].status,'in-progress');
});