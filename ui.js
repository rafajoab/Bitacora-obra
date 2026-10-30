// ui.js — componentes de interfaz estilo iOS: hojas modales, alertas, avisos, encabezados.
import { icon } from './icons.js';
import { fmtBytes } from './utils.js';

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

const layers = () => document.getElementById('layers');

// ---------- URLs temporales para imágenes (se liberan al cambiar de vista) ----------
const scopes = new Map();
export function objectURL(buffer, type = 'image/jpeg', scope = 'view') {
  const url = URL.createObjectURL(buffer instanceof Blob ? buffer : new Blob([buffer], { type }));
  if (!scopes.has(scope)) scopes.set(scope, []);
  scopes.get(scope).push(url);
  return url;
}
/** Separa las URLs actuales de un scope y devuelve una función para liberarlas luego. */
export function takeScope(scope = 'view') {
  const urls = scopes.get(scope) || []; scopes.delete(scope);
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}
export function revokeScope(scope = 'view') {
  (scopes.get(scope) || []).forEach((u) => URL.revokeObjectURL(u));
  scopes.delete(scope);
}

// ---------- Avisos (toast) ----------
export function toast(message, { type = 'ok', duration = 2400, action, onAction } = {}) {
  const ic = type === 'error' ? icon('info', 'w-5 h-5 text-danger')
           : type === 'info'  ? icon('info', 'w-5 h-5 text-tint')
           : `<svg class="w-5 h-5 text-ok anim-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`;
  const el = h(`<div class="glass anim-toast mt-2 mx-4 pointer-events-auto flex items-center gap-2.5 rounded-full pl-4 pr-2 py-2 shadow-lg shadow-black/10 text-[15px] font-medium min-h-11">
      ${ic}<span class="pr-2">${esc(message)}</span>
      ${action ? `<button class="press text-tint font-semibold px-3 h-8 rounded-full bg-fill">${esc(action)}</button>` : ''}
    </div>`);
  document.getElementById('toasts').append(el);
  const remove = () => { el.classList.add('anim-fadeout'); setTimeout(() => el.remove(), 220); };
  if (action) el.querySelector('button').onclick = () => { onAction?.(); remove(); };
  setTimeout(remove, duration);
}

// ---------- Hoja modal (bottom sheet) ----------
let openSheets = 0;
const lockBody = (on) => { openSheets += on ? 1 : -1; document.body.style.overflow = openSheets > 0 ? 'hidden' : ''; };

/**
 * sheet({ title, body (Element|html), primary:{label, onClick → true para cerrar}, cancelLabel, full })
 * Devuelve { el, body, close, setBusy }
 */
export function sheet({ title = '', body = '', primary = null, cancelLabel = 'Cancelar', full = false, onClose } = {}) {
  const root = h(`<div class="fixed inset-0 z-50 flex items-end justify-center">
    <div data-backdrop class="absolute inset-0 bg-black/40 anim-fade"></div>
    <section data-panel class="relative w-full max-w-xl bg-bg rounded-t-[14px] anim-sheet flex flex-col shadow-2xl"
      style="max-height: calc(100% - env(safe-area-inset-top) - 10px); ${full ? 'height: calc(100% - env(safe-area-inset-top) - 10px);' : ''}">
      <header data-drag class="shrink-0 pt-2 px-4 pb-1.5 touch-none">
        <div class="mx-auto w-9 h-[5px] rounded-full bg-label3 mb-1.5"></div>
        <div class="grid grid-cols-[1fr_auto_1fr] items-center h-10 gap-2">
          <button data-cancel class="press justify-self-start text-tint text-[17px]">${esc(cancelLabel)}</button>
          <h2 class="text-[17px] font-semibold truncate max-w-[55vw]">${esc(title)}</h2>
          ${primary ? `<button data-primary class="press justify-self-end text-tint text-[17px] font-semibold disabled:opacity-40">${esc(primary.label)}</button>` : '<span></span>'}
        </div>
      </header>
      <div data-body class="flex-1 overflow-y-auto overscroll-contain px-4 sheet-pad"></div>
    </section>
  </div>`);
  const panel = root.querySelector('[data-panel]');
  const bodyEl = root.querySelector('[data-body]');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  layers().append(root);
  lockBody(true);

  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    panel.classList.remove('anim-sheet'); panel.style.transform = '';
    panel.classList.add('anim-sheetout');
    root.querySelector('[data-backdrop]').classList.add('anim-fadeout');
    setTimeout(() => { root.remove(); lockBody(false); onClose?.(); }, 290);
  };
  root.querySelector('[data-backdrop]').onclick = close;
  root.querySelector('[data-cancel]').onclick = close;

  const pBtn = root.querySelector('[data-primary]');
  const setBusy = (busy) => { if (pBtn) { pBtn.disabled = busy; pBtn.innerHTML = busy ? '<span class="spinner inline-block align-middle"></span>' : esc(primary.label); } };
  if (pBtn) pBtn.onclick = async () => {
    setBusy(true);
    try { if (await primary.onClick()) close(); } catch (e) { console.error(e); toast(e.message || 'Error', { type: 'error' }); }
    finally { setBusy(false); }
  };

  // Arrastrar hacia abajo para cerrar (como en iOS)
  const drag = root.querySelector('[data-drag]');
  let y0 = null, dy = 0;
  drag.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    y0 = e.clientY; dy = 0; panel.style.transition = 'none'; drag.setPointerCapture(e.pointerId);
  });
  drag.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return; y0 = null;
    panel.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
    if (dy > 110) close(); else panel.style.transform = '';
  };
  drag.addEventListener('pointerup', end); drag.addEventListener('pointercancel', end);

  return { el: root, body: bodyEl, close, setBusy };
}

