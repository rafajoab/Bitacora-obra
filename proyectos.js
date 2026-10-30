// views/proyectos.js — lista de obras, crear/editar/eliminar.
import * as db from './db.js';
import { state, setActiveProject, refreshProjects } from './store.js';
import { pageHeader, mountHeader, esc, sheet, toast, confirmDialog, h, emptyState, bindSwitches } from './ui.js';
import { icon } from './icons.js';
import { calaOceanReefTemplate, blankProject } from './seed.js';
import { parseList, fmtShort } from './utils.js';

export async function render(root, rerender, params) {
  await refreshProjects();
  const counts = {};
  await Promise.all(state.projects.map(async (p) => {
    const e = await db.entriesByProject(p.id);
    counts[p.id] = { n: e.length, last: e[0]?.date };
  }));
  const hasCala = state.projects.some((p) => /cala ocean reef/i.test(p.name));

  root.innerHTML = `
    ${pageHeader({ title: 'Proyectos', right: `<button data-add class="press w-9 h-9 rounded-full flex items-center justify-center text-tint" aria-label="Nuevo proyecto">${icon('plus', 'w-6 h-6', 2.2)}</button>` })}
    <div class="px-4 max-w-xl mx-auto pad-tabbar">
      ${state.projects.length ? `
      <p class="label">Toca una obra para activarla</p>
      <div class="card group-list overflow-hidden stagger">
        ${state.projects.map((p) => {
          const active = state.project?.id === p.id;
          const c = counts[p.id];
          return `<div class="flex items-center">
            <button data-pick="${p.id}" class="press flex-1 min-w-0 flex items-center gap-3 pl-4 py-3 text-left">
              <span class="w-11 h-11 shrink-0 rounded-xl ${active ? 'bg-gold text-navy' : 'bg-fill text-label2'} flex items-center justify-center">${icon('building', 'w-6 h-6', 1.7)}</span>
              <span class="min-w-0">
                <span class="block font-semibold text-[17px] truncate">${esc(p.name)}</span>
                <span class="block text-[13px] text-label2 truncate">${esc([p.client, `${c.n} registros`, c.last ? 'último ' + fmtShort(c.last) : ''].filter(Boolean).join(' · '))}</span>
              </span>
              ${active ? `<span class="ml-auto text-tint">${icon('check', 'w-5 h-5', 2.4)}</span>` : ''}
            </button>
            <button data-edit="${p.id}" class="press w-12 h-14 shrink-0 flex items-center justify-center text-tint" aria-label="Editar">${icon('info', 'w-[22px] h-[22px]')}</button>
          </div>`;
        }).join('')}
      </div>` : emptyState('building', 'Sin proyectos', 'Crea tu primera obra para empezar.')}

      <div class="grid gap-2.5 mt-6">
        <button data-add class="btn-primary w-full">${icon('plus', 'w-5 h-5', 2.2)} Nuevo proyecto</button>
        ${hasCala ? '' : `<button data-tpl class="btn-soft w-full">${icon('sparkle', 'w-5 h-5')} Agregar plantilla PH Cala Ocean Reef</button>`}
      </div>
      <p class="text-[13px] text-label2 px-1 mt-4 leading-relaxed">Cada proyecto tiene su propia lista de tipos de trabajo, frentes, niveles y actividades. Edítalas con el botón ⓘ.</p>
    </div>`;
  mountHeader(root);

  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => openProjectSheet(null, rerender)));
  root.querySelector('[data-tpl]')?.addEventListener('click', async () => {
    const p = calaOceanReefTemplate(); await db.put('projects', p);
    await refreshProjects(); await setActiveProject(p.id); toast('Plantilla agregada'); rerender();
  });
  root.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = async () => {
    await setActiveProject(b.dataset.pick); location.hash = '#/bitacora';
  }));
  root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openProjectSheet(state.projects.find((p) => p.id === b.dataset.edit), rerender)));

  if (params.get('nuevo') === '1') { history.replaceState(null, '', '#/proyectos'); openProjectSheet(null, rerender); }
}

