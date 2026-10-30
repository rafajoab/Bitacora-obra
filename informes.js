// views/informes.js — informes PDF y exportación CSV por periodo.
import * as db from './db.js';
import { state } from './store.js';
import { pageHeader, mountHeader, esc, emptyState, toast, fileReadySheet, bindSwitches, switchHTML, h } from './ui.js';
import { icon } from './icons.js';
import { buildReportPDF } from './report-pdf.js';
import { buildCSV, csvName } from './export.js';
import { recompress } from './photos.js';
import { todayISO, addDays, startOfWeek, rainHours, fmtHours, slug, fromISO } from './utils.js';

let pdfLibPromise = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  pdfLibPromise ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'pdf-lib.min.js';
    s.onload = () => res(window.PDFLib);
    s.onerror = () => { pdfLibPromise = null; rej(new Error('No se pudo cargar el motor PDF')); };
    document.head.append(s);
  });
  return pdfLibPromise;
}

/** Logo del encabezado (logo-empresa.png). Para usar otro, reemplaza ese archivo. */
async function loadLogo() {
  if (state.settings.useLogo === false) return null;
  try { const r = await fetch('logo-empresa.png'); return r.ok ? await r.arrayBuffer() : null; } catch { return null; }
}

const PRESETS = () => {
  const t = todayISO(), w = startOfWeek(t);
  return [
    { id: 'hoy', label: 'Hoy', from: t, to: t },
    { id: 'ayer', label: 'Ayer', from: addDays(t, -1), to: addDays(t, -1) },
    { id: 'semana', label: 'Esta semana', from: w, to: t },
    { id: 'anterior', label: 'Semana anterior', from: addDays(w, -7), to: addDays(w, -1) },
    { id: 'quincena', label: 'Últimos 15 días', from: addDays(t, -14), to: t },
  ];
};

const reportTitle = (from, to) => {
  if (from === to) return 'Informe diario de avance';
  const days = Math.round((fromISO(to) - fromISO(from)) / 864e5) + 1;
  return days <= 7 ? 'Informe semanal de avance' : 'Informe de avance de obra';
};