// ---------- Alerta de confirmación ----------
export function confirmDialog({ title, message = '', confirmText = 'Aceptar', cancelText = 'Cancelar', destructive = false }) {
  return new Promise((resolve) => {
    const root = h(`<div class="fixed inset-0 z-[70] flex items-center justify-center p-8">
      <div class="absolute inset-0 bg-black/40 anim-fade"></div>
      <div class="relative w-[270px] glass rounded-[14px] overflow-hidden anim-pop text-center">
        <div class="px-4 pt-5 pb-4">
          <h3 class="text-[17px] font-semibold">${esc(title)}</h3>
          ${message ? `<p class="text-[13px] mt-1 text-label2 leading-snug">${esc(message)}</p>` : ''}
        </div>
        <div class="grid grid-cols-2 hairline-t">
          <button data-v="0" class="h-11 text-[17px] text-tint" style="box-shadow: inset -0.5px 0 0 var(--c-sep)">${esc(cancelText)}</button>
          <button data-v="1" class="h-11 text-[17px] font-semibold ${destructive ? 'text-danger' : 'text-tint'}">${esc(confirmText)}</button>
        </div>
      </div></div>`);
    layers().append(root);
    root.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      root.classList.add('anim-fadeout'); setTimeout(() => root.remove(), 200); resolve(b.dataset.v === '1');
    }));
  });
}

// ---------- Hoja de acciones ----------
export function actionSheet({ title = '', options = [] }) {
  return new Promise((resolve) => {
    const root = h(`<div class="fixed inset-0 z-[70] flex items-end justify-center">
      <div data-bg class="absolute inset-0 bg-black/40 anim-fade"></div>
      <div class="relative w-full max-w-xl px-2 anim-sheet" style="padding-bottom: calc(env(safe-area-inset-bottom) + 8px)">
        <div class="glass rounded-[14px] overflow-hidden group-list max-h-[60vh] overflow-y-auto">
          ${title ? `<div class="px-4 py-3.5 text-center text-[13px] text-label2 font-medium">${esc(title)}</div>` : ''}
          ${options.map((o, i) => `<button data-i="${i}" class="w-full h-14 px-4 text-[19px] ${o.destructive ? 'text-danger' : 'text-tint'} ${o.selected ? 'font-semibold' : ''} flex items-center justify-center gap-2">${o.selected ? icon('check', 'w-5 h-5') : ''}${esc(o.label)}</button>`).join('')}
        </div>
        <button data-cancel class="mt-2 w-full h-14 rounded-[14px] bg-card text-tint text-[19px] font-semibold">Cancelar</button>
      </div></div>`);
    layers().append(root);
    const done = (v) => { root.classList.add('anim-fadeout'); setTimeout(() => root.remove(), 200); resolve(v); };
    root.querySelector('[data-bg]').onclick = () => done(null);
    root.querySelector('[data-cancel]').onclick = () => done(null);
    root.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => done(options[+b.dataset.i].value)));
  });
}

// ---------- Compartir / descargar archivos ----------
export async function shareOrDownload(blob, filename, title = filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancel'; console.warn('share falló, se descarga', e); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.rel = 'noopener';
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  return 'downloaded';
}

/** Hoja de "archivo listo": el usuario toca Compartir (iOS exige un toque directo para compartir). */
export function fileReadySheet({ blob, filename, kind = 'pdf', title = 'Archivo listo', note = '' }) {
  const ic = kind === 'pdf' ? 'pdf' : kind === 'csv' ? 'table' : 'db';
  const s = sheet({ title, cancelLabel: 'Cerrar', body: `
    <div class="flex flex-col items-center text-center pt-4 pb-2 anim-pop">
      <div class="w-20 h-20 rounded-[22px] bg-tint text-ontint flex items-center justify-center shadow-lg">${icon(ic, 'w-10 h-10', 1.6)}</div>
      <p class="mt-4 font-semibold text-[17px] break-all px-4">${esc(filename)}</p>
      <p class="text-label2 text-[15px] mt-0.5">${fmtBytes(blob.size)}</p>
      ${note ? `<p class="text-label2 text-[13px] mt-3 px-6">${esc(note)}</p>` : ''}
    </div>
    <div class="grid gap-2.5 mt-5">
      <button data-share class="btn-primary w-full">${icon('share', 'w-5 h-5')} Compartir (WhatsApp, Correo…)</button>
      <button data-dl class="btn-soft w-full">${icon('download', 'w-5 h-5')} Guardar en Archivos</button>
    </div>` });
  s.body.querySelector('[data-share]').onclick = () => shareOrDownload(blob, filename);
  s.body.querySelector('[data-dl]').onclick = async () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  };
  return s;
}

