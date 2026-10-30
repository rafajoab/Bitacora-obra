// views/bitacora.js — línea de tiempo de avances agrupada por día.
import * as db from './db.js';
import { state, setActiveProject } from './store.js';
import { pageHeader, mountHeader, esc, emptyState, actionSheet, objectURL, toast } from './ui.js';
import { icon } from './icons.js';
import { openEntrySheet, openDaySheet } from './registro.js';
import { openViewer } from './photos.js';
import { calaOceanReefTemplate } from './seed.js';
import { todayISO, relDay, fmtShort, weatherSummary, catColor, debounce, cap, fmtLong, whereText, whatText } from './utils.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const textOn = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#0B2545' : '#FFFFFF';
};

export async function render(root, rerender) {
  const p = state.project;

  if (!p) {
    root.innerHTML = pageHeader({ title: 'Bitácora' }) + emptyState('hard', 'Bienvenida a tu bitácora',
      'Crea tu primera obra para empezar a registrar avances, fotos y clima. Todo queda guardado en este iPhone.',
      `<button data-tpl class="btn-gold w-full">${icon('sparkle', 'w-5 h-5')} Usar plantilla PH Cala Ocean Reef</button>
       <a href="#/proyectos?nuevo=1" class="btn-soft w-full">${icon('plus', 'w-5 h-5')} Crear proyecto en blanco</a>`);
    mountHeader(root);
    root.querySelector('[data-tpl]').onclick = async () => {
      const proj = calaOceanReefTemplate();
      await db.put('projects', proj);
      state.projects = await db.listProjects();
      await setActiveProject(proj.id);
      toast('Proyecto creado'); rerender();
    };
    return;
  }

  const [entries, daysArr] = await Promise.all([db.entriesByProject(p.id), db.daysByProject(p.id)]);
  const days = Object.fromEntries(daysArr.map((d) => [d.date, d]));
  const today = todayISO();
  const todayEntries = entries.filter((e) => e.date === today);
  const datesWithData = new Set([...entries.map((e) => e.date)]);

  let filterCat = '';
  let query = '';
  let pageDays = 10;

  root.innerHTML = `
    ${pageHeader({ title: 'Bitácora', subtitle: p.name, subtitleAction: true,
      right: `<button data-weather-today class="press w-9 h-9 rounded-full flex items-center justify-center text-tint" aria-label="Clima de hoy">${icon('rain', 'w-6 h-6')}</button>` })}
    <div class="px-4 max-w-xl mx-auto pad-tabbar">
      <div class="card p-4 mt-4 anim-view">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[13px] uppercase tracking-wide text-label2 font-medium">Hoy</p>
            <p class="font-semibold text-[17px] truncate">${esc(cap(fmtLong(today)))}</p>
          </div>
          <button data-new class="press shrink-0 h-9 px-3.5 rounded-full bg-tint text-ontint text-[15px] font-semibold flex items-center gap-1">${icon('plus', 'w-4 h-4', 2.4)} Registrar</button>
        </div>
        <button data-day="${today}" class="press mt-3 w-full flex items-center gap-2 rounded-xl bg-fill px-3 h-10 text-[14px] ${days[today] ? 'text-label' : 'text-label2'}">
          ${icon('cloud', 'w-5 h-5 shrink-0 text-tint')}
          <span class="truncate">${esc(weatherSummary(days[today]) || 'Anotar clima y condiciones de hoy')}</span>
          <span class="ml-auto text-label3">${icon('chevR', 'w-4 h-4')}</span>
        </button>
        <div class="grid grid-cols-3 gap-2 mt-3 text-center">
          ${[['Registros hoy', todayEntries.length], ['Días con avance', datesWithData.size], ['Registros total', entries.length]]
            .map(([l, v]) => `<div class="rounded-xl bg-fill py-2.5"><p class="text-[22px] font-bold leading-none">${v}</p><p class="text-[11px] text-label2 mt-1">${l}</p></div>`).join('')}
        </div>
      </div>

      ${entries.length ? `
      <div class="mt-5 relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-label3">${icon('search', 'w-[18px] h-[18px]')}</span>
        <input data-search type="search" placeholder="Buscar en la bitácora" class="w-full h-10 rounded-xl bg-fill pl-9 pr-3 text-[16px] outline-none placeholder:text-label2">
      </div>
      <div data-cats class="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 mt-3">
        <button class="chip" data-cat="" aria-pressed="true">Todas</button>
        ${p.categories.filter((c) => entries.some((e) => e.category === c)).map((c) => `<button class="chip" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}
      </div>
      <div data-feed></div>` : emptyState('book', 'Aún no hay registros', 'Toca el botón dorado + para anotar el primer avance del día.')}
    </div>`;
  mountHeader(root);

  // ---- acciones de encabezado ----
  root.querySelector('[data-subtitle]').onclick = async () => {
    const id = await actionSheet({
      title: 'Cambiar de proyecto',
      options: [...state.projects.map((x) => ({ label: x.name, value: x.id, selected: x.id === p.id })), { label: 'Administrar proyectos…', value: '__manage' }],
    });
    if (!id) return;
    if (id === '__manage') { location.hash = '#/proyectos'; return; }
    await setActiveProject(id); rerender();
  };
  root.querySelector('[data-new]').onclick = () => openEntrySheet({ onSaved: rerender });
  root.querySelector('[data-weather-today]').onclick = () => openDaySheet({ date: today, onSaved: rerender });
  root.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]'); if (d) openDaySheet({ date: d.dataset.day, onSaved: rerender });
  });

  if (!entries.length) return;

  // ---- feed ----
  const feed = root.querySelector('[data-feed]');
  async function renderFeed() {
    const q = norm(query);
    const filtered = entries.filter((e) => (!filterCat || e.category === filterCat) &&
      (!q || norm([e.text, e.category, e.front, e.zone, e.level, e.activity].join(' ')).includes(q)));
    const groups = [];
    for (const e of filtered) {
      const g = groups[groups.length - 1];
      if (g && g.date === e.date) g.items.push(e); else groups.push({ date: e.date, items: [e] });
    }
    const visible = groups.slice(0, pageDays);
    const photos = await db.photosForEntries(visible.flatMap((g) => g.items.map((e) => e.id)));

    if (!visible.length) { feed.innerHTML = emptyState('search', 'Sin resultados', 'Prueba con otra palabra o categoría.'); return; }

    feed.innerHTML = visible.map((g) => {
      const day = days[g.date];
      return `<section class="mt-7 anim-view">
        <div class="flex items-baseline justify-between px-1 mb-2">
          <h2 class="text-[20px] font-bold">${esc(relDay(g.date))}</h2>
          <span class="text-[13px] text-label2">${esc(fmtShort(g.date))} · ${g.items.length} ${g.items.length === 1 ? 'registro' : 'registros'}</span>
        </div>
        ${day ? `<button data-day="${g.date}" class="press w-full text-left card px-4 py-2.5 mb-2 flex items-center gap-2 text-[14px]">
          ${icon('cloud', 'w-5 h-5 text-tint shrink-0')}<span class="min-w-0 flex-1"><span class="block truncate">${esc(weatherSummary(day))}</span>
          ${day.crew !== '' && day.crew != null ? `<span class="block text-[12px] text-label2">${day.crew} personas en obra${day.weatherNote ? ' · ' + esc(day.weatherNote) : ''}</span>` : day.weatherNote ? `<span class="block text-[12px] text-label2 truncate">${esc(day.weatherNote)}</span>` : ''}</span>
          <span class="text-label3">${icon('chevR', 'w-4 h-4')}</span></button>` : ''}
        <div class="card group-list overflow-hidden">
          ${g.items.map((e) => {
            const col = catColor(p, e.category);
            const ph = photos[e.id] || [];
            const where = whereText(e);
            const extra = whatText(e);
            return `<article data-entry="${e.id}" class="px-4 py-3.5 active:bg-fill transition-colors">
              <div class="flex items-center gap-2 mb-1.5 min-w-0">
                <span class="shrink-0 inline-flex items-center h-[22px] px-2 rounded-md text-[12px] font-semibold" style="background:${col};color:${textOn(col)}">${esc(e.category)}</span>
                <span class="text-[13px] text-label2 truncate">${esc(where)}</span>
                <span class="ml-auto shrink-0 text-[12px] text-label3">${new Date(e.createdAt).toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <p class="text-[15px] leading-snug whitespace-pre-line">${esc(e.text)}</p>
              ${extra ? `<p class="text-[13px] text-label2 mt-1">${esc(extra)}</p>` : ''}
              ${ph.length ? `<div class="flex gap-1.5 mt-2.5 overflow-x-auto no-scrollbar -mx-4 px-4">
                ${ph.map((x, i) => `<button data-ph="${e.id}:${i}" class="press shrink-0 w-[68px] h-[68px] rounded-lg overflow-hidden bg-fill"><img loading="lazy" src="${objectURL(x.thumb)}" class="w-full h-full object-cover" alt=""></button>`).join('')}
              </div>` : ''}
            </article>`;
          }).join('')}
        </div>
      </section>`;
    }).join('') + (groups.length > pageDays ? `<button data-more class="btn-soft w-full mt-6">Ver días anteriores (${groups.length - pageDays})</button>` : '');

    feed.onclick = (ev) => {
      const ph = ev.target.closest('[data-ph]');
      if (ph) { const [id, i] = ph.dataset.ph.split(':'); const e = entries.find((x) => x.id === id); return openViewer(photos[id], +i, { caption: e?.text }); }
      if (ev.target.closest('[data-more]')) { pageDays += 10; return renderFeed(); }
      const art = ev.target.closest('[data-entry]');
      if (art) openEntrySheet({ entry: entries.find((x) => x.id === art.dataset.entry), onSaved: rerender });
    };
  }

  root.querySelector('[data-cats]').onclick = (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    root.querySelectorAll('[data-cat]').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    filterCat = b.dataset.cat; renderFeed();
  };
  root.querySelector('[data-search]').addEventListener('input', debounce((e) => { query = e.target.value; renderFeed(); }, 180));
  await renderFeed();
}
