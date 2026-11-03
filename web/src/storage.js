// App metadata is kept outside the playground SQLite database.
const STORE = 'workspaces';
export function openStorage(factory = indexedDB) {
  return new Promise((resolve,reject) => {
    const request = factory.open('sql-playground',1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE,{keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other SQL Playground tabs and reload.'));
  });
}
export function transact(db, mode, operation) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,mode);
    const request = operation(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}
export const listWorkspaces = db => transact(db,'readonly',store=>store.getAll());
export const saveWorkspace = (db,value) => transact(db,'readwrite',store=>store.put(value));
export const deleteWorkspace = (db,id) => transact(db,'readwrite',store=>store.delete(id));
export function newWorkspace(name, sql) {
  return {id:crypto.randomUUID(),name,sql,bytes:null,saved:[],history:[],updatedAt:Date.now()};
}
export function recordHistory(workspace, sql, response) {
  return {...workspace,history:[{id:crypto.randomUUID(),sql,at:Date.now(),error:response.error || null,elapsed:response.elapsed || 0},...workspace.history].slice(0,100)};
}
