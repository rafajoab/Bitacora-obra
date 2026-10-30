// views/ajustes.js — apariencia, datos del informe, almacenamiento y respaldos.
import * as db from '../db.js';
import { state, saveSettings, loadState } from '../store.js';
import { pageHeader, mountHeader, esc, toast, confirmDialog, actionSheet, fileReadySheet, bindSwitches, switchHTML, h } from '../ui.js';
import { icon } from '../icons.js';
import { buildBackup, backupName, importBackup } from '../export.js';
import { fmtBytes, fmtShort, toISO } from '../utils.js';

export const APP_VERSION = '1.1.0';

export async function render(root, rerender) {
  const s = state.settings;
  const counts = await db.countAll();
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const daysSinceBackup = s.lastBackup ? Math.floor((Date.now() - s.lastBackup) / 864e5) : null;

  const row = (inner, extra = '') => `<div class="flex items-center justify-between gap-3 px-4 min-h-12 ${extra}">${inner}</div>`;
  const ico = (name, bg) => `<span class="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center text-white shrink-0" style="background:${bg}">${icon(name, 'w-[18px] h-[18px]', 2)}</span>`;

  root.innerHTML = `
    ${pageHeader({ title: 'Ajustes' })}
    <div class="px-4 max-w-xl mx-auto pad-tabbar">

      ${daysSinceBackup === null || daysSinceBackup >= 7 ? `
      <div class="card p-4 mt-4 flex gap-3 items-start anim-view" style="box-shadow: inset 0 0 0 1.5px #C9A227">
        <span class="text-gold mt-0.5">${icon('info', 'w-6 h-6')}</span>
        <div class="text-[14px] leading-snug"><b>Haz un respaldo.</b> Tus datos solo viven en este iPhone. ${daysSinceBackup === null ? 'Aún no has hecho ninguno.' : `El último fue hace ${daysSinceBackup} días.`}
          <button data-backup class="press block mt-2 text-tint font-semibold">Respaldar ahora →</button></div>
      </div>` : ''}

      <span class="label">Apariencia</span>
      <div class="card p-3">
        <div class="seg" data-theme>
          ${[['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join('')}
        </div>
      </div>

      <span class="label">Datos para los informes</span>
      <div class="card group-list">
        ${row(`<span class="flex items-center gap-3 shrink-0">${ico('user', '#0B2545')}Responsable</span><input data-set="author" value="${esc(s.author)}" placeholder="Tu nombre" class="flex-1 min-w-0 text-right bg-transparent outline-none text-label2 py-3">`)}
        ${row(`<span class="flex items-center gap-3 shrink-0">${ico('building', '#2F6690')}Empresa</span><input data-set="company" value="${esc(s.company)}" placeholder="Ej. SELEVA, S.A." class="flex-1 min-w-0 text-right bg-transparent outline-none text-label2 py-3">`)}
      </div>

      <div class="card group-list mt-2">
        ${row(`<span class="flex items-center gap-3">${ico('doc', '#A9050F')}<span class="leading-tight py-2">Logo en los informes PDF<span class="block text-[12px] text-label2">Archivo img/logo-empresa.png</span></span></span>${switchHTML('useLogo', s.useLogo)}`)}
      </div>

      <span class="label">Fotos</span>
      <div class="card group-list">
        ${row(`<span class="flex items-center gap-3">${ico('camera', '#C9A227')}<span class="leading-tight py-2">Sello de fecha y obra<span class="block text-[12px] text-label2">Se imprime sobre cada foto nueva</span></span></span>${switchHTML('stampPhotos', s.stampPhotos)}`)}
        ${row(`<span class="flex items-center gap-3 shrink-0">${ico('photo', '#3A7D44')}Tamaño</span>
          <div class="seg w-48" data-size>${[[1280, 'Ligera'], [1600, 'Normal'], [2048, 'Alta']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${s.photoMax === v}">${l}</button>`).join('')}</div>`)}
      </div>

      <span class="label">Almacenamiento en este iPhone</span>
      <div class="card group-list">
        ${row(`<span class="flex items-center gap-3">${ico('db', '#5C6B73')}Usado</span><span class="text-label2">${est ? `${fmtBytes(est.usage)} de ${fmtBytes(est.quota)}` : 'No disponible'}</span>`)}
        ${est ? `<div class="px-4 py-3"><div class="h-2 rounded-full bg-fill overflow-hidden"><div class="h-full bg-tint rounded-full" style="width:${Math.max(1, Math.min(100, (est.usage / est.quota) * 100)).toFixed(1)}%"></div></div></div>` : ''}
        ${row(`<span>Proyectos · registros · fotos</span><span class="text-label2">${counts.projects} · ${counts.entries} · ${counts.photos}</span>`)}
        ${row(`<span class="leading-tight py-2">Almacenamiento protegido<span class="block text-[12px] text-label2">Evita que el sistema borre datos</span></span>
          ${persisted ? `<span class="text-ok font-semibold flex items-center gap-1">${icon('check', 'w-4 h-4', 2.6)} Activo</span>` : `<button data-persist class="press text-tint font-semibold">Activar</button>`}`)}
      </div>

      <span class="label">Respaldo (cambio de teléfono)</span>
      <div class="card group-list">
        <button data-backup class="press w-full text-left">${row(`<span class="flex items-center gap-3">${ico('download', '#0B2545')}Exportar respaldo completo (JSON)</span><span class="text-label3">${icon('chevR', 'w-4 h-4')}</span>`)}</button>
        <button data-backup-lite class="press w-full text-left">${row(`<span class="flex items-center gap-3">${ico('download', '#8DA9C4')}Exportar respaldo sin fotos</span><span class="text-label3">${icon('chevR', 'w-4 h-4')}</span>`)}</button>
        <button data-import class="press w-full text-left">${row(`<span class="flex items-center gap-3">${ico('upload', '#3A7D44')}Importar / restaurar respaldo</span><span class="text-label3">${icon('chevR', 'w-4 h-4')}</span>`)}</button>
      </div>
      <p class="text-[12px] text-label2 px-1 mt-2">${s.lastBackup ? `Último respaldo: ${fmtShort(toISO(new Date(s.lastBackup)))}.` : ''} Guarda el archivo en iCloud Drive, Google Drive o envíatelo por correo.</p>
      <input type="file" accept="application/json,.json" data-file class="hidden">

      <span class="label">Zona de peligro</span>
      <div class="card"><button data-wipe class="press w-full h-12 text-danger font-medium">Borrar todos los datos de la app</button></div>

      <p class="text-center text-[12px] text-label3 mt-8">Bitácora de Obra v${APP_VERSION} · Funciona sin internet · Datos 100% locales</p>
    </div>`;
  mountHeader(root);
  bindSwitches(root);

  // Apariencia
  root.querySelector('[data-theme]').onclick = async (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    root.querySelectorAll('[data-theme] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    await saveSettings({ theme: b.dataset.v });
  };
  // Textos
  root.querySelectorAll('[data-set]').forEach((i) => i.addEventListener('change', () => saveSettings({ [i.dataset.set]: i.value.trim() }).then(() => toast('Guardado'))));
  // Fotos
  root.querySelector('[data-name="stampPhotos"]').addEventListener('change', (e) => saveSettings({ stampPhotos: e.target.getAttribute('aria-checked') === 'true' }));
  root.querySelector('[data-name="useLogo"]').addEventListener('change', (e) => saveSettings({ useLogo: e.target.getAttribute('aria-checked') === 'true' }));
  root.querySelector('[data-size]').onclick = (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    root.querySelectorAll('[data-size] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    saveSettings({ photoMax: +b.dataset.v });
  };
  // Persistencia
  root.querySelector('[data-persist]')?.addEventListener('click', async () => {
    const ok = await navigator.storage?.persist?.();
    toast(ok ? 'Almacenamiento protegido' : 'iOS lo activa al usar la app desde la pantalla de inicio', { type: ok ? 'ok' : 'info', duration: 3500 });
    rerender();
  });

  // Respaldo
  const doBackup = async (withPhotos) => {
    toast('Preparando respaldo…', { type: 'info', duration: 1500 });
    const blob = await buildBackup(withPhotos);
    await saveSettings({ lastBackup: Date.now() });
    fileReadySheet({ blob, filename: backupName().replace('.json', withPhotos ? '.json' : '_sin-fotos.json'), kind: 'json', title: 'Respaldo listo',
      note: 'Toca Compartir → "Guardar en Archivos" (iCloud Drive) o envíalo a tu correo. Para restaurar: Ajustes → Importar.' });
  };
  root.querySelectorAll('[data-backup]').forEach((b) => (b.onclick = () => doBackup(true)));
  root.querySelector('[data-backup-lite]').onclick = () => doBackup(false);

  const fileIn = root.querySelector('[data-file]');
  root.querySelector('[data-import]').onclick = () => fileIn.click();
  fileIn.onchange = async () => {
    const f = fileIn.files[0]; fileIn.value = '';
    if (!f) return;
    const mode = await actionSheet({ title: `Restaurar “${f.name}”`, options: [
      { label: 'Combinar con mis datos actuales', value: 'merge' },
      { label: 'Reemplazar todo (borra lo actual)', value: 'replace', destructive: true },
    ] });
    if (!mode) return;
    if (mode === 'replace' && !await confirmDialog({ title: '¿Reemplazar todo?', message: 'Se borrarán los datos actuales y se cargarán los del respaldo.', confirmText: 'Reemplazar', destructive: true })) return;
    try {
      const r = await importBackup(f, mode);
      await loadState();
      toast(`Restaurado: ${r.projects} proyectos, ${r.entries} registros, ${r.photos} fotos`, { duration: 3500 });
      rerender();
    } catch (err) { toast(err.message, { type: 'error', duration: 4500 }); }
  };

  // Borrar todo
  root.querySelector('[data-wipe]').onclick = async () => {
    if (!await confirmDialog({ title: '¿Borrar todos los datos?', message: 'Se eliminarán todos los proyectos, registros y fotos de este iPhone. Haz un respaldo antes.', confirmText: 'Borrar todo', destructive: true })) return;
    if (!await confirmDialog({ title: 'Confirmación final', message: 'Esta acción no se puede deshacer.', confirmText: 'Sí, borrar', destructive: true })) return;
    await db.wipeAll(); await loadState(); toast('Datos borrados'); location.hash = '#/bitacora';
  };
}
