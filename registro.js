// views/registro.js — formulario de registro diario (hoja modal) y clima del día.
import * as db from '../db.js';
import { state } from '../store.js';
import { sheet, h, esc, toast, confirmDialog, chipGroup, bindChips, chipValue, objectURL, revokeScope } from '../ui.js';
import { icon } from '../icons.js';
import { compressPhoto, openViewer } from '../photos.js';
import { todayISO, fmtShort, fmtLong, cap, WEATHER, hoursBetween, fmtHours, UNITS, activitiesFor, zonesFor, STEP_PCTS } from '../utils.js';

// ---------------------------------------------------------------
// Sección de clima / condiciones del día (se reutiliza en 2 hojas)
// ---------------------------------------------------------------
const rainRow = (r = {}) => `
  <div data-rain-row class="flex items-center gap-2 mt-2 anim-pop">
    <input type="time" data-from value="${esc(r.from || '')}" class="field flex-1 min-w-0" aria-label="Desde">
    <span class="text-label2 text-[15px]">a</span>
    <input type="time" data-to value="${esc(r.to || '')}" class="field flex-1 min-w-0" aria-label="Hasta">
    <button type="button" data-rm class="press w-11 h-11 shrink-0 rounded-xl bg-fill text-danger flex items-center justify-center" aria-label="Quitar">${icon('trash', 'w-5 h-5')}</button>
  </div>`;

export function weatherHTML(day = {}) {
  return `
  <div data-weather>
    <span class="label">Condición del clima</span>
    <div data-chips="condition" data-multi="false" data-none="true" class="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-0.5">
      ${WEATHER.map((w) => `<button type="button" class="chip" data-v="${w.id}" aria-pressed="${day.condition === w.id}">${w.emoji} ${w.label}</button>`).join('')}
    </div>
    <div class="flex items-end justify-between">
      <span class="label">Lluvia / paralización (horario)</span>
      <span data-rain-total class="text-[13px] text-label2 mb-1.5 px-1"></span>
    </div>
    <div data-rain-list>${(day.rain || []).map(rainRow).join('')}</div>
    <button type="button" data-add-rain class="press mt-2 w-full h-11 rounded-xl border border-dashed border-sep text-tint text-[15px] font-medium flex items-center justify-center gap-1.5">${icon('plus', 'w-4 h-4', 2.2)} Agregar intervalo (ej. 2:00 – 4:00 p. m.)</button>
    <span class="label">Personal en obra</span>
    <input type="number" inputmode="numeric" min="0" data-crew value="${esc(day.crew ?? '')}" placeholder="Cantidad de trabajadores" class="field">
    <span class="label">Notas del día (clima, incidencias)</span>
    <textarea data-wnote rows="2" placeholder="Ej. Llovió de 2:00 a 4:00 p. m., se paralizó el andamio de la fachada lateral." class="field resize-none">${esc(day.weatherNote || '')}</textarea>
  </div>`;
}

export function bindWeather(root, onTouch = () => {}) {
  const w = root.querySelector('[data-weather]');
  const list = w.querySelector('[data-rain-list]');
  const total = () => {
    const hrs = [...list.querySelectorAll('[data-rain-row]')].reduce((s, r) => s + hoursBetween(r.querySelector('[data-from]').value, r.querySelector('[data-to]').value), 0);
    w.querySelector('[data-rain-total]').textContent = hrs ? `Total: ${fmtHours(hrs)}` : '';
  };
  w.querySelector('[data-add-rain]').onclick = () => { list.append(h(rainRow())); onTouch(); };
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { b.closest('[data-rain-row]').remove(); total(); onTouch(); } });
  w.addEventListener('input', () => { total(); onTouch(); });
  w.addEventListener('click', (e) => { if (e.target.closest('.chip')) onTouch(); });
  total();
}

export function readWeather(root, projectId, date) {
  const w = root.querySelector('[data-weather]');
  const rain = [...w.querySelectorAll('[data-rain-row]')]
    .map((r) => ({ from: r.querySelector('[data-from]').value, to: r.querySelector('[data-to]').value }))
    .filter((r) => r.from || r.to);
  const crew = w.querySelector('[data-crew]').value;
  return {
    id: db.dayId(projectId, date), projectId, date,
    condition: chipValue(w, 'condition') || '',
    rain, crew: crew === '' ? '' : Number(crew),
    weatherNote: w.querySelector('[data-wnote]').value.trim(),
    updatedAt: Date.now(),
  };
}
const dayIsEmpty = (d) => !d.condition && !d.rain.length && d.crew === '' && !d.weatherNote;

