import {REQUIRED_ACCESSORIES, DEVICE_SAMPLE, deviceColumns, validateDeviceFields, packingIssue, upgradeWorkspace, writePackingFields, restoreColumnMapping} from './device-schema.js';
import Papa from 'papaparse';

export const DEFAULT_ACCESSORIES = [...REQUIRED_ACCESSORIES];
export const META = ['__packlane_status', '__packlane_accessories', '__packlane_confirmed', '__packlane_updated'];
export const MAX_ROWS = 20000;
export const MAX_FILE = 10 * 1024 * 1024;
export const normalizeSerial = value => String(value ?? '').normalize('NFC').trim().toUpperCase();
export const emptyWorkspace = () => ({version: 1, revision: 0, headers: [], rows: [], serialColumn: 0, destinationColumn: 1, accessories: [...DEFAULT_ACCESSORIES], filename: '', importedAt: '', activity: []});

export function parseCsv(text) {
  if (typeof text !== 'string' || text.length > MAX_FILE) throw new Error('Choose a CSV smaller than 10 MB.');
  const result = Papa.parse(text.replace(/^\uFEFF/, ''), {skipEmptyLines: 'greedy'});
  if (result.errors.length) throw new Error('Invalid CSV: ' + result.errors[0].message);
  const [headers, ...rows] = result.data;
  if (!headers || headers.length < 2 || !rows.length) throw new Error('Include a header row and at least one device, with serial and destination columns.');
  if (headers.length > 120 || rows.length > MAX_ROWS) throw new Error('The limit is 120 columns and 20,000 devices.');
  if (headers.some(h => !h.trim()) || new Set(headers).size !== headers.length) throw new Error('Column headers must be non-empty and unique.');
  if (rows.some(r => r.length !== headers.length)) throw new Error('Each row must have the same number of columns as the header.');
  if ([headers, ...rows].some(row => row.some(cell => cell.length > 10000 || /\u0000/.test(cell)))) throw new Error('A field contains invalid data or exceeds 10,000 characters.');
  return {
    headers, rows,
    serialColumn: Math.max(0, deviceColumns(headers).serial),
    destinationColumn: deviceColumns(headers).destination,
  };
}
export function validateMapping(parsed, serialColumn, destinationColumn) {
  const columns=deviceColumns(parsed.headers);
  if(destinationColumn===columns.chip&&columns.chip>=0)throw new Error('Readout chip ID identifies the device and cannot be the destination.');
  if(destinationColumn===columns.serial&&columns.serial>=0&&serialColumn!==destinationColumn)throw new Error('Serial number identifies the device and cannot be the destination.');
  if(columns.serial>=0&&serialColumn!==columns.serial)throw new Error('Use the Serial number column for the device serial number.');
  if(serialColumn===columns.chip&&columns.chip>=0)throw new Error('Chip ID and serial number are separate identifiers. Select the serial number column.');
  if (!Number.isInteger(serialColumn) || !Number.isInteger(destinationColumn) || serialColumn === destinationColumn || !parsed.headers[serialColumn] || !parsed.headers[destinationColumn]) throw new Error('Choose two different columns for serial number and destination.');
  if(columns.destination>=0&&destinationColumn!==columns.destination)throw new Error('Use the Destination column for destinations.');
  if (META.some(h => [parsed.headers[serialColumn], parsed.headers[destinationColumn]].includes(h))) throw new Error('Packing metadata cannot be used as a serial or destination column.');
  const seen = new Map();
  for (let i = 0; i < parsed.rows.length; i++) {
    const serial = normalizeSerial(parsed.rows[i][serialColumn]);
    if (!serial) throw new Error('Missing serial number on CSV line ' + (i + 2) + '.');
    if (seen.has(serial)) throw new Error('Duplicate serial "' + parsed.rows[i][serialColumn] + '" on lines ' + seen.get(serial) + ' and ' + (i + 2) + '. Correct duplicates before importing.');
    seen.set(serial, i + 2);
  }
}
export function makeWorkspace(parsed, serialColumn, destinationColumn, filename, requiredAccessories = DEFAULT_ACCESSORIES) {
  validateMapping(parsed, serialColumn, destinationColumn);
  const positions = META.map(h => parsed.headers.indexOf(h));
  const accessories = new Set(requiredAccessories);
  validateDeviceFields(parsed.headers, parsed.rows, true);
  const rows = parsed.rows.map((cells, i) => {
    let checked = [];
    if (positions[1] >= 0 && cells[positions[1]]) {
      try { checked = JSON.parse(cells[positions[1]]); } catch { throw new Error('Invalid accessory metadata on line ' + (i + 2) + '.'); }
      if (!Array.isArray(checked) || checked.length > 30 || checked.some(x => typeof x !== 'string' || !x.trim() || x.length > 80)) throw new Error('Invalid accessory metadata on line ' + (i + 2) + '.');
      // Only the configured checklist defines required accessories.
    }
    const status = positions[0] >= 0 ? cells[positions[0]] : '';
    if (status && !['pending', 'in-progress', 'packed'].includes(status)) throw new Error('Invalid packing status on line ' + (i + 2) + '. Reserved __packlane_ columns must contain Packlane metadata.');
    const confirmed = positions[2] >= 0 && cells[positions[2]] === 'true';
    return {id: String(i + 1), cells: [...cells], checked: checked.filter(x => accessories.has(x)), confirmed, status: status === 'packed' && confirmed && cells[destinationColumn].trim() ? 'packed' : (status && status !== 'pending' ? 'in-progress' : 'pending'), updatedAt: positions[3] >= 0 ? cells[positions[3]] : ''};
  });
  if (accessories.size > 30) throw new Error('A database can contain at most 30 accessory types.');
  const required = [...accessories];
  rows.forEach(row => { if (row.status === 'packed' && required.some(x => !row.checked.includes(x))) row.status = 'in-progress'; });
  return upgradeWorkspace({...emptyWorkspace(), headers: parsed.headers, rows, serialColumn, destinationColumn, accessories: [...REQUIRED_ACCESSORIES], filename, importedAt: new Date().toISOString()});
}
export function exportCsv(workspace, protect = true) {
  const headers = [...workspace.headers];
  for (const h of META) if (!headers.includes(h)) headers.push(h);
  const data = workspace.rows.map(row => {
    const cells = [...row.cells];
    const metadata = [row.status, JSON.stringify(row.checked), String(row.confirmed), row.updatedAt];
    META.forEach((h, i) => { cells[headers.indexOf(h)] = metadata[i]; });
    return cells;
  });
  return '\uFEFF' + Papa.unparse({fields: headers, data}, {newline: '\r\n', escapeFormulae: protect ? /^[\s]*[=+\-@\t\r]/ : false});
}
export function validateWorkspace(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.headers) || !Array.isArray(data.rows) || !Array.isArray(data.accessories) || !Number.isInteger(data.revision) || data.revision < 0 || typeof data.filename !== 'string') throw new Error('This is not a valid Packlane backup.');
  if (!data.rows.length && !data.headers.length) return {...emptyWorkspace(), revision: data.revision};
  if (data.headers.length > 120 || data.headers.length < 2 || data.headers.some(x => typeof x !== 'string' || !x.trim() || x.length > 10000) || new Set(data.headers).size !== data.headers.length || data.rows.length > MAX_ROWS) throw new Error('Invalid backup structure.');
  if (data.accessories.length > 30 || new Set(data.accessories).size !== data.accessories.length || data.accessories.some(x => typeof x !== 'string' || !x.trim() || x.length > 80)) throw new Error('Invalid accessory list.');
  const ids = new Set();
  for (const row of data.rows) {
    if (!row || typeof row.id !== 'string' || ids.has(row.id) || !Array.isArray(row.cells) || row.cells.length !== data.headers.length || row.cells.some(x => typeof x !== 'string' || x.length > 10000 || /\u0000/.test(x)) || !Array.isArray(row.checked) || row.checked.some(x => !data.accessories.includes(x)) || typeof row.confirmed !== 'boolean' || !['pending', 'in-progress', 'packed'].includes(row.status) || typeof row.updatedAt !== 'string') throw new Error('Invalid device record in backup.');
    if (row.status === 'packed' && (!row.confirmed || !row.cells[data.destinationColumn]?.trim() || data.accessories.some(x => !row.checked.includes(x)))) throw new Error('Packed records must have a confirmed destination and all accessories.');
    ids.add(row.id);
  }
  data=restoreColumnMapping(data);
  validateMapping({headers: data.headers, rows: data.rows.map(r => r.cells)}, data.serialColumn, data.destinationColumn);
  validateDeviceFields(data.headers, data.rows.map(r => r.cells));
  if(data.deviceSchema===1){
   const columns=deviceColumns(data.headers);
   for(const field of ['chip','thickness','sensorClass','condition','cable','packingDate','usb','guide','comments'])if(columns[field]<0)throw new Error('Missing standard device field in backup.');
   for(const row of data.rows){
    if((row.cells[columns.cable]==='Yes')!==row.checked.includes('Extension USB cable'))throw new Error('Extension USB cable presence does not match the packing checklist.');
    if(row.status==='packed'&&!row.cells[columns.packingDate])throw new Error('Packed records must have a packing date.');
   }
  }
  if(data.deviceSchema===1)for(const row of data.rows)if(row.status==='packed'&&packingIssue(data,row))throw new Error('Packed records must include valid device details, a confirmed destination, and the extension USB cable.');
  return {...data, activity: Array.isArray(data.activity) ? data.activity.filter(x => x && typeof x.text === 'string' && typeof x.time === 'string').slice(0, 20) : []};
}
export function finishRecord(workspace, row, packed, now = new Date()) {
 if(!row.cells[workspace.destinationColumn].trim())throw new Error('Enter a destination first.');
 if(packed){const issue=packingIssue(workspace,row);if(issue)throw new Error(issue);}
 const saved=writePackingFields(workspace,row,packed,now);
 validateDeviceFields(workspace.headers,workspace.rows.map(r=>r.id===row.id?saved.cells:r.cells));
 return saved;
}
export const SAMPLE = DEVICE_SAMPLE;