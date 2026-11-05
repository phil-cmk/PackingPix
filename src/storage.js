import {upgradeWorkspace} from './device-schema.js';
import {emptyWorkspace, validateWorkspace} from './core.js';
let dbPromise;
function open() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('packlane-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); dbPromise = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { dbPromise = undefined; reject(request.error); };
    request.onblocked = () => { dbPromise = undefined; reject(new Error('Close other Packlane tabs, then reload.')); };
  });
  return dbPromise;
}
export async function load() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('state', 'readonly');
    const request = transaction.objectStore('state').get('workspace');
    let value;
    request.onsuccess = () => { value = request.result; };
    transaction.oncomplete = () => {
      try { resolve(value ? validateWorkspace(upgradeWorkspace(validateWorkspace(value))) : emptyWorkspace()); } catch (error) { reject(error); }
    };
    transaction.onabort = () => reject(transaction.error);
  });
}
// Revision check, recovery snapshot, and new state share one atomic transaction.
export async function commit(next, expectedRevision) {
  next = validateWorkspace(upgradeWorkspace(validateWorkspace(next)));
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    const store = tx.objectStore('state');
    let saved;
    let reason;
    const request = store.get('workspace');
    request.onsuccess = () => {
      const previous = request.result;
      if ((previous?.revision ?? 0) !== expectedRevision) {
        reason = new Error('Another tab changed this database. Reload before making more changes.');
        tx.abort();
        return;
      }
      const snapshots = store.get('snapshots');
      snapshots.onsuccess = () => {
        if (previous?.rows.length) store.put([previous, ...(snapshots.result || [])].slice(0, 3), 'snapshots');
        saved = {...next, revision: expectedRevision + 1};
        store.put(saved, 'workspace');
      };
    };
    tx.oncomplete = () => resolve(saved);
    tx.onabort = () => reject(reason || tx.error || new Error('Local save failed. Export a backup and try again.'));
  });
}
export async function getSnapshots() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const req = tx.objectStore('state').get('snapshots');
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}