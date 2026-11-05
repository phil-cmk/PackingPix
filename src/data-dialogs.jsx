import React,{useState} from 'react';
import Icon from './icons.jsx';
import {Modal,download} from './components.jsx';
import {emptyWorkspace,validateWorkspace} from './core.js';

export function DataDialog({workspace,ready,canUse,busy,onClose,backup,backupInput,persisted,setPersisted,snapshots,save,activity,notify,installPrompt,setInstallPrompt,offlineReady}){
 const [clearText,setClearText]=useState('');
 return <Modal title="Backup & recovery" onClose={onClose}>
  <div className="modal-body">
   <div className="data-actions">
    <button className="button secondary" disabled={!ready||!workspace.rows.length} onClick={backup}><Icon name="download" size={17}/>Download backup</button>
    <button className="button secondary" disabled={!canUse} onClick={()=>backupInput.current.click()}><Icon name="upload" size={17}/>Restore backup</button>
   </div>
   <p className="muted">Keep a backup before clearing browser data or moving to another device.</p>
   <details className="advanced-options"><summary>More options</summary><div className="details-content">
    <h3 className="mini-heading">Recent recovery copies</h3>
    {!snapshots.length&&<p className="muted">Recovery copies appear after your first saved change.</p>}
    {snapshots.map((snapshot,i)=><div className="snapshot-row" key={i}><div><strong>Previous save {i+1}</strong><p>{snapshot.rows.length} devices, {snapshot.rows.filter(x=>x.status==='packed').length} packed</p></div><button className="text-button" onClick={()=>download(JSON.stringify(snapshot,null,2),'timepix-recovery-'+snapshot.revision+'.json','application/json')}>Download</button><button className="text-button" disabled={!canUse} onClick={async()=>{if(!window.confirm('Replace the current list with this recovery copy?'))return;try{await save(activity(validateWorkspace(snapshot),'Restored recovery copy'),'Recovery copy restored.');onClose();}catch(e){notify(e.message,'error');}}}>Restore</button></div>)}
    <div className="settings-row"><div><h3>Protect local storage</h3><p>{persisted?'Your browser has granted persistent storage.':'Ask your browser to keep your saved data during automatic cleanup.'}</p></div><button className="button secondary" disabled={persisted||busy} onClick={async()=>{const granted=await navigator.storage?.persist?.().catch(()=>false);setPersisted(!!granted);notify(granted?'Local storage protected.':'Storage protection was not granted. Keep regular backups.',granted?'success':'info');}}>{persisted?'Protected':'Request protection'}</button></div>
    <div className="settings-row"><div><h3>Use offline</h3><p>{offlineReady?'The app is ready for offline use.':'Offline use is available after opening the production app online once.'} {!installPrompt&&'Install from your browser menu, or use Add to Home Screen on iPhone.'}</p></div>{installPrompt&&<button className="button secondary" onClick={async()=>{await installPrompt.prompt();setInstallPrompt(null);}}>Install app</button>}</div>
    <details className="danger-zone"><summary>Clear device list</summary><p>Download a backup first, then type CLEAR. A recovery copy will remain on this device.</p><div className="clear-row"><input aria-label="Type CLEAR to confirm" value={clearText} onChange={e=>setClearText(e.target.value)} placeholder="Type CLEAR"/><button className="button danger-button" disabled={clearText!=='CLEAR'||!canUse} onClick={async()=>{try{await save(emptyWorkspace(),'Device list cleared. A recovery copy was kept.');onClose();}catch(e){notify(e.message,'error');}}}>Clear list</button></div></details>
   </div></details>
  </div>
 </Modal>;
}