export async function render(root) {
  const p = state.project;
  if (!p) {
    root.innerHTML = pageHeader({ title: 'Informes' }) + emptyState('doc', 'Sin proyecto activo', 'Crea o elige un proyecto para generar informes.', `<a href="#/proyectos" class="btn-primary w-full">Ir a Proyectos</a>`);
    return mountHeader(root);
  }

  const presets = PRESETS();
  let from = presets[0].from, to = presets[0].to, preset = 'hoy';
  const opts = { photos: true, optimize: true, max: 4 };

  root.innerHTML = `
    ${pageHeader({ title: 'Informes', subtitle: p.name })}
    <div class="px-4 max-w-xl mx-auto pad-tabbar">
      <span class="label">Periodo</span>
      <div data-presets class="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        ${presets.map((x) => `<button class="chip" data-p="${x.id}" aria-pressed="${x.id === preset}">${x.label}</button>`).join('')}
      </div>
      <div class="grid grid-cols-2 gap-3 mt-3">
        <label class="block"><span class="text-[13px] text-label2 px-1">Desde</span><input type="date" data-from class="field mt-1" value="${from}"></label>
        <label class="block"><span class="text-[13px] text-label2 px-1">Hasta</span><input type="date" data-to class="field mt-1" value="${to}"></label>
      </div>

      <div data-preview class="grid grid-cols-4 gap-2 mt-4 text-center"></div>

      <span class="label">Opciones del PDF</span>
      <div class="card group-list">
        <div class="flex items-center justify-between px-4 min-h-12 gap-3"><span>Incluir fotos</span>${switchHTML('photos', opts.photos)}</div>
        <div class="flex items-center justify-between px-4 min-h-12 gap-3"><span class="leading-tight py-2">Optimizar fotos para WhatsApp<span class="block text-[12px] text-label2">PDF más liviano</span></span>${switchHTML('optimize', opts.optimize)}</div>
        <div class="flex items-center justify-between px-4 min-h-12 gap-3"><span>Fotos por registro</span>
          <div class="seg w-40" data-max>${[2, 4, 99].map((n) => `<button data-n="${n}" aria-pressed="${n === opts.max}">${n === 99 ? 'Todas' : n}</button>`).join('')}</div></div>
      </div>

      <div class="grid gap-2.5 mt-6">
        <button data-pdf class="btn-primary w-full">${icon('pdf', 'w-5 h-5')} Generar informe PDF</button>
        <button data-csv class="btn-soft w-full">${icon('table', 'w-5 h-5')} Exportar periodo a CSV (Excel)</button>
        <button data-csvall class="btn-soft w-full">${icon('table', 'w-5 h-5')} Exportar bitácora completa a CSV</button>
      </div>
      <p class="text-[13px] text-label2 px-1 mt-4 leading-relaxed">El PDF incluye texto, clima, etiquetas y fotos del periodo, con espacio para firmas. Al terminar, toca <b>Compartir</b> para enviarlo por WhatsApp o correo.</p>
    </div>`;
  mountHeader(root);
  bindSwitches(root);

  async function loadData() {
    const [entries, daysArr] = await Promise.all([db.entriesByProject(p.id, from, to), db.daysByProject(p.id, from, to)]);
    const days = Object.fromEntries(daysArr.map((d) => [d.date, d]));
    const photosByEntry = await db.photosForEntries(entries.map((e) => e.id));
    return { entries, days, photosByEntry };
  }

  async function preview() {
    if (from > to) [from, to] = [to, from];
    const { entries, days, photosByEntry } = await loadData();
    const nPh = Object.values(photosByEntry).reduce((s, a) => s + a.length, 0);
    const rain = Object.values(days).reduce((s, d) => s + rainHours(d), 0);
    root.querySelector('[data-preview]').innerHTML = [
      ['Días', new Set(entries.map((e) => e.date)).size], ['Registros', entries.length], ['Fotos', nPh], ['Lluvia', fmtHours(rain)],
    ].map(([l, v]) => `<div class="card py-2.5 anim-pop"><p class="text-[19px] font-bold leading-none">${v}</p><p class="text-[11px] text-label2 mt-1">${l}</p></div>`).join('');
  }

  // ---- eventos de periodo ----
  const fIn = root.querySelector('[data-from]'), tIn = root.querySelector('[data-to]');
  root.querySelector('[data-presets]').onclick = (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const x = presets.find((q) => q.id === b.dataset.p);
    preset = x.id; from = x.from; to = x.to; fIn.value = from; tIn.value = to;
    root.querySelectorAll('[data-p]').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    preview();
  };
  const onDate = () => {
    from = fIn.value || todayISO(); to = tIn.value || from;
    root.querySelectorAll('[data-p]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    preview();
  };
  fIn.onchange = onDate; tIn.onchange = onDate;

  root.querySelectorAll('[role="switch"]').forEach((sw) => sw.addEventListener('change', () => { opts[sw.dataset.name] = sw.getAttribute('aria-checked') === 'true'; }));
  root.querySelector('[data-max]').onclick = (e) => {
    const b = e.target.closest('[data-n]'); if (!b) return;
    opts.max = +b.dataset.n;
    root.querySelectorAll('[data-max] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };

  // ---- PDF ----
  root.querySelector('[data-pdf]').onclick = async () => {
    const overlay = h(`<div class="fixed inset-0 z-[65] bg-black/40 flex items-center justify-center anim-fade">
      <div class="glass rounded-2xl px-8 py-6 flex flex-col items-center gap-3 anim-pop min-w-[220px]">
        <span class="spinner"></span><p data-msg class="text-[15px] font-medium">Preparando informe…</p></div></div>`);
    document.getElementById('layers').append(overlay);
    const msg = overlay.querySelector('[data-msg]');
    try {
      const [PDFLib, data, logo] = await Promise.all([loadPdfLib(), loadData(), loadLogo()]);
      if (!data.entries.length && !Object.keys(data.days).length) { toast('No hay registros en ese periodo', { type: 'info' }); return; }
      const total = opts.photos ? data.entries.reduce((s, e) => s + Math.min(opts.max, (data.photosByEntry[e.id] || []).length), 0) : 0;
      let done = 0;
      const title = reportTitle(from, to);
      const bytes = await buildReportPDF({
        PDFLib, project: p, from, to, title, ...data, settings: state.settings, logo,
        includePhotos: opts.photos, maxPhotosPerEntry: opts.max,
        loadPhoto: async (ph) => {
          msg.textContent = `Procesando fotos ${++done} de ${total}…`;
          const full = await db.getPhotoFull(ph.id);
          return full && opts.optimize ? recompress(full) : full;
        },
      });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const name = `${slug(title)}_${slug(p.name)}_${from === to ? from : `${from}_a_${to}`}.pdf`;
      fileReadySheet({ blob, filename: name, kind: 'pdf', title: 'Informe listo' });
    } catch (err) {
      console.error(err); toast(err.message || 'No se pudo generar el PDF', { type: 'error', duration: 4000 });
    } finally { overlay.remove(); }
  };

  // ---- CSV ----
  const exportCSV = async (all) => {
    const f = all ? undefined : from, t = all ? undefined : to;
    const entries = await db.entriesByProject(p.id, f, t);
    if (!entries.length) return toast('No hay registros para exportar', { type: 'info' });
    const days = Object.fromEntries((await db.daysByProject(p.id, f, t)).map((d) => [d.date, d]));
    const ph = await db.photosForEntries(entries.map((e) => e.id));
    const counts = Object.fromEntries(Object.entries(ph).map(([k, v]) => [k, v.length]));
    const blob = buildCSV(p, entries, days, counts);
    fileReadySheet({ blob, filename: csvName(p, f, t), kind: 'csv', title: 'CSV listo', note: 'Ábrelo en Excel, Numbers o Google Sheets. Los acentos se conservan.' });
  };
  root.querySelector('[data-csv]').onclick = () => exportCSV(false);
  root.querySelector('[data-csvall]').onclick = () => exportCSV(true);

  await preview();
}