export function openProjectSheet(project, onSaved) {
  const isEdit = !!project;
  const p = project || blankProject('');
  const txt = (k, label, ph = '', type = 'text') =>
    `<span class="label">${label}</span><input data-k="${k}" type="${type}" value="${esc(p[k] || '')}" placeholder="${esc(ph)}" class="field">`;
  const list = (k, label, hint) =>
    `<span class="label">${label}</span><textarea data-l="${k}" rows="4" class="field resize-none leading-snug" placeholder="${esc(hint)}">${esc((p[k] || []).join('\n'))}</textarea>`;

  const body = h(`<div>
    ${txt('name', 'Nombre de la obra *', 'Ej. PH Cala Ocean Reef')}
    ${txt('client', 'Cliente', 'Ej. CONSTRULAB, S.A.')}
    ${txt('contractor', 'Contratista', 'Ej. SELEVA, S.A.')}
    ${txt('location', 'Ubicación', 'Ciudad / sector')}
    ${txt('code', 'Código / contrato / cotización', 'Ej. Cot. 089-2026')}
    ${txt('addressee', 'Informe dirigido a', 'Ej. Ing. Roxana – Construlab, S.A.')}
    ${txt('subtitle', 'Subtítulo del informe', 'Ej. Control de avance de fachadas – EIFS/SATE')}
    ${txt('systemLabel', 'Texto bajo el logo', 'Ej. Sistema EIFS/SATE')}
    <div class="grid grid-cols-2 gap-3">
      <div>${txt('startDate', 'Inicio', '', 'date')}</div>
      <div>${txt('endDate', 'Fin previsto', '', 'date')}</div>
    </div>
    <p class="text-[13px] text-label2 px-1 mt-6">Listas de opciones rápidas — <b>una por línea</b>:</p>
    ${list('categories', 'Tipos de trabajo (categorías)', 'Estructura\nFachadas\nAcabados')}
    ${list('fronts', 'Fachadas / frentes', 'Fachada Frontal\nLateral Derecha')}
    ${list('zones', 'Bajadas / ejes / zonas', 'Bajada 1\nBajada 2')}
    ${list('levels', 'Niveles', 'Nivel 100\nNivel 200')}
    ${list('activities', 'Pasos / actividades', '1. Pegado de EPS\n2. 1ra Base + Malla')}
    <div class="card flex items-center justify-between px-4 min-h-12 mt-4"><span>Mostrar “% del paso” (25–100 %)</span>
      <button type="button" role="switch" data-stp aria-checked="${!!p.stepPcts}" class="switch"></button></div>
    ${isEdit ? `<button data-del class="btn-danger w-full mt-8">${icon('trash', 'w-5 h-5')} Eliminar proyecto</button>` : ''}
  </div>`);

  const s = sheet({
    title: isEdit ? 'Editar proyecto' : 'Nuevo proyecto', full: true, body,
    primary: { label: isEdit ? 'Guardar' : 'Crear', onClick: async () => {
      const out = { ...p, updatedAt: Date.now() };
      body.querySelectorAll('[data-k]').forEach((i) => (out[i.dataset.k] = i.value.trim()));
      body.querySelectorAll('[data-l]').forEach((t) => (out[t.dataset.l] = parseList(t.value)));
      out.stepPcts = body.querySelector('[data-stp]').getAttribute('aria-checked') === 'true';
      if (!out.name) { toast('Escribe el nombre de la obra', { type: 'error' }); return false; }
      if (!out.categories.length) out.categories = ['General'];
      await db.put('projects', out);
      await refreshProjects();
      if (!isEdit || !state.project) await setActiveProject(out.id);
      toast(isEdit ? 'Proyecto actualizado' : 'Proyecto creado');
      onSaved?.(); return true;
    } },
  });

  bindSwitches(body);
  body.querySelector('[data-del]')?.addEventListener('click', async () => {
    const c = (await db.entriesByProject(p.id)).length;
    if (!await confirmDialog({ title: `¿Eliminar “${p.name}”?`, message: `Se borrarán ${c} registros, sus fotos y el clima. Haz un respaldo antes si lo necesitas.`, confirmText: 'Eliminar', destructive: true })) return;
    await db.deleteProject(p.id);
    await refreshProjects();
    if (state.project) await setActiveProject(state.project.id);
    toast('Proyecto eliminado'); s.close(); onSaved?.();
  });
}
