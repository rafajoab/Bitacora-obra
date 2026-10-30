// app.js — arranque, navegación por pestañas y service worker.
import { openDB } from './db.js';
import { state, loadState, applyTheme } from './store.js';
import { takeScope, toast } from './ui.js';
import { icon } from './icons.js';
import { openEntrySheet } from './registro.js';
import * as bitacora from './bitacora.js';
import * as proyectos from './proyectos.js';
import * as informes from './informes.js';
import * as ajustes from './ajustes.js';

const ROUTES = { bitacora, proyectos, informes, ajustes };
const TABS = [
  ['bitacora', 'book', 'Bitácora'],
  ['proyectos', 'building', 'Proyectos'],
  ['informes', 'doc', 'Informes'],
  ['ajustes', 'gear', 'Ajustes'],
];

const viewEl = document.getElementById('view');
let renderToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'bitacora';
  const [name, qs = ''] = raw.split('?');
  return { name: ROUTES[name] ? name : 'bitacora', params: new URLSearchParams(qs) };
}

async function render({ keepScroll = false } = {}) {
  const { name, params } = parseHash();
  const token = ++renderToken;
  const y = keepScroll ? window.scrollY : 0;
  const releaseOldImages = takeScope('view');

  // contenedor nuevo en cada render (evita eventos duplicados)
  const container = document.createElement('div');
  if (!keepScroll) container.className = 'anim-view';
  try {
    await ROUTES[name].render(container, () => render({ keepScroll: true }), params);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="p-8 text-center text-danger">Error al cargar la vista: ${err.message}</div>`;
  }
  if (token !== renderToken) return; // llegó otra navegación mientras cargaba
  viewEl.replaceChildren(container);
  releaseOldImages();
  window.scrollTo(0, y);

  document.querySelectorAll('#tabbar [data-tab]').forEach((a) => {
    const on = a.dataset.tab === name;
    a.classList.toggle('text-tint', on);
    a.classList.toggle('text-label3', !on);
    a.setAttribute('aria-current', on ? 'page' : 'false');
  });
}

function buildTabbar() {
  for (const [id, ic, label] of TABS) {
    const a = document.querySelector(`#tabbar [data-tab="${id}"]`);
    a.innerHTML = `${icon(ic, 'w-[26px] h-[26px]', 1.7)}<span>${label}</span>`;
  }
  const fab = document.getElementById('fab');
  fab.innerHTML = icon('plus', 'w-8 h-8', 2.4);
  fab.onclick = () => openEntrySheet({ onSaved: () => render({ keepScroll: true }) });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ask = (w) => toast('Nueva versión disponible', {
      type: 'info', duration: 10000, action: 'Actualizar', onAction: () => w.postMessage('SKIP_WAITING'),
    });
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
    });
  }).catch((e) => console.warn('SW no registrado', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

async function boot() {
  buildTabbar();
  try {
    await openDB();
    await loadState();
  } catch (err) {
    console.error(err);
    viewEl.innerHTML = `<div class="p-8 text-center"><p class="font-semibold">No se pudo abrir la base de datos local.</p>
      <p class="text-label2 mt-2 text-[15px]">Si estás en modo privado de Safari, ábrela en modo normal.</p></div>`;
    return;
  }
  applyTheme();
  window.addEventListener('hashchange', () => render());
  await render();
  registerSW();
  // pide almacenamiento persistente si la app ya tiene datos
  if (state.projects.length) navigator.storage?.persist?.();
}

boot();
