import React from 'react';
import {deviceColumns,presence} from './device-schema.js';
import {STATUS} from './components.jsx';

function PackedContents({row,columns}){
 return <dl className="contents-list">{[['cable','Extension USB cable'],['usb','USB stick'],['guide','Starter guide']].map(([field,label])=>{
  const included=presence(row.cells[columns[field]]);
  return <div key={field} data-content={field}><dt>{label}</dt><dd className={included?'included':'not-included'}>{included?'Yes':'No'}</dd></div>;
 })}</dl>;
}
function Condition({value}){
 return <span className={'device-condition '+(value==='BAD'?'bad':value==='OK'?'ok':'unknown')}>{value||'Not set'}</span>;
}
export default function DeviceOverview({workspace,rows,onEdit}){
 const columns=deviceColumns(workspace.headers);
 const value=(row,field)=>row.cells[columns[field]]||'';
 return <>
  <div className="inventory-table-wrap comprehensive-table" tabIndex={0} role="region" aria-label="Device overview table">
   <table className="inventory-table overview-table">
    <caption className="sr-only">Device identifiers, sensor details, destination, packed contents, packing date and comments</caption>
    <thead><tr><th scope="col">Serial number</th><th scope="col">Readout chip ID</th><th scope="col">Sensor</th><th scope="col">Condition</th><th scope="col">Destination</th><th scope="col">Packed contents</th><th scope="col">Status</th><th scope="col">Packing date</th><th scope="col">Comments</th><th scope="col">Action</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.id} data-serial={row.cells[workspace.serialColumn]}>
     <td data-device-field="serial"><button className="record-link" onClick={()=>onEdit(row)} aria-label={'Edit serial '+row.cells[workspace.serialColumn]}>{row.cells[workspace.serialColumn]}</button></td>
     <td data-device-field="chip"><code className="chip-identifier">{value(row,'chip')||'Not set'}</code></td>
     <td><strong className="sensor-thickness">{value(row,'thickness')||'Not set'}</strong><span className="sensor-class">Class {value(row,'sensorClass')||'not set'}</span></td>
     <td><Condition value={value(row,'condition')}/></td>
     <td data-device-field="destination">{row.cells[workspace.destinationColumn]||'Not assigned'}</td>
     <td><PackedContents row={row} columns={columns}/></td>
     <td><span className={'status '+row.status}>{STATUS[row.status]}</span></td>
     <td className="overview-date">{value(row,'packingDate')||'Not packed'}</td>
     <td><p className="overview-comments" title={value(row,'comments')}>{value(row,'comments')||'No comments'}</p></td>
     <td><button className="button secondary overview-edit" onClick={()=>onEdit(row)} aria-label={'Edit details for serial '+row.cells[workspace.serialColumn]}>Edit</button></td>
    </tr>)}</tbody>
   </table>
  </div>
  <div className="inventory-cards">{rows.map(row=><article className="device-card" key={row.id} data-serial={row.cells[workspace.serialColumn]} aria-label={'Device serial '+row.cells[workspace.serialColumn]}>
   <header className="device-card-header">
    <div><span className="overview-label">Serial number</span><button className="record-link" data-device-field="serial" onClick={()=>onEdit(row)}>{row.cells[workspace.serialColumn]}</button><span className="card-chip"><span>Readout chip ID</span><code data-device-field="chip">{value(row,'chip')||'Not set'}</code></span></div>
    <span className={'status '+row.status}>{STATUS[row.status]}</span>
   </header>
   <dl className="card-device-details">
    <div><dt>Sensor thickness</dt><dd>{value(row,'thickness')||'Not set'}</dd></div>
    <div><dt>Sensor class</dt><dd>{value(row,'sensorClass')||'Not set'}</dd></div>
    <div><dt>Condition</dt><dd><Condition value={value(row,'condition')}/></dd></div>
    <div><dt>Destination</dt><dd data-device-field="destination">{row.cells[workspace.destinationColumn]||'Not assigned'}</dd></div>
   </dl>
   <div className="card-contents"><h3>Packed contents</h3><PackedContents row={row} columns={columns}/></div>
   <div className="card-comments"><h3>Comments</h3><p className="overview-comments">{value(row,'comments')||'No comments'}</p></div>
   <footer className="device-card-footer"><div><span className="overview-label">Packing date</span><span className="overview-date">{value(row,'packingDate')||'Not packed'}</span></div><button className="button secondary overview-edit" onClick={()=>onEdit(row)} aria-label={'Edit details for serial '+row.cells[workspace.serialColumn]}>Edit details</button></footer>
  </article>)}</div>
 </>;
}