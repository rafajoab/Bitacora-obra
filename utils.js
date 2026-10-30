// utils.js — fechas, horas y formato (zona horaria local del teléfono)

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };

/** Lunes de la semana de la fecha dada. */
export const startOfWeek = (iso) => { const d = fromISO(iso); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return toISO(d); };

const LOCALE = 'es-PA';
export const fmtLong  = (iso) => fromISO(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDay   = (iso) => fromISO(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' });
export const fmtShort = (iso) => fromISO(iso).toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
export const weekday  = (iso) => fromISO(iso).toLocaleDateString(LOCALE, { weekday: 'long' });
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function relDay(iso) {
  const t = todayISO();
  if (iso === t) return 'Hoy';
  if (iso === addDays(t, -1)) return 'Ayer';
  return cap(fmtDay(iso));
}

/** '14:00' → '2:00 p. m.' */
export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'p. m.' : 'a. m.';
  return `${((h + 11) % 12) + 1}:${pad(m)} ${ap}`;
}

/** Horas entre '14:00' y '16:30' → 2.5 */
export function hoursBetween(from, to) {
  if (!from || !to) return 0;
  const [h1, m1] = from.split(':').map(Number);
  const [h2, m2] = to.split(':').map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

export const rainHours = (day) => (day?.rain || []).reduce((s, r) => s + hoursBetween(r.from, r.to), 0);
export const fmtHours = (h) => `${Number(h.toFixed(2)).toLocaleString(LOCALE)} h`;

export const fmtBytes = (b) => {
  if (!b && b !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
};

export const WEATHER = [
  { id: 'soleado',   label: 'Soleado',        emoji: '☀️' },
  { id: 'nublado',   label: 'Nublado',        emoji: '☁️' },
  { id: 'llovizna',  label: 'Llovizna',       emoji: '🌦️' },
  { id: 'lluvia',    label: 'Lluvia',         emoji: '🌧️' },
  { id: 'tormenta',  label: 'Tormenta',       emoji: '⛈️' },
  { id: 'viento',    label: 'Viento fuerte',  emoji: '💨' },
];
export const weatherById = (id) => WEATHER.find((w) => w.id === id);

/** Texto corto del clima de un día: "Lluvia · 2:00 p. m.–4:00 p. m. (2 h)" */
export function weatherSummary(day, { emoji = true } = {}) {
  if (!day) return '';
  const parts = [];
  const w = weatherById(day.condition);
  if (w) parts.push(emoji ? `${w.emoji} ${w.label}` : w.label);
  const rain = (day.rain || []).filter((r) => r.from && r.to);
  if (rain.length) {
    parts.push('Lluvia ' + rain.map((r) => `${fmtTime(r.from)}–${fmtTime(r.to)}`).join(', ') + ` (${fmtHours(rainHours(day))})`);
  }
  return parts.join(' · ');
}

export const UNITS = ['m²', 'ml', 'und', 'm³', 'kg', '%'];

/** Paleta para etiquetas de categoría (se asigna por posición). */
export const PALETTE = ['#0B2545', '#C9A227', '#2F6690', '#3A7D44', '#8E5572', '#D1495B', '#5C6B73', '#E07A5F', '#3D405B', '#81B29A'];
export const catColor = (project, cat) => {
  const i = Math.max(0, (project?.categories || []).indexOf(cat));
  return PALETTE[i % PALETTE.length];
};

export const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/** "Uno\nDos\nTres" → ['Uno','Dos','Tres'] (uno por línea, sin duplicados) */
export const parseList = (txt) => [...new Set(String(txt || '').split(/\n/).map((s) => s.trim()).filter(Boolean))];

/** Pasos/actividades que aplican al rubro elegido (si el proyecto define el mapa). */
export function activitiesFor(project, category) {
  const map = project?.activitiesByCategory;
  if (map && category && map[category]) return map[category];
  return project?.activities || [];
}
/** Bajadas que existen en la fachada elegida (si el proyecto define cuántas tiene). */
export function zonesFor(project, front) {
  const all = project?.zones || [];
  const n = project?.zonesByFront?.[front];
  return n ? all.slice(0, n).concat(Array.from({ length: Math.max(0, n - all.length) }, (_, i) => `Bajada ${all.length + i + 1}`)) : all;
}
export const STEP_PCTS = [25, 50, 75, 100];

/** "Lateral Derecha · Bajada 2 · Nivel 100" */
export const whereText = (e) => [e.front, e.zone, e.level].filter(Boolean).join(' · ');
/** "1. Pegado de EPS (75 %) · 18 m²" */
export const whatText = (e) => [
  e.activity ? e.activity + (e.stepPct ? ` (${e.stepPct} %)` : '') : (e.stepPct ? `${e.stepPct} % del paso` : ''),
  e.qty !== '' && e.qty != null ? `${e.qty} ${e.unit}` : '',
].filter(Boolean).join(' · ');
