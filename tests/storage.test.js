import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {load,commit,getSnapshots} from '../src/storage.js';
import {parseCsv,makeWorkspace,emptyWorkspace} from '../src/core.js';
test('atomic saves, stale-tab protection, recovery retention and clearing',async()=>{
 const initial=await load();assert.equal(initial.revision,0);
 const p=parseCsv('Serial,Destination,Readout chip ID\n0001,Berlin,F06-W0316'),first=await commit(makeWorkspace(p,0,1,'inventory.csv'),0);
 assert.equal(first.revision,1);assert.equal((await load()).rows[0].cells[0],'0001');
 const second=await commit({...first,filename:'updated.csv'},1);
 await assert.rejects(commit({...first,filename:'stale-tab.csv'},1),/Another tab/);assert.equal((await load()).filename,'updated.csv');
 assert.equal((await getSnapshots())[0].filename,'inventory.csv');
 await assert.rejects(commit({...second,rows:[{...second.rows[0],status:'packed'}]},2),/Packed records/);assert.equal((await load()).revision,2);
 let current=second;for(let i=0;i<4;i++)current=await commit({...current,filename:'revision-'+i},current.revision);
 const snapshots=await getSnapshots();assert.equal(snapshots.length,3);assert.equal(snapshots[0].revision,current.revision-1);
 const cleared=await commit(emptyWorkspace(),current.revision);assert.equal(cleared.rows.length,0);assert.equal((await getSnapshots())[0].rows.length,1);
 const restored=await commit((await getSnapshots())[0],cleared.revision);assert.equal((await load()).rows[0].cells[0],'0001');assert.equal(restored.revision,cleared.revision+1);
});