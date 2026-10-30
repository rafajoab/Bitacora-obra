# Bitácora de Obra — PWA para iPhone

Control diario de avances de obra con fotos, clima, informes PDF, CSV y respaldo.
**100 % gratis y local**: sin servidores, sin base de datos en la nube, sin APIs de pago. Funciona sin internet.

---

## 1. Arquitectura de archivos

```
bitacora-obra/
├── index.html               ← Estructura de la app, barra inferior, metas iOS
├── manifest.webmanifest     ← Nombre, ícono y modo "app" (standalone)
├── sw.js                    ← Service Worker: caché offline (subir VERSION al actualizar)
├── css/
│   ├── app.css              ← CSS final (Tailwind v4 ya compilado) ← el que usa la app
│   └── input.css            ← Fuente Tailwind: tokens de color, modo oscuro, animaciones
├── js/
│   ├── app.js               ← Arranque, rutas (#/bitacora…), pestañas, actualización
│   ├── db.js                ← IndexedDB: proyectos, registros, días, fotos, respaldo
│   ├── store.js             ← Estado global: proyecto activo, ajustes, tema
│   ├── ui.js                ← Hojas modales, alertas, avisos, chips, compartir
│   ├── icons.js             ← Íconos SVG estilo SF Symbols
│   ├── utils.js             ← Fechas, horas, clima, formatos
│   ├── seed.js              ← Plantilla PH Cala Ocean Reef y proyecto en blanco
│   ├── photos.js            ← Compresión con Canvas, sello de fecha, visor
│   ├── report-pdf.js        ← Generador del informe PDF (pdf-lib)
│   ├── export.js            ← CSV para Excel y respaldo JSON (exportar/importar)
│   └── views/
│       ├── bitacora.js      ← Pestaña Bitácora (línea de tiempo por día)
│       ├── registro.js      ← Formulario de registro + clima del día
│       ├── proyectos.js     ← Pestaña Proyectos (crear/editar/eliminar)
│       ├── informes.js      ← Pestaña Informes (PDF y CSV por periodo)
│       └── ajustes.js       ← Pestaña Ajustes (tema, respaldo, almacenamiento)
├── vendor/
│   └── pdf-lib.min.js       ← Motor PDF (MIT), incluido para funcionar offline
├── img/
│   └── logo-empresa.png     ← Logo del encabezado del PDF (SELEVA). Reemplázalo para otra empresa
└── icons/                   ← Íconos de la app (iPhone, Android, maskable)
```

### Modelo de datos (IndexedDB `bitacora-obra`)

| Store | Contenido |
|---|---|
| `projects` | Obra: nombre, cliente, contratista, código, listas de categorías / frentes / niveles / actividades |
| `entries` | Registro: fecha, rubro, fachada, bajada, nivel, paso, % del paso, descripción, cantidad + unidad |
| `days` | Clima del día por obra: condición, intervalos de lluvia, personal, notas |
| `photos` | Datos y miniatura de cada foto (listas rápidas) |
| `blobs` | Foto completa comprimida (se carga solo al verla o en el PDF) |
| `settings` | Proyecto activo, tema, responsable, empresa, último respaldo |

---

### Plantilla PH Cala Ocean Reef (igual al Excel "Control Avance – Fachadas")
- Rubros: Pared EIFS, Frontal T, Borde de losa, Columnas DEFS, Fascia perimetral curva (+ Seguridad, Limpieza, Otros).
- Fachadas y bajadas: Frontal (2), Posterior (3), Lateral Derecha (6), Lateral Izquierda (5).
- Niveles: 000 a 700. Pasos según rubro: EIFS 1–5, DEFS 1–4, Fascia Stud + Track / Lámina USG verde.
- % del paso: 25 / 50 / 75 / 100 (como la columna "Paso actual" del Excel).
- El CSV sale en el mismo orden: Rubro → Fachada → Bajada → Nivel → Paso → % del paso.

## 2. Publicarla gratis (una sola vez, desde una computadora)

La PWA necesita una dirección **https**. Opción recomendada (permanente y gratis):

### Opción A — GitHub Pages
1. Crea una cuenta gratis en **github.com**.
2. **New repository** → nombre `bitacora-obra` → Public → **Create repository**.
3. Toca **uploading an existing file** y **arrastra el contenido de la carpeta** `bitacora-obra` (index.html, css, js, icons, vendor, etc.). Arrastra desde la computadora para que se conserven las subcarpetas. → **Commit changes**.
4. **Settings → Pages → Branch: `main` / `(root)` → Save**.
5. En 1–2 minutos tendrás: `https://TU-USUARIO.github.io/bitacora-obra/`

### Opción B — Netlify Drop (más rápido)
1. Entra a **app.netlify.com/drop**, crea cuenta gratis.
2. Arrastra la carpeta `bitacora-obra` completa → te da una URL https al instante.

---

## 3. Instalarla en el iPhone

1. Abre la URL en **Safari** (no en Chrome ni dentro de WhatsApp).
2. Toca **Compartir** (cuadro con flecha ↑) → **Agregar a pantalla de inicio**.
3. Si aparece “Abrir como app web”, déjalo activado → **Agregar**.
4. Abre la app **desde el ícono** con internet la primera vez (se guarda para uso offline).
5. Desde ahí funciona en obra **sin señal**.

Requiere iOS 16.4 o superior.

---

## 4. Cómo gestionar el almacenamiento (importante)

- **Los datos viven solo en ese iPhone**, dentro de la app instalada. Safari y la app instalada tienen almacenamientos **separados**: usa siempre el ícono.
- **No borres el ícono** de la pantalla de inicio: iOS elimina sus datos con él.
- Ajustes → **Almacenamiento protegido → Activar**, para pedir a iOS que no borre datos por falta de espacio.
- Las fotos se guardan comprimidas (~150–300 KB cada una). 1 000 fotos ≈ 200–300 MB.
- **Respaldo semanal**: Ajustes → *Exportar respaldo completo* → Compartir → *Guardar en Archivos* (iCloud Drive) o envíatelo por correo. La app te recuerda si pasan más de 7 días.
- **Cambio de teléfono**: instala la app en el nuevo iPhone → Ajustes → *Importar / restaurar respaldo* → elige el `.json`.

---

## 5. Actualizar la app

1. Reemplaza los archivos modificados en GitHub/Netlify.
2. En `sw.js` cambia `VERSION` (ej. `bitacora-v1.0.1`).
3. Al abrir la app aparecerá “Nueva versión disponible → Actualizar”. **Tus datos no se tocan.**

## 6. Cambiar estilos (opcional)

`css/app.css` ya está compilado. Si editas clases o `css/input.css`, recompila con Tailwind v4:
```
npx @tailwindcss/cli -i css/input.css -o css/app.css --minify
```
