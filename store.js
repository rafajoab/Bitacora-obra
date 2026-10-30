// store.js — estado global de la app (proyecto activo y ajustes)
import * as db from './db.js';

export const DEFAULT_SETTINGS = {
  theme: 'system',          // system | light | dark
  author: '',               // Responsable que firma los informes
  company: '',              // Empresa que emite el informe
  stampPhotos: true,        // Sello de fecha/proyecto sobre las fotos
  useLogo: true,            // Logo de la empresa en el encabezado del PDF (logo-empresa.png)
  photoMax: 1600,           // Lado máximo al guardar fotos (px)
  photoQuality: 0.72,       // Calidad JPEG al guardar
  lastBackup: null,         // Fecha del último respaldo
};

export const state = {
  settings: { ...DEFAULT_SETTINGS },
  projects: [],
  project: null,
};

export async function loadState() {
  const saved = await db.getSetting('app', {});
  state.settings = { ...DEFAULT_SETTINGS, ...saved };
  state.projects = await db.listProjects();
  const activeId = await db.getSetting('activeProjectId');
  state.project = state.projects.find((p) => p.id === activeId) || state.projects[0] || null;
}

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.setSetting('app', state.settings);
  if ('theme' in patch) applyTheme();
}

export async function setActiveProject(id) {
  state.project = state.projects.find((p) => p.id === id) || null;
  await db.setSetting('activeProjectId', id);
}

export async function refreshProjects() {
  state.projects = await db.listProjects();
  if (state.project) state.project = state.projects.find((p) => p.id === state.project.id) || state.projects[0] || null;
  else state.project = state.projects[0] || null;
}

const mq = matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const t = state.settings.theme;
  try { localStorage.setItem('bo-theme', t); } catch {}
  const dark = t === 'dark' || (t === 'system' && mq.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#F2F2F7'));
}
mq.addEventListener?.('change', () => state.settings.theme === 'system' && applyTheme());
