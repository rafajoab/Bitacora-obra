// seed.js — plantillas de proyecto. Todo es editable desde Proyectos → (i).
import { uid } from './db.js';

const PASOS_EIFS = ['1. Pegado de EPS', '2. 1ra Base + Malla', '3. 2da Base', '4. Fondo', '5. Textura'];
const PASOS_DEFS = ['1. Base + Malla', '2. 2da Base', '3. Fondo', '4. Textura'];
const PASOS_FASCIA = ['1. Stud + Track', '2. Lámina USG verde'];

/**
 * PH Cala Ocean Reef — misma estructura que "Control Avance Cala Ocean Reef - Fachadas.xlsx":
 * Rubro → Fachada → Bajada → Nivel → Paso (% del paso 25/50/75/100).
 */
export function calaOceanReefTemplate() {
  const now = Date.now();
  return {
    id: uid(),
    name: 'PH Cala Ocean Reef',
    code: 'Cot. 089-2026 REV 6',
    client: 'CONSTRULAB, S.A.',
    contractor: 'SELEVA, S.A.',
    addressee: 'Ing. Roxana – Construlab, S.A.',
    subtitle: 'Control de avance de fachadas – Sistema EIFS/SATE',
    systemLabel: 'Sistema EIFS/SATE',
    location: 'Ocean Reef, Panamá',
    startDate: '',
    endDate: '',
    categories: ['Pared EIFS', 'Frontal T', 'Borde de losa', 'Columnas DEFS', 'Fascia perimetral curva', 'Seguridad', 'Limpieza', 'Otros'],
    fronts: ['Fachada Frontal', 'Fachada Posterior', 'Lateral Derecha', 'Lateral Izquierda'],
    zones: ['Bajada 1', 'Bajada 2', 'Bajada 3', 'Bajada 4', 'Bajada 5', 'Bajada 6'],
    // bajadas que existen en cada fachada (según hoja Metrados)
    zonesByFront: { 'Fachada Frontal': 2, 'Fachada Posterior': 3, 'Lateral Derecha': 6, 'Lateral Izquierda': 5 },
    levels: ['Nivel 000', 'Nivel 100', 'Nivel 200', 'Nivel 300', 'Nivel 400', 'Nivel 500', 'Nivel 600', 'Nivel 700'],
    activities: [...PASOS_EIFS, ...PASOS_DEFS.filter((p) => !PASOS_EIFS.includes(p)), ...PASOS_FASCIA],
    // pasos que aplican a cada rubro (según hoja Configuración)
    activitiesByCategory: {
      'Pared EIFS': PASOS_EIFS, 'Frontal T': PASOS_EIFS, 'Borde de losa': PASOS_EIFS,
      'Columnas DEFS': PASOS_DEFS, 'Fascia perimetral curva': PASOS_FASCIA,
    },
    stepPcts: true, // muestra el selector "% del paso" (25/50/75/100)
    createdAt: now,
    updatedAt: now,
  };
}

/** Proyecto en blanco con categorías generales de construcción. */
export function blankProject(name = 'Nuevo proyecto') {
  const now = Date.now();
  return {
    id: uid(), name, code: '', client: '', contractor: '', addressee: '', subtitle: '', systemLabel: '',
    location: '', startDate: '', endDate: '',
    categories: ['Estructura', 'Fachadas', 'Mampostería', 'Instalaciones', 'Acabados', 'Limpieza', 'Seguridad', 'Otros'],
    fronts: ['Fachada Frontal', 'Fachada Posterior', 'Lateral Derecha', 'Lateral Izquierda'],
    zones: [],
    levels: ['Nivel 100', 'Nivel 200', 'Nivel 300'],
    activities: [],
    stepPcts: false,
    createdAt: now, updatedAt: now,
  };
}