// ---------------------------------------------------------------
// Hoja: Clima del día
// ---------------------------------------------------------------
export async function openDaySheet({ date = todayISO(), onSaved } = {}) {
  const p = state.project; if (!p) return;
  const day = (await db.getDay(p.id, date)) || {};
  const s = sheet({
    title: 'Clima del día',
    primary: { label: 'Guardar', onClick: async () => {
      const d = readWeather(s.body, p.id, date);
      if (dayIsEmpty(d)) await db.del('days', d.id); else await db.put('days', d);
      toast('Clima guardado'); onSaved?.(); return true;
    } },
    body: `<p class="text-[15px] text-label2 mt-1">${esc(cap(fmtLong(date)))} · ${esc(p.name)}</p>${weatherHTML(day)}`,
  });
  bindChips(s.body); bindWeather(s.body);
}

// ---------------------------------------------------------------
// Hoja: Nuevo / editar registro de avance
// ---------------------------------------------------------------
export async function openEntrySheet({ entry = null, date = null, onSaved } = {}) {
  const p = state.project;
  if (!p) { toast('Primero crea o elige un proyecto', { type: 'info' }); location.hash = '#/proyectos'; return; }

  const isEdit = !!entry;
  const e = entry || {};
  let curDate = e.date || date || todayISO();
  let day = (await db.getDay(p.id, curDate)) || {};
  let weatherTouched = false;

  const existing = isEdit ? ((await db.photosForEntries([e.id]))[e.id] || []) : [];
  const pending = [];          // fotos nuevas aún no guardadas
  const removed = new Set();   // ids de fotos existentes a borrar
  const SCOPE = 'entry-sheet';

  const optGroup = (label, name, list, val) => list?.length
    ? `<span class="label">${label}</span>${chipGroup(name, list, val)}` : '';

  const body = h(`<div>
    <div class="flex items-center gap-2 mt-2 text-[13px] text-label2">${icon('building', 'w-4 h-4')}<span class="truncate">${esc(p.name)}</span></div>

    <span class="label">Fecha</span>
    <input type="date" data-date value="${curDate}" class="field">

    <span class="label">Rubro / tipo de trabajo *</span>
    ${chipGroup('category', p.categories, e.category)}
    ${optGroup('Fachada / frente', 'front', p.fronts, e.front)}
    <div data-slot="zone"></div>
    ${optGroup('Nivel', 'level', p.levels, e.level)}
    <div data-slot="activity"></div>
    ${p.stepPcts ? `<span class="label">% del paso ejecutado</span>
      <div data-chips="stepPct" data-multi="false" data-none="true" class="flex gap-2">
        ${STEP_PCTS.map((n) => `<button type="button" class="chip flex-1 justify-center" data-v="${n}" aria-pressed="${String(e.stepPct) === String(n)}">${n} %</button>`).join('')}
      </div>` : ''}

    <div class="flex items-end justify-between">
      <span class="label">Descripción del avance *</span>
      <button type="button" data-autofill class="press mb-1 text-[13px] text-tint font-medium flex items-center gap-1">${icon('sparkle', 'w-4 h-4')} Autocompletar</button>
    </div>
    <textarea data-text rows="4" placeholder="Ej. Hoy se avanzó el borde de losa del nivel 100 de la fachada lateral derecha." class="field resize-none leading-snug">${esc(e.text || '')}</textarea>
    <p class="text-[12px] text-label3 px-1 mt-1">Tip: usa el micrófono del teclado para dictar.</p>

    <span class="label">Cantidad ejecutada (opcional)</span>
    <div class="flex gap-2">
      <input type="number" inputmode="decimal" step="any" min="0" data-qty value="${esc(e.qty ?? '')}" placeholder="0" class="field flex-1">
      <select data-unit class="field w-28">${UNITS.map((u) => `<option ${((e.unit || 'm²') === u) ? 'selected' : ''}>${u}</option>`).join('')}</select>
    </div>

    <span class="label">Fotos</span>
    <div data-photos class="grid grid-cols-4 gap-2"></div>
    <input type="file" accept="image/*" capture="environment" data-cam class="hidden">
    <input type="file" accept="image/*" multiple data-gal class="hidden">

    <details data-wbox class="mt-6 card px-4 group" ${day.condition || day.rain?.length ? 'open' : ''}>
      <summary class="list-none h-12 flex items-center justify-between cursor-pointer">
        <span class="flex items-center gap-2 font-medium">${icon('rain', 'w-5 h-5 text-tint')} Clima y condiciones del día</span>
        <span class="text-label3 transition-transform duration-200 group-open:rotate-180">${icon('chevD', 'w-5 h-5')}</span>
      </summary>
      <div data-wslot class="pb-4"></div>
    </details>

    ${isEdit ? `<button type="button" data-delete class="btn-danger w-full mt-6">${icon('trash', 'w-5 h-5')} Eliminar registro</button>` : ''}
  </div>`);

  const s = sheet({
    title: isEdit ? 'Editar registro' : 'Nuevo registro',
    full: true,
    body,
    primary: { label: 'Guardar', onClick: save },
    onClose: () => revokeScope(SCOPE),
  });

  // ---- clima ----
  const mountWeather = () => {
    body.querySelector('[data-wslot]').innerHTML = weatherHTML(day);
    bindChips(body.querySelector('[data-wslot]'));
    bindWeather(body.querySelector('[data-wslot]'), () => { weatherTouched = true; });
  };
  // Bajadas según la fachada y pasos según el rubro (como en el Excel de control)
  const withCurrent = (list, cur) => (cur && !list.includes(cur) ? [...list, cur] : list);
  function renderSlot(name) {
    const slot = body.querySelector(`[data-slot="${name}"]`);
    const prev = chipValue(body, name) || (name === 'zone' ? e.zone : e.activity) || '';
    const list = name === 'zone'
      ? withCurrent(zonesFor(p, chipValue(body, 'front')), prev)
      : withCurrent(activitiesFor(p, chipValue(body, 'category')), prev);
    const keep = list.includes(prev) ? prev : '';
    slot.innerHTML = list.length ? `<span class="label">${name === 'zone' ? 'Bajada' : 'Paso / actividad'}</span>${chipGroup(name, list, keep)}` : '';
    bindChips(slot);
  }
  renderSlot('zone'); renderSlot('activity');
  bindChips(body, (name) => {        // primero los chips del registro…
    if (name === 'front') renderSlot('zone');
    if (name === 'category') renderSlot('activity');
  });
  mountWeather();    // …luego el clima (enlaza solo sus propios chips)

  body.querySelector('[data-date]').addEventListener('change', async (ev) => {
    curDate = ev.target.value || todayISO();
    if (!weatherTouched) { day = (await db.getDay(p.id, curDate)) || {}; mountWeather(); }
  });

  // ---- autocompletar descripción ----
  body.querySelector('[data-autofill]').onclick = () => {
    const v = (n) => chipValue(body, n) || '';
    const act = v('activity').replace(/^\d+\.\s*/, ''), cat = v('category');
    const qty = body.querySelector('[data-qty]').value, unit = body.querySelector('[data-unit]').value;
    let txt = `Se avanzó ${(act || cat || 'trabajos').toLowerCase()}`;
    if (v('stepPct')) txt += ` (${v('stepPct')} %)`;
    if (act && cat) txt += ` de ${cat.toLowerCase()}`;
    const where = [v('front'), v('zone'), v('level')].filter(Boolean).map((x) => x.toLowerCase()).join(', ');
    if (where) txt += ` en ${where}`;
    if (qty) txt += ` – ${qty} ${unit}`;
    txt += '.';
    const ta = body.querySelector('[data-text]');
    ta.value = ta.value.trim() ? `${ta.value.trim()} ${txt}` : txt;
    ta.focus();
  };

  // ---- fotos ----
  const grid = body.querySelector('[data-photos]');
  const allPhotos = () => [...existing.filter((x) => !removed.has(x.id)), ...pending];
  function renderPhotos(busy = 0) {
    const list = allPhotos();
    grid.innerHTML = list.map((ph, idx) => `
      <div class="relative aspect-square anim-pop">
        <button type="button" data-view="${idx}" class="press w-full h-full rounded-xl overflow-hidden bg-fill">
          <img src="${objectURL(ph.thumb, 'image/jpeg', SCOPE)}" class="w-full h-full object-cover" alt="">
        </button>
        <button type="button" data-rmph="${ph.id}" class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center ring-2 ring-bg" aria-label="Quitar foto">${icon('close', 'w-3.5 h-3.5', 2.6)}</button>
      </div>`).join('')
      + Array.from({ length: busy }, () => `<div class="aspect-square rounded-xl bg-fill flex items-center justify-center"><span class="spinner"></span></div>`).join('')
      + `<button type="button" data-cambtn class="press aspect-square rounded-xl bg-fill text-tint flex flex-col items-center justify-center gap-1 text-[12px] font-medium">${icon('camera', 'w-7 h-7', 1.6)}Cámara</button>
         <button type="button" data-galbtn class="press aspect-square rounded-xl bg-fill text-tint flex flex-col items-center justify-center gap-1 text-[12px] font-medium">${icon('photo', 'w-7 h-7', 1.6)}Galería</button>`;
  }
  renderPhotos();

  grid.addEventListener('click', async (ev) => {
    const v = ev.target.closest('[data-view]');
    if (v) return openViewer(allPhotos(), +v.dataset.view);
    const rm = ev.target.closest('[data-rmph]');
    if (rm) {
      const id = rm.dataset.rmph;
      const pi = pending.findIndex((x) => x.id === id);
      if (pi >= 0) pending.splice(pi, 1); else removed.add(id);
      return renderPhotos();
    }
    if (ev.target.closest('[data-cambtn]')) body.querySelector('[data-cam]').click();
    if (ev.target.closest('[data-galbtn]')) body.querySelector('[data-gal]').click();
  });

  const onFiles = async (ev) => {
    const files = [...ev.target.files]; ev.target.value = '';
    if (!files.length) return;
    const st = state.settings;
    let left = files.length;
    renderPhotos(left);
    for (const f of files) {
      try {
        const now = new Date();
        const stamp = st.stampPhotos ? [p.name, `${fmtShort(curDate)} · ${now.toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' })}`] : null;
        const r = await compressPhoto(f, { max: st.photoMax, quality: st.photoQuality, stamp });
        pending.push({ ...r.meta, full: r.full });
      } catch (err) { console.error(err); toast('No se pudo procesar una foto', { type: 'error' }); }
      renderPhotos(--left);
    }
  };
  body.querySelector('[data-cam]').addEventListener('change', onFiles);
  body.querySelector('[data-gal]').addEventListener('change', onFiles);

  // ---- eliminar ----
  body.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!await confirmDialog({ title: '¿Eliminar registro?', message: 'Se borrarán también sus fotos. No se puede deshacer.', confirmText: 'Eliminar', destructive: true })) return;
    await db.deleteEntry(e.id);
    toast('Registro eliminado'); s.close(); onSaved?.();
  });

  // ---- guardar ----
  async function save() {
    const category = chipValue(body, 'category');
    const text = body.querySelector('[data-text]').value.trim();
    if (!category) { toast('Elige el tipo de trabajo', { type: 'error' }); return false; }
    if (!text) { toast('Escribe la descripción del avance', { type: 'error' }); body.querySelector('[data-text]').focus(); return false; }
    const qty = body.querySelector('[data-qty]').value;
    const now = Date.now();
    const rec = {
      ...e,
      id: e.id || db.uid(), projectId: p.id, createdAt: e.createdAt || now, updatedAt: now,
      date: curDate, category,
      front: chipValue(body, 'front') || '', zone: chipValue(body, 'zone') || '', level: chipValue(body, 'level') || '',
      activity: chipValue(body, 'activity') || '', stepPct: chipValue(body, 'stepPct') ? Number(chipValue(body, 'stepPct')) : '',
      text, qty: qty === '' ? '' : Number(qty), unit: qty === '' ? '' : body.querySelector('[data-unit]').value,
    };
    let dayRec = null;
    if (weatherTouched) {
      dayRec = readWeather(body.querySelector('[data-wslot]'), p.id, curDate);
      if (dayIsEmpty(dayRec)) { await db.del('days', dayRec.id); dayRec = null; }
    }
    await db.saveEntry(rec, pending.map(({ full, ...meta }) => ({ meta, full })), [...removed], dayRec);
    await db.put('projects', { ...p, updatedAt: now });
    navigator.storage?.persist?.();
    toast(isEdit ? 'Cambios guardados' : 'Registro guardado');
    onSaved?.(rec);
    return true;
  }
}
