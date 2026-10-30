// export.js — CSV para Excel/Google Sheets y respaldo JSON (exportar / importar).
import * as db from './db.js';
import { weekday, fmtTime, rainHours, weatherById, slug, todayISO } from './utils.js';
// Orden de columnas igual al Excel "Control Avance – Fachadas": Rubro → Fachada → Bajada → Nivel → Paso

// ---------------- CSV ----------------
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV de la bitácora de un proyecto (orden cronológico). Abre directo en Excel con acentos. */
export function buildCSV(project, entries, days, photoCounts = {}) {
  const head = ['Fecha', 'Día', 'Proyecto', 'Rubro', 'Fachada', 'Bajada', 'Nivel', 'Paso / actividad', '% del paso', 'Descripción',
    'Cantidad', 'Unidad', 'Clima', 'Lluvia (horario)', 'Horas de lluvia', 'Personal en obra', 'Notas del día', 'N° fotos', 'Hora de registro'];
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map((e) => {
    const d = days[e.date] || {};
    return [
      e.date, weekday(e.date), project.name, e.category, e.front, e.zone || '', e.level, e.activity,
      e.stepPct ? e.stepPct / 100 : '', e.text,
      e.qty === '' || e.qty == null ? '' : e.qty, e.unit || '',
      weatherById(d.condition)?.label || '',
      (d.rain || []).filter((r) => r.from && r.to).map((r) => `${fmtTime(r.from)} - ${fmtTime(r.to)}`).join(' / '),
      rainHours(d) || '', d.crew ?? '', d.weatherNote || '',
      photoCounts[e.id] || 0,
      new Date(e.createdAt).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' }),
    ];
  });
  const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
}
export const csvName = (project, from, to) =>
  `bitacora-${slug(project.name)}${from ? `_${from}_a_${to}` : '_historico'}.csv`;

// ---------------- Respaldo JSON ----------------
function abToB64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToAb(b64) {
  const s = atob(b64); const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

/** Crea el archivo de respaldo. Se arma por partes para no saturar la memoria del iPhone. */
export async function buildBackup(includePhotos = true) {
  const d = await db.dumpAll(includePhotos);
  const parts = [`{"app":"bitacora-obra","format":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"includesPhotos":${includePhotos}`];
  for (const k of ['projects', 'entries', 'days', 'settings']) parts.push(`,"${k}":${JSON.stringify(d[k] || [])}`);
  parts.push(',"photos":[');
  (d.photos || []).forEach((p, i) => parts.push((i ? ',' : '') + JSON.stringify({ ...p, thumb: abToB64(p.thumb) })));
  parts.push('],"blobs":[');
  (d.blobs || []).forEach((b, i) => parts.push((i ? ',' : '') + JSON.stringify({ id: b.id, data: abToB64(b.data) })));
  parts.push(']}');
  return new Blob(parts, { type: 'application/json' });
}
export const backupName = () => `respaldo-bitacora-obra_${todayISO()}.json`;

/** Lee un archivo de respaldo y lo restaura. mode: 'merge' | 'replace'. Devuelve conteos. */
export async function importBackup(file, mode = 'merge') {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('El archivo no es un respaldo válido (JSON dañado).'); }
  if (data?.app !== 'bitacora-obra') throw new Error('Este archivo no es un respaldo de Bitácora de Obra.');
  data.photos = (data.photos || []).map((p) => ({ ...p, thumb: b64ToAb(p.thumb) }));
  data.blobs = (data.blobs || []).map((b) => ({ id: b.id, data: b64ToAb(b.data) }));
  // si el respaldo no trae fotos completas, no se importan sus miniaturas huérfanas
  if (!data.blobs.length) data.photos = [];
  await db.restoreAll(data, mode);
  return { projects: data.projects?.length || 0, entries: data.entries?.length || 0, photos: data.photos.length };
}