// ---------- Encabezado grande que se colapsa al hacer scroll ----------
export function pageHeader({ title, subtitle = '', right = '', subtitleAction = false }) {
  return `
  <div data-navbar class="sticky top-0 z-30 safe-top transition-colors duration-200">
    <div class="h-11 px-4 grid grid-cols-[1fr_auto_1fr] items-center max-w-xl mx-auto">
      <span></span>
      <span data-smalltitle class="text-[17px] font-semibold opacity-0 transition-opacity duration-200 truncate max-w-[60vw]">${esc(title)}</span>
      <div class="justify-self-end flex items-center gap-1">${right}</div>
    </div>
  </div>
  <div class="px-4 max-w-xl mx-auto">
    <h1 data-bigtitle class="text-[34px] leading-[41px] font-bold tracking-tight">${esc(title)}</h1>
    ${subtitle ? `<button ${subtitleAction ? 'data-subtitle' : 'disabled'} class="press mt-0.5 flex items-center gap-1 text-[15px] text-label2 max-w-full text-left">
        <span class="truncate">${esc(subtitle)}</span>${subtitleAction ? icon('chevD', 'w-4 h-4 shrink-0') : ''}</button>` : ''}
  </div>`;
}

export function mountHeader(root) {
  const big = root.querySelector('[data-bigtitle]');
  const bar = root.querySelector('[data-navbar]');
  const small = root.querySelector('[data-smalltitle]');
  if (!big || !bar) return;
  const io = new IntersectionObserver(([e]) => {
    const hidden = !e.isIntersecting;
    small.style.opacity = hidden ? 1 : 0;
    bar.classList.toggle('glass', hidden);
    bar.classList.toggle('hairline-b', hidden);
  }, { rootMargin: '-56px 0px 0px 0px' });
  io.observe(big);
}

// ---------- Interruptores (switch iOS) ----------
export function bindSwitches(root) {
  root.querySelectorAll('[role="switch"]').forEach((sw) => {
    sw.onclick = () => { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); sw.dispatchEvent(new Event('change')); };
  });
}
export const switchHTML = (name, on) => `<button type="button" role="switch" data-name="${name}" aria-checked="${!!on}" class="switch"></button>`;

/** Grupo de chips de selección única/múltiple. */
export function chipGroup(name, options, selected, { multi = false, allowNone = true } = {}) {
  const sel = new Set([].concat(selected || []));
  return `<div data-chips="${name}" data-multi="${multi}" data-none="${allowNone}" class="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-0.5">
    ${options.map((o) => `<button type="button" class="chip" aria-pressed="${sel.has(o)}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}
  </div>`;
}
export function bindChips(root, onChange) {
  root.querySelectorAll('[data-chips]').forEach((g) => {
    if (g.dataset.bound) return;          // nunca enlazar dos veces el mismo grupo
    g.dataset.bound = '1';
    g.addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      const multi = g.dataset.multi === 'true';
      const on = b.getAttribute('aria-pressed') === 'true';
      if (!multi) {
        if (on && g.dataset.none === 'false') return;
        g.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      }
      b.setAttribute('aria-pressed', String(!on));
      onChange?.(g.dataset.chips, chipValue(root, g.dataset.chips));
    });
  });
}
export function chipValue(root, name) {
  const g = root.querySelector(`[data-chips="${name}"]`); if (!g) return null;
  const vals = [...g.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.dataset.v);
  return g.dataset.multi === 'true' ? vals : (vals[0] || '');
}

export const emptyState = (ic, title, text, actionsHTML = '') => `
  <div class="flex flex-col items-center text-center px-8 py-14 anim-view">
    <div class="w-16 h-16 rounded-2xl bg-fill text-label2 flex items-center justify-center">${icon(ic, 'w-8 h-8', 1.6)}</div>
    <h3 class="mt-4 text-[20px] font-semibold">${esc(title)}</h3>
    <p class="mt-1.5 text-[15px] text-label2 leading-relaxed">${esc(text)}</p>
    ${actionsHTML ? `<div class="mt-6 grid gap-2.5 w-full max-w-xs">${actionsHTML}</div>` : ''}
  </div>`;
