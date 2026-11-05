export const DEVICE_FIELDS = [
 ['serial','Serial number',['serialnumber','serial','serialno','sn']],
 ['chip','Readout chip ID',['readoutchipid','readoutid','chipid']],
 ['thickness','Sensor thickness',['sensorthickness','thickness']],
 ['sensorClass','Sensor class',['sensorclass']],
 ['condition','Condition',['condition','devicecondition']],
 ['cable','Extension USB cable',['extensionusbcable','usbextensioncable']],
 ['destination','Destination',['destination','shipto']],
 ['packingDate','Packing date',['packingdate','datepacked']],
 ['usb','USB stick',['usbstick','usbstickpresent']],
 ['guide','Starter guide',['starterguide','starterguidepresent']],
 ['comments','Comments',['comments','comment','notes']],
];
export const DEVICE_HEADERS = DEVICE_FIELDS.map(([,label]) => label);
export const REQUIRED_ACCESSORIES = ['Extension USB cable'];
const key = value => String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
const identity = value => String(value ?? '').normalize('NFC').trim().toUpperCase();
export function deviceColumns(headers) {
 return Object.fromEntries(DEVICE_FIELDS.map(([name,,aliases]) => [name,headers.findIndex(h=>aliases.includes(key(h)))]));
}
export function presence(value) {
 const normalized=String(value??'').trim().toLowerCase();
 if(['yes','true','1'].includes(normalized))return true;
 if(['','no','false','0'].includes(normalized))return false;
 throw new Error('Presence fields must contain Yes or No (true/false and 1/0 are also accepted).');
}
export function localDate(date = new Date()) {
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function validDate(value) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00');
 return !Number.isNaN(date.getTime())&&localDate(date)===value;
}
export function validateDeviceFields(headers, rows, requireChip = false) {
 const cols=deviceColumns(headers);
 if(requireChip&&cols.chip<0)throw new Error('Include a Readout chip ID column. Download the CSV template from Files.');
 const chips=new Map();
 for(let i=0;i<rows.length;i++){
  const cells=rows[i], line=i+2, chip=cols.chip>=0?identity(cells[cols.chip]):'';
  if(requireChip&&!chip)throw new Error('Missing readout chip ID on CSV line '+line+'.');
  if(chip){
   if(chips.has(chip))throw new Error('Duplicate readout chip ID "'+cells[cols.chip]+'" on lines '+chips.get(chip)+' and '+line+'.');
   chips.set(chip,line);
  }
  if(cols.condition>=0&&cells[cols.condition].trim()&&!['OK','BAD'].includes(identity(cells[cols.condition])))throw new Error('Condition must be OK or BAD on CSV line '+line+'.');
  if(cols.sensorClass>=0&&cells[cols.sensorClass].trim()&&!['A','B','C'].includes(identity(cells[cols.sensorClass])))throw new Error('Sensor class must be A, B, or C on CSV line '+line+'.');
  for(const field of ['cable','usb','guide'])if(cols[field]>=0){try{presence(cells[cols[field]]);}catch{throw new Error('Use Yes or No for '+DEVICE_FIELDS.find(([name])=>name===field)[1]+' on CSV line '+line+'.');}}
  if(cols.packingDate>=0&&cells[cols.packingDate].trim()&&!validDate(cells[cols.packingDate].trim()))throw new Error('Packing date must be a valid YYYY-MM-DD date on CSV line '+line+'.');
 }
}
export function packingIssue(workspace,row) {
 const c=deviceColumns(workspace.headers);
 if(!row.cells[workspace.destinationColumn]?.trim())return 'Enter a destination first.';
 if(c.chip>=0&&!row.cells[c.chip].trim())return 'Enter the readout chip ID.';
 if(c.thickness>=0&&!row.cells[c.thickness].trim())return 'Enter the sensor thickness.';
 if(c.sensorClass>=0&&!['A','B','C'].includes(row.cells[c.sensorClass]))return 'Select sensor class A, B, or C.';
 if(c.condition>=0&&!['OK','BAD'].includes(row.cells[c.condition]))return 'Select condition OK or BAD.';
 if(!row.confirmed)return 'Confirm the destination before marking this device packed.';
 if(workspace.accessories.some(x=>!row.checked.includes(x)))return 'Include the extension USB cable before marking this device packed.';
 return '';
}
// Preserve original columns and values. Missing standard fields are appended.
// Older packing lists remain available; incomplete packed rows reopen for review.
export function upgradeWorkspace(workspace) {
 if(!workspace.rows.length)return {...workspace,accessories:[...REQUIRED_ACCESSORIES]};
 const headers=[...workspace.headers];
 let cols=deviceColumns(headers);
 const additions=[];
 for(const [name,label] of DEVICE_FIELDS){
  if(name==='serial'||name==='destination'||cols[name]>=0)continue;
  additions.push(label);headers.push(label);
 }
 cols=deviceColumns(headers);
 const rows=workspace.rows.map(row=>{
  const cells=[...row.cells,...additions.map(()=> '')];
  for(const name of ['condition','sensorClass'])if(cells[cols[name]])cells[cols[name]]=identity(cells[cols[name]]);
  const cable=presence(cells[cols.cable])||(!row.cells[cols.cable]&&row.checked.includes(REQUIRED_ACCESSORIES[0]));
  cells[cols.cable]=cable?'Yes':'No';
  cells[cols.usb]=presence(cells[cols.usb])?'Yes':'No';
  cells[cols.guide]=presence(cells[cols.guide])?'Yes':'No';
  const next={...row,cells,checked:cable?[...REQUIRED_ACCESSORIES]:[]};
  const updated={...workspace,headers,accessories:[...REQUIRED_ACCESSORIES]};
  if(next.status==='packed'&&(packingIssue(updated,next)||!cells[cols.packingDate]))next.status='in-progress';
  return next;
 });
 return {...workspace,headers,rows,accessories:[...REQUIRED_ACCESSORIES],deviceSchema:1};
}
export function writePackingFields(workspace,row,packed,now=new Date()) {
 const cols=deviceColumns(workspace.headers),cells=[...row.cells];
 if(cols.cable>=0)cells[cols.cable]=row.checked.includes(REQUIRED_ACCESSORIES[0])?'Yes':'No';
 for(const name of ['usb','guide'])if(cols[name]>=0)cells[cols[name]]=presence(cells[cols[name]])?'Yes':'No';
 if(cols.packingDate>=0&&packed&&(row.status!=='packed'||!cells[cols.packingDate]))cells[cols.packingDate]=localDate(now);
 return {...row,cells,status:packed?'packed':'in-progress',updatedAt:now.toISOString()};
}
export const TEMPLATE = DEVICE_HEADERS.join(',')+'\r\n';
export const DEVICE_SAMPLE = TEMPLATE+
 '3680,F06-W0316,300um,A,OK,No,Germany,,No,No,\r\n'+
 '3681,F07-W0316,300um,B,OK,No,Netherlands,,No,No,\r\n'+
 '3682,F08-W0316,500um,C,BAD,No,Switzerland,,No,No,';
export function restoreColumnMapping(workspace) {
 const columns=deviceColumns(workspace.headers);
 const serialColumn=columns.serial>=0?columns.serial:workspace.serialColumn;
 const destinationColumn=columns.destination>=0?columns.destination:workspace.destinationColumn;
 if(serialColumn===workspace.serialColumn&&destinationColumn===workspace.destinationColumn)return workspace;
 return {...workspace,serialColumn,destinationColumn,rows:workspace.rows.map(row=>({...row,confirmed:false,status:row.status==='packed'?'in-progress':row.status}))};
}
export function indexDevices(workspace) {
 const index=new Map(),chip=deviceColumns(workspace.headers).chip;
 for(const row of workspace.rows){
  const identifiers=new Set([row.cells[workspace.serialColumn],chip>=0?row.cells[chip]:''].map(identity).filter(Boolean));
  for(const value of identifiers){
   if(!index.has(value))index.set(value,[]);
   index.get(value).push(row);
  }
 }
 return index;
}