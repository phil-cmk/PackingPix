import DeviceOverview from './DeviceOverview.jsx';
import {deviceColumns,indexDevices} from './device-schema.js';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import Icon from './icons.jsx';
import {Scanner,ImportDialog,RecordDialog,STATUS,download} from './components.jsx';
import {DataDialog} from './data-dialogs.jsx';
import {MAX_FILE,SAMPLE,emptyWorkspace,parseCsv,makeWorkspace,normalizeSerial,validateWorkspace,exportCsv} from './core.js';
import {load,commit,getSnapshots} from './storage.js';

export default function App(){
 const [view,setView]=useState('scan');
 const [conditionFilter,setConditionFilter]=useState(''),[destinationFilter,setDestinationFilter]=useState('all');
 const [workspace,setWorkspace]=useState(emptyWorkspace),[ready,setReady]=useState(false),[storageError,setStorageError]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(null),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const [importDraft,setImportDraft]=useState(null),[selected,setSelected]=useState(null),[modal,setModal]=useState(null),[dirty,setDirty]=useState(false),[snapshots,setSnapshots]=useState([]);
 const [online,setOnline]=useState(navigator.onLine),[offlineReady,setOfflineReady]=useState(false),[installPrompt,setInstallPrompt]=useState(null),[persisted,setPersisted]=useState(false);
 const fileInput=useRef(null),backupInput=useRef(null),saving=useRef(false),toastTimer=useRef(null);
 function notify(text,type='success'){clearTimeout(toastTimer.current);setNotice({text,type});toastTimer.current=setTimeout(()=>setNotice(null),6500);}
 useEffect(()=>{
  load().then(value=>{setWorkspace(value);setReady(true);}).catch(e=>setStorageError('Local storage could not be opened: '+e.message));
  const update=()=>setOnline(navigator.onLine),prompt=e=>{e.preventDefault();setInstallPrompt(e);};
  window.addEventListener('online',update);window.addEventListener('offline',update);window.addEventListener('beforeinstallprompt',prompt);
  navigator.storage?.persisted?.().then(setPersisted).catch(()=>{});
  if(import.meta.env.PROD&&'serviceWorker'in navigator){
   navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js').then(registration=>{
    navigator.serviceWorker.ready.then(()=>setOfflineReady(true));
    registration.addEventListener('updatefound',()=>{
     const worker=registration.installing;
     worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&registration.active)notify('An app update is ready. Close all Timepix packing tabs to install it safely.','info');});
    });
   }).catch(()=>notify('Offline installation failed. Your database is still saved locally; keep a backup.','error'));
  }
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);window.removeEventListener('beforeinstallprompt',prompt);clearTimeout(toastTimer.current);};
 },[]);
 useEffect(()=>{const warn=e=>{if(dirty||saving.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 useEffect(()=>{setPage(1);},[search,filter,conditionFilter,destinationFilter]);
 const deviceIndex=useMemo(()=>indexDevices(workspace),[workspace]);
 const packed=workspace.rows.filter(row=>row.status==='packed').length;

 const percent=workspace.rows.length?Math.round(packed/workspace.rows.length*100):0;
 const columns=deviceColumns(workspace.headers);
 const destinations=useMemo(()=>[...new Set(workspace.rows.map(row=>row.cells[workspace.destinationColumn].trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[workspace]);
 const filtered=useMemo(()=>{const query=search.trim().toLocaleLowerCase();return workspace.rows.filter(row=>(filter==='all'||row.status===filter)&&(!conditionFilter||(row.cells[columns.condition]||'')===(conditionFilter==='unset'?'':conditionFilter))&&(destinationFilter==='all'||'destination:'+row.cells[workspace.destinationColumn].trim()===destinationFilter)&&(!query||row.cells.some(x=>x.toLocaleLowerCase().includes(query))));},[workspace,filter,search,conditionFilter,destinationFilter]);
 const pages=Math.max(1,Math.ceil(filtered.length/12));
 useEffect(()=>setPage(p=>Math.min(p,pages)),[pages]);
 async function save(next,message){
  if(saving.current||!ready)throw new Error('Wait for the current save to finish.');
  saving.current=true;setBusy(true);
  try{const saved=await commit(next,workspace.revision);setWorkspace(saved);if(message)notify(message);return saved;}
  finally{saving.current=false;setBusy(false);}
 }
 function activity(next,text){return{...next,activity:[{text,time:new Date().toISOString()},...workspace.activity].slice(0,20)};}
 function findDevice(value){
  if(value.length>10000)return notify('This QR code is too long to be a serial number or chip ID.','error');
  const matches=deviceIndex.get(normalizeSerial(value))||[];
  if(matches.length>1)return notify('This value matches more than one device. Choose the correct serial number from Device list.','error');
  const row=matches[0];
  if(!row)return notify('No device matches "'+value.slice(0,100)+'". Check the serial number or chip ID.','error');
  setSelected(row);if(row.status==='packed')notify('Duplicate scan: this device is already packed.','info');
 }
 function prepareImport(text,filename){try{const parsed=parseCsv(text);setImportDraft({parsed,filename});setModal(null);}catch(e){notify(e.message,'error');}}
 async function readFile(event,backup=false){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(file.size>(backup?50*1024*1024:MAX_FILE))return notify(backup?'Choose a backup smaller than 50 MB.':'Choose a CSV smaller than 10 MB.','error');
  try{const text=await file.text();if(backup){const next=validateWorkspace(JSON.parse(text));if(window.confirm('Restore this backup with '+next.rows.length+' devices? It will replace the current workspace.')){await save(activity(next,'Restored local backup'),'Backup restored on this device.');setModal(null);}}else prepareImport(text,file.name);}
  catch(e){notify(e.message,'error');}
 }
 async function doImport(serial,destination,labels){
  try{const next=makeWorkspace(importDraft.parsed,serial,destination,importDraft.filename,labels);next.accessories=labels;
   next.rows=next.rows.map(row=>({...row,checked:row.checked.filter(x=>labels.includes(x)),status:row.status==='packed'&&labels.some(x=>!row.checked.includes(x))?'in-progress':row.status}));
   await save(activity(next,'Imported '+next.rows.length+' devices'),'Device list imported.');
   setImportDraft(null);setSearch('');setFilter('all');setConditionFilter('');setDestinationFilter('all');setPage(1);setView('scan');
   navigator.storage?.persist?.().then(setPersisted).catch(()=>{});
  }catch(e){notify(e.message,'error');}
 }
 async function saveRecord(row){await save(activity({...workspace,rows:workspace.rows.map(x=>x.id===row.id?row:x)},row.cells[workspace.serialColumn]+(row.status==='packed'?' packed':' updated')),row.status==='packed'?'Device marked as packed.':'Progress saved on this device.');setDirty(false);setSelected(null);}
 async function openData(){try{setSnapshots(await getSnapshots());}catch(e){notify(e.message,'error');}setModal('data');}
 function backup(){download(JSON.stringify(workspace,null,2),'timepix-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json');notify('Backup download started. Keep it somewhere safe.');}
 const canUse=ready&&!busy,anyModal=!!(selected||importDraft||modal);

 function fileAction(action){document.querySelector('.file-menu')?.removeAttribute('open');action();}
 function exportInventory(){download(exportCsv(workspace,true),'timepix-inventory-'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8');notify('CSV download started.');}
 return <div className={'app-shell '+(view==='inventory'&&workspace.rows.length?'inventory-open':'')}>
  <a className="skip-link" href="#main">Skip to packing</a>
  <input className="sr-only" type="file" accept=".csv,text/csv" ref={fileInput} onChange={readFile} tabIndex={-1} aria-label="Import CSV file"/>
  <input className="sr-only" type="file" accept=".json,application/json" ref={backupInput} onChange={e=>readFile(e,true)} tabIndex={-1} aria-label="Restore backup file"/>
  <header className="site-header">
   <div className="header-inner">
    <img className="project-logo" src={import.meta.env.BASE_URL+'timepix-school-logo.png'} width="449" height="315" alt="TIMEPIX at school - a CERN programme"/>

   </div>
  </header>
  <main id="main" className="main-content">
   <div className="page-heading">
    <div><h1>Kit packing</h1><p>Scan a device. Check its destination. Pack its accessories.</p></div>
    <details className="file-menu">
     <summary><Icon name="database" size={17}/>Files<span aria-hidden="true">⌄</span></summary>
     <div className="file-options">
      <a href={import.meta.env.BASE_URL+'timepix-template.csv'} download="timepix-template.csv"><Icon name="download" size={16}/>CSV template</a>
      <button disabled={!canUse} onClick={()=>fileAction(()=>fileInput.current.click())}><Icon name="upload" size={16}/>Import CSV</button>
      <button disabled={!canUse||!workspace.rows.length} onClick={()=>fileAction(exportInventory)}><Icon name="download" size={16}/>Export CSV</button>
      <button onClick={()=>fileAction(openData)}><Icon name="shield" size={16}/>Backup & recovery</button>
     </div>
    </details>
   </div>
   {storageError&&<div className="notice danger" role="alert"><Icon name="info"/><div><p>{storageError} Your saved data has not been overwritten.</p><button className="text-button" onClick={openData}>Open recovery options</button></div></div>}
   {!online&&<p className="offline-notice"><Icon name="wifi" size={15}/>Offline. Changes still save on this device.</p>}
   {!workspace.rows.length?
    <section className="empty-state">
     <div className="empty-icon"><Icon name="box" size={32}/></div>
     <h2>Start with your device list</h2>
     <p>Import your Timepix device CSV to get started.</p>
     <button className="button primary" disabled={!canUse} onClick={()=>fileInput.current.click()}><Icon name="upload" size={18}/>{ready?'Import CSV':storageError?'Storage unavailable':'Opening workspace...'}</button>
     <button className="text-button sample-button" disabled={!canUse} onClick={()=>prepareImport(SAMPLE,'sample-inventory.csv')}>Try a sample list</button>
    </section>:
    <>
     <section className="packing-progress" aria-label="Packing progress">
      <div><p><strong>{packed}</strong> of {workspace.rows.length} devices packed</p><span>{percent}%</span></div>
      <div className="progress-track" role="progressbar" aria-label="Packing completion" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{width:percent+'%'}}/></div>
     </section>
     <div className="view-tabs" role="tablist" aria-label="Packing view">
      <button id="scan-tab" role="tab" aria-selected={view==='scan'} aria-controls="scan-view" tabIndex={view==='scan'?0:-1} onClick={()=>setView('scan')} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){setView('inventory');document.getElementById('inventory-tab').focus();}}}><Icon name="scan" size={17}/>Scan</button>
      <button id="inventory-tab" role="tab" aria-selected={view==='inventory'} aria-controls="inventory-view" tabIndex={view==='inventory'?0:-1} onClick={()=>setView('inventory')} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){setView('scan');document.getElementById('scan-tab').focus();}}}><Icon name="grid" size={17}/>Device list</button>
     </div>
     <div id="scan-view" role="tabpanel" aria-labelledby="scan-tab" hidden={view!=='scan'}>
      <Scanner enabled={canUse&&!anyModal&&view==='scan'} onResult={findDevice} notify={notify}/>
     </div>
     <section className="inventory-panel" id="inventory-view" role="tabpanel" aria-labelledby="inventory-tab" hidden={view!=='inventory'}>
      <div className="overview-heading"><h2>Device overview</h2><span>{filtered.length} of {workspace.rows.length} devices</span></div>
      <div className="inventory-toolbar">
       <label className="search-field"><Icon name="search" size={18}/><input placeholder="Search devices" aria-label="Search inventory" value={search} onChange={e=>setSearch(e.target.value)}/></label>
       <select aria-label="Filter devices" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All devices</option><option value="pending">To pack</option><option value="in-progress">In progress</option><option value="packed">Packed</option></select>
       <select aria-label="Filter condition" value={conditionFilter} onChange={e=>setConditionFilter(e.target.value)}><option value="">All conditions</option><option>OK</option><option>BAD</option><option value="unset">Condition not set</option></select>
       <select aria-label="Filter destination" value={destinationFilter} onChange={e=>setDestinationFilter(e.target.value)}><option value="all">All destinations</option><option value="destination:">Not assigned</option>{destinations.map(destination=><option key={destination} value={'destination:'+destination}>{destination}</option>)}</select>
      </div>
      <DeviceOverview workspace={workspace} rows={filtered.slice((page-1)*12,page*12)} onEdit={setSelected}/>
      {!filtered.length&&<div className="no-results"><p>No matching devices.</p><button className="text-button" onClick={()=>{setSearch('');setFilter('all');setConditionFilter('');setDestinationFilter('all');}}>Show all devices</button></div>}
      {pages>1&&<footer className="table-footer"><span>{(page-1)*12+1}-{Math.min(page*12,filtered.length)} of {filtered.length}</span><div><button className="icon-button" aria-label="Previous page" disabled={page<=1} onClick={()=>setPage(page-1)}>←</button><span>{page} / {pages}</span><button className="icon-button" aria-label="Next page" disabled={page>=pages} onClick={()=>setPage(page+1)}>→</button></div></footer>}
     </section>
    </>}
   <footer className="page-footer"><span className="local-save"><span className="saved-dot"/>{busy?'Saving...':ready?'Saved on this device':'Local storage unavailable'}</span><span>{offlineReady?'Available offline':import.meta.env.DEV?'Local preview':''}</span></footer>
  </main>
  {notice&&<div className={'toast '+notice.type} role={notice.type==='error'?'alert':'status'}><Icon name={notice.type==='error'?'info':'check'} size={18}/><span>{notice.text}</span><button onClick={()=>setNotice(null)} aria-label="Dismiss message"><Icon name="close" size={17}/></button></div>}
  {importDraft&&<ImportDialog draft={importDraft} workspace={workspace} busy={busy} onClose={()=>{if(!busy)setImportDraft(null);}} onImport={doImport}/>}
  {selected&&<RecordDialog key={selected.id} original={selected} workspace={workspace} busy={busy} onClose={()=>setSelected(null)} onSave={saveRecord} onDirty={setDirty}/>}
  {modal==='data'&&<DataDialog workspace={workspace} ready={ready} canUse={canUse} busy={busy} onClose={()=>{if(!busy)setModal(null);}} backup={backup} backupInput={backupInput} fileInput={fileInput} persisted={persisted} setPersisted={setPersisted} snapshots={snapshots} save={save} activity={activity} notify={notify} installPrompt={installPrompt} setInstallPrompt={setInstallPrompt} offlineReady={offlineReady}/>}
 </div>;
}