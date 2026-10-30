// =============================================================
// db.js — Base de datos local (IndexedDB). Todo vive en el iPhone.
//
// Stores:
//   projects : { id, name, client, contractor, location, code, startDate, endDate,
//                categories[], fronts[], levels[], activities[], createdAt, updatedAt }
//   entries  : { id, projectId, date 'YYYY-MM-DD', category, front, level, activity,
//                text, qty, unit, createdAt, updatedAt }
//   days     : { id 'projectId_date', projectId, date, condition, rain:[{from,to}],
//                crew, weatherNote, updatedAt }            ← clima/condiciones del día
//   photos   : { id, entryId, projectId, date, w, h, type, thumb:ArrayBuffer, createdAt }
//   blobs    : { id (= photo.id), data:ArrayBuffer }       ← foto completa (separada para que
//                                                            las listas carguen rápido)
//   settings : { key, value }
// =============================================================

const DB_NAME = 'bitacora-obra';
const DB_VERSION = 1;
let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
        s.createIndex('project_date', ['projectId', 'date']);
      }
      if (!db.objectStoreNames.contains('days')) {
        const s = db.createObjectStore('days', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
        s.createIndex('project_date', ['projectId', 'date']);
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('entryId', 'entryId');
        s.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('IndexedDB bloqueada por otra pestaña');
  });
  return dbPromise;
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Ejecuta fn dentro de una transacción y resuelve cuando la transacción termina. */
async function tx(stores, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transacción cancelada'));
    Promise.resolve(fn(t)).then((v) => { out = v; }).catch((e) => { try { t.abort(); } catch {} reject(e); });
  });
}

// ---------- Genéricos ----------
export const get    = (store, id)      => tx([store], 'readonly',  (t) => reqP(t.objectStore(store).get(id)));
export const put    = (store, obj)     => tx([store], 'readwrite', (t) => { t.objectStore(store).put(obj); return obj; });
export const del    = (store, id)      => tx([store], 'readwrite', (t) => { t.objectStore(store).delete(id); });
export const getAll = (store)          => tx([store], 'readonly',  (t) => reqP(t.objectStore(store).getAll()));
export const byIndex = (store, index, query) =>
  tx([store], 'readonly', (t) => reqP(t.objectStore(store).index(index).getAll(query)));

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

// ---------- Ajustes ----------
export async function getSetting(key, fallback = null) {
  const r = await get('settings', key);
  return r ? r.value : fallback;
}
export const setSetting = (key, value) => put('settings', { key, value });

// ---------- Proyectos ----------
export const listProjects = async () =>
  (await getAll('projects')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

export async function deleteProject(projectId) {
  return tx(['projects', 'entries', 'days', 'photos', 'blobs'], 'readwrite', async (t) => {
    t.objectStore('projects').delete(projectId);
    for (const s of ['entries', 'days']) {
      const keys = await reqP(t.objectStore(s).index('projectId').getAllKeys(projectId));
      keys.forEach((k) => t.objectStore(s).delete(k));
    }
    const pkeys = await reqP(t.objectStore('photos').index('projectId').getAllKeys(projectId));
    pkeys.forEach((k) => { t.objectStore('photos').delete(k); t.objectStore('blobs').delete(k); });
  });
}

// ---------- Registros ----------
/** Registros de un proyecto, opcionalmente entre fechas (inclusive). Orden: más reciente primero. */
export async function entriesByProject(projectId, from = '0000-00-00', to = '9999-99-99') {
  const range = IDBKeyRange.bound([projectId, from], [projectId, to]);
  const rows = await byIndex('entries', 'project_date', range);
  return rows.sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));
}

export async function daysByProject(projectId, from = '0000-00-00', to = '9999-99-99') {
  const range = IDBKeyRange.bound([projectId, from], [projectId, to]);
  return byIndex('days', 'project_date', range);
}
export const dayId = (projectId, date) => `${projectId}_${date}`;
export const getDay = (projectId, date) => get('days', dayId(projectId, date));

/**
 * Guarda un registro con sus fotos nuevas y elimina las marcadas.
 * newPhotos: [{ meta:{...}, full:ArrayBuffer }]
 */
export async function saveEntry(entry, newPhotos = [], removePhotoIds = [], day = null) {
  return tx(['entries', 'photos', 'blobs', 'days'], 'readwrite', (t) => {
    t.objectStore('entries').put(entry);
    for (const p of newPhotos) {
      t.objectStore('photos').put({ ...p.meta, entryId: entry.id, projectId: entry.projectId, date: entry.date });
      t.objectStore('blobs').put({ id: p.meta.id, data: p.full });
    }
    for (const id of removePhotoIds) { t.objectStore('photos').delete(id); t.objectStore('blobs').delete(id); }
    if (day) t.objectStore('days').put(day);
    return entry;
  });
}

export async function deleteEntry(entryId) {
  return tx(['entries', 'photos', 'blobs'], 'readwrite', async (t) => {
    t.objectStore('entries').delete(entryId);
    const keys = await reqP(t.objectStore('photos').index('entryId').getAllKeys(entryId));
    keys.forEach((k) => { t.objectStore('photos').delete(k); t.objectStore('blobs').delete(k); });
  });
}

/** Mapa entryId → [fotos (solo miniatura + datos)] en una sola transacción. */
export async function photosForEntries(entryIds) {
  return tx(['photos'], 'readonly', async (t) => {
    const idx = t.objectStore('photos').index('entryId');
    const map = {};
    await Promise.all(entryIds.map(async (id) => {
      map[id] = (await reqP(idx.getAll(id))).sort((a, b) => a.createdAt - b.createdAt);
    }));
    return map;
  });
}

export const getPhotoFull = async (photoId) => (await get('blobs', photoId))?.data || null;

export async function countAll() {
  return tx(['projects', 'entries', 'photos'], 'readonly', async (t) => ({
    projects: await reqP(t.objectStore('projects').count()),
    entries: await reqP(t.objectStore('entries').count()),
    photos: await reqP(t.objectStore('photos').count()),
  }));
}

// ---------- Respaldo ----------
export async function dumpAll(includePhotos = true) {
  const stores = ['projects', 'entries', 'days', 'photos', 'settings'].concat(includePhotos ? ['blobs'] : []);
  return tx(stores, 'readonly', async (t) => {
    const out = {};
    for (const s of stores) out[s] = await reqP(t.objectStore(s).getAll());
    if (!includePhotos) out.photos = [];
    return out;
  });
}

/** mode: 'merge' (añade/actualiza) o 'replace' (borra todo antes). */
export async function restoreAll(data, mode = 'merge') {
  const stores = ['projects', 'entries', 'days', 'photos', 'blobs', 'settings'];
  return tx(stores, 'readwrite', (t) => {
    if (mode === 'replace') stores.forEach((s) => t.objectStore(s).clear());
    for (const s of stores) (data[s] || []).forEach((row) => t.objectStore(s).put(row));
  });
}

export async function wipeAll() {
  const stores = ['projects', 'entries', 'days', 'photos', 'blobs', 'settings'];
  return tx(stores, 'readwrite', (t) => stores.forEach((s) => t.objectStore(s).clear()));
}
