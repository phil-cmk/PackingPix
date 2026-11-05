import {deviceColumns, validateDeviceFields, packingIssue, presence} from './device-schema.js';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import QrScanner from 'qr-scanner';
import Icon from './icons.jsx';
import {META, validateMapping, finishRecord} from './core.js';
export const STATUS = {pending:'To pack', 'in-progress':'In progress', packed:'Packed'};
export function download(content, name, type) {
 const url = URL.createObjectURL(new Blob([content], {type}));
 const a = document.createElement('a'); a.href = url; a.download = name; a.click();
 setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function Modal({title, subtitle, children, onClose, wide = false}) {
 const ref = useRef(null), closeRef = useRef(onClose); closeRef.current = onClose;
 useEffect(() => {
  const previous = document.activeElement, overflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const items = () => [...ref.current.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(x => !x.disabled && x.offsetParent !== null);
  (items()[0] || ref.current).focus();
  function key(e) {
   if(e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
   if(e.key === 'Tab') {
    const list = items(); if(!list.length) { e.preventDefault(); return; }
    if(e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1).focus(); }
    else if(!e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0].focus(); }
   }
  }
  document.addEventListener('keydown',key);
  return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown',key); previous?.focus(); };
 },[]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget) onClose();}}><section className={'modal '+(wide?'modal-wide':'')} role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref} tabIndex={-1}><header className="modal-header"><div><h2 id="dialog-title">{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></header>{children}</section></div>;
}
export function Scanner({enabled,onResult,notify}) {
 const video=useRef(null), scanner=useRef(null), callbacks=useRef({onResult,notify}), last=useRef(null); callbacks.current={onResult,notify};
 const [active,setActive]=useState(false),[starting,setStarting]=useState(false),[error,setError]=useState(''),[flash,setFlash]=useState(false),[canFlash,setCanFlash]=useState(false),[serial,setSerial]=useState('');
 function stop(){scanner.current?.destroy();scanner.current=null;setActive(false);setStarting(false);setFlash(false);setCanFlash(false);}
 useEffect(()=>{if(!enabled)stop();},[enabled]);
 useEffect(()=>{const visibility=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',visibility);return()=>{document.removeEventListener('visibilitychange',visibility);scanner.current?.destroy();};},[]);
 async function start(){
  if(!enabled||starting)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setError('Camera access needs HTTPS or localhost. Enter a serial below.');return;}
  setError('');setStarting(true);last.current=null;
  const instance=new QrScanner(video.current,result=>{if(result.data===last.current)return;last.current=result.data;stop();callbacks.current.onResult(result.data);},{preferredCamera:'environment',maxScansPerSecond:8,returnDetailedScanResult:true});
  scanner.current=instance;
  try{await instance.start();if(scanner.current!==instance)return;setActive(true);setStarting(false);setCanFlash(await instance.hasFlash());}
  catch{if(scanner.current===instance)stop();setError('Camera unavailable. Allow camera access in your browser, or enter a serial below.');}
 }
 return <section className="scanner-panel" id="scanner">
  <div className="panel-title"><h2>Scan a device</h2></div>
  <div className={'viewfinder '+(active?'camera-active':'')}>
   <video ref={video} muted playsInline className={active||starting?'video-visible':''} aria-label="Live QR scanner"/>
   {!active&&!starting&&<div className="scan-placeholder"><Icon name="scan" size={52}/><span>Scan the QR code on your device.</span></div>}
   {active&&<><div className="scan-reticle"/><span className="camera-label">Position the QR code inside the frame</span></>}
   {starting&&<span className="camera-label">Opening camera...</span>}
  </div>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  <button className="button primary" disabled={!enabled||starting} onClick={active?stop:start}><Icon name={active?'close':'camera'} size={18}/>{starting?'Opening camera...':active?'Stop scanning':'Start scanning'}</button>
  {active&&canFlash&&<button className="text-button" onClick={async()=>{try{await scanner.current.toggleFlash();setFlash(scanner.current.isFlashOn());}catch{callbacks.current.notify('Flashlight unavailable.','error');}}}>{flash?'Flashlight off':'Flashlight on'}</button>}
  <div className="divider-label"><span/>or enter a serial number or chip ID<span/></div>
  <form className="manual-entry" onSubmit={e=>{e.preventDefault();if(serial.trim()){stop();callbacks.current.onResult(serial);}}}>
   <input aria-label="Serial number or chip ID" maxLength={10000} placeholder="3680 or F06-W0316" value={serial} onChange={e=>setSerial(e.target.value)} disabled={!enabled}/>
   <button type="submit" disabled={!enabled||!serial.trim()}>Find<Icon name="arrow" size={16}/></button>
  </form>
  <p className="scanner-footnote">QR codes are read locally. No images are saved.</p>
 </section>;
}
export function ImportDialog({draft,workspace,busy,onClose,onImport}){
 const [serial,setSerial]=useState(draft.parsed.serialColumn);
 const [destination,setDestination]=useState(draft.parsed.destinationColumn);
 const [replace,setReplace]=useState(false);
 let issue='';
 try{validateMapping(draft.parsed,serial,destination);validateDeviceFields(draft.parsed.headers,draft.parsed.rows,true);}catch(e){issue=e.message;}
 return <Modal title="Import device list" subtitle={draft.filename+' - '+draft.parsed.rows.length+' devices'} onClose={onClose}>
  <div className="modal-body">
   <div className="two-columns">
    <label>Serial number column<select disabled={busy} value={serial} onChange={e=>setSerial(Number(e.target.value))}>{draft.parsed.headers.map((h,i)=><option key={h} value={i} disabled={i===deviceColumns(draft.parsed.headers).chip||i===deviceColumns(draft.parsed.headers).destination}>{h}</option>)}</select><span className="label-hint">Example: {draft.parsed.rows[0]?.[serial]||'not set'}</span></label>
    <label>Destination column<select disabled={busy} value={destination} onChange={e=>setDestination(Number(e.target.value))}><option value={-1} disabled>Choose destination column</option>{draft.parsed.headers.map((h,i)=><option key={h} value={i} disabled={i===serial||i===deviceColumns(draft.parsed.headers).serial||i===deviceColumns(draft.parsed.headers).chip}>{h}</option>)}</select><span className="label-hint">Example: {draft.parsed.rows[0]?.[destination]||'not set'}</span></label>
   </div>
   <p className="muted">Serial numbers and readout chip IDs must each be unique. The only required accessory is an extension USB cable.</p>
   {workspace.rows.length>0&&<label className="check-card caution"><input type="checkbox" disabled={busy} checked={replace} onChange={e=>setReplace(e.target.checked)}/><span>Replace the current {workspace.rows.length} devices. A recovery copy will be kept.</span></label>}
   {issue&&<p className="inline-error" role="alert">{issue}</p>}
   <p className="muted">All original columns are kept. Packing dates are filled automatically when a device is marked as packed.</p>
  </div>
  <footer className="modal-footer"><button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy||!!issue||(workspace.rows.length>0&&!replace)} onClick={()=>onImport(serial,destination,['Extension USB cable'])}>{busy?'Importing...':'Import '+draft.parsed.rows.length+' devices'}</button></footer>
 </Modal>;
}
export function RecordDialog({workspace,original,busy,onClose,onSave,onDirty}){
 const destinations=useMemo(()=>[...new Set(workspace.rows.map(row=>row.cells[workspace.destinationColumn].trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[workspace]);
 const [customDestination,setCustomDestination]=useState(()=>!original.cells[workspace.destinationColumn].trim());
 const [draft,setDraft]=useState(()=>structuredClone(original));
 const [error,setError]=useState('');
 const c=deviceColumns(workspace.headers);
 const changed=JSON.stringify(draft)!==JSON.stringify(original);
 useEffect(()=>{onDirty(changed);return()=>onDirty(false);},[changed,onDirty]);
 const complete=!packingIssue(workspace,draft);
 function close(){if(!busy&&(!changed||window.confirm('Discard unsaved changes?')))onClose();}
 function edit(index,value){setDraft(prev=>({...prev,cells:prev.cells.map((cell,i)=>i===index?value:cell),confirmed:index===workspace.destinationColumn?false:prev.confirmed}));}
 async function save(packed){try{setError('');await onSave(finishRecord(workspace,draft,packed));}catch(e){setError(e.message);}}
 const known=new Set([...Object.values(c),workspace.serialColumn,workspace.destinationColumn]);
 const extras=workspace.headers.map((h,i)=>({h,i})).filter(({h,i})=>!known.has(i)&&!META.includes(h));
 return <Modal title={'Serial number '+original.cells[workspace.serialColumn]} subtitle="Device and packing details" onClose={close}>
  <div className="modal-body">
   {original.status==='packed'&&<p className="notice">Already packed. Save progress to reopen this device.</p>}
   <div className="two-columns">
    <label>Readout chip ID<input aria-label="Readout chip ID" disabled={busy} value={draft.cells[c.chip]??''} maxLength={10000} placeholder="F06-W0316" onChange={e=>edit(c.chip,e.target.value)}/></label>
    <label>Sensor thickness<input aria-label="Sensor thickness" disabled={busy} value={draft.cells[c.thickness]??''} maxLength={10000} placeholder="300um" onChange={e=>edit(c.thickness,e.target.value)}/></label>
    <label>Sensor class<select aria-label="Sensor class" disabled={busy} value={draft.cells[c.sensorClass]??''} onChange={e=>edit(c.sensorClass,e.target.value)}><option value="">Choose class</option>{['A','B','C'].map(value=><option key={value}>{value}</option>)}</select></label>
    <label>Condition<select aria-label="Condition" disabled={busy} value={draft.cells[c.condition]??''} onChange={e=>edit(c.condition,e.target.value)}><option value="">Choose condition</option><option>OK</option><option>BAD</option></select></label>
   </div>
   <label>Destination
    <select aria-label="Destination" disabled={busy} value={customDestination?'new':String(destinations.indexOf(draft.cells[workspace.destinationColumn].trim()))} onChange={e=>{
     const isNew=e.target.value==='new';
     setCustomDestination(isNew);
     edit(workspace.destinationColumn,isNew?'':destinations[Number(e.target.value)]);
    }}>
     {destinations.map((destination,i)=><option key={destination} value={String(i)}>{destination}</option>)}
     <option value="new">Add a new destination...</option>
    </select>
   </label>
   {customDestination&&<label>New destination<input aria-label="New destination" disabled={busy} placeholder="Enter a new destination" value={draft.cells[workspace.destinationColumn]} maxLength={10000} onChange={e=>edit(workspace.destinationColumn,e.target.value)}/></label>}
   <label className="check-card"><input type="checkbox" disabled={busy} checked={draft.confirmed} onChange={e=>{const confirmed=e.target.checked;setDraft(prev=>({...prev,confirmed}));}}/><span>Destination confirmed</span></label>
   <div className="checklist-heading"><h3>Accessory</h3></div>
   <label className={'accessory '+(draft.checked.includes('Extension USB cable')?'checked':'')}><input aria-label="Extension USB cable" type="checkbox" disabled={busy} checked={draft.checked.includes('Extension USB cable')} onChange={e=>{const checked=e.target.checked;setDraft(prev=>({...prev,checked:checked?['Extension USB cable']:[]}));}}/><span>Extension USB cable</span></label>
   <div className="checklist-heading"><h3>Also included</h3><span>Record presence</span></div>
   {[['usb','USB stick'],['guide','Starter guide']].map(([field,label])=><label className="accessory" key={field}><input aria-label={label} type="checkbox" disabled={busy} checked={presence(draft.cells[c[field]])} onChange={e=>edit(c[field],e.target.checked?'Yes':'No')}/><span>{label}</span></label>)}
   <label>Comments<textarea aria-label="Comments" disabled={busy} rows={2} maxLength={10000} value={draft.cells[c.comments]??''} onChange={e=>edit(c.comments,e.target.value)}/></label>
   <p className="muted packing-date">Packing date: <output aria-label="Packing date">{draft.cells[c.packingDate]||'added automatically when packed'}</output></p>
   {!!extras.length&&<details className="record-details"><summary>Other original columns</summary><div className="details-fields">{extras.map(({h,i})=><label key={h}>{h}<textarea disabled={busy} rows={2} maxLength={10000} value={draft.cells[i]} onChange={e=>edit(i,e.target.value)}/></label>)}</div></details>}
   {error&&<p className="inline-error" role="alert">{error}</p>}
   {changed&&<p className="save-hint"><span className="unsaved-dot"/>Unsaved changes</p>}
  </div>
  <footer className="modal-footer"><button className="button secondary" disabled={busy} onClick={()=>save(false)}>Save progress</button><button className="button primary" disabled={busy||!complete} onClick={()=>save(true)}><Icon name="check" size={17}/>{busy?'Saving...':'Mark as packed'}</button></footer>
 </Modal>;
}