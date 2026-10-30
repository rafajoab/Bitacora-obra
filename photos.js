// photos.js — compresión con Canvas, sello de fecha y visor a pantalla completa.
import { uid, getPhotoFull } from './db.js';
import { h, esc, objectURL, revokeScope, shareOrDownload, toast } from './ui.js';
import { icon } from './icons.js';

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

const toBlob = (canvas, q) => new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));

/**
 * Comprime una foto (cámara o galería) a JPEG.
 * opts: { max: 1600, quality: 0.72, stamp: ['Línea 1', 'Línea 2'] | null }
 * Devuelve { meta:{id,w,h,type,thumb,createdAt,size}, full:ArrayBuffer }
 */
export async function compressPhoto(file, { max = 1600, quality = 0.72, stamp = null } = {}) {
  const img = await loadImage(file);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const hgt = Math.round(img.naturalHeight * scale);

  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, hgt);

  if (stamp && stamp.length) {
    const fs = Math.max(14, Math.round(Math.min(w, hgt) * 0.032));
    const pad = Math.round(fs * 0.7);
    const bandH = pad * 2 + fs * stamp.length * 1.25;
    const g = ctx.createLinearGradient(0, hgt - bandH * 1.6, 0, hgt);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
    ctx.fillStyle = g; ctx.fillRect(0, hgt - bandH * 1.6, w, bandH * 1.6);
    ctx.fillStyle = '#C9A227'; ctx.fillRect(pad, hgt - bandH + pad * 0.6, Math.max(3, fs * 0.18), fs * stamp.length * 1.25 - fs * 0.25);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
    stamp.forEach((line, i) => {
      ctx.font = `${i === 0 ? 600 : 400} ${fs}px -apple-system, system-ui, sans-serif`;
      ctx.fillText(line, pad + fs * 0.6, hgt - bandH + pad * 0.6 + i * fs * 1.25, w - pad * 3);
    });
  }

  const fullBlob = await toBlob(c, quality);

  // Miniatura para listas (rápida de cargar)
  const ts = Math.min(1, 360 / Math.max(w, hgt));
  const t = document.createElement('canvas');
  t.width = Math.round(w * ts); t.height = Math.round(hgt * ts);
  const tctx = t.getContext('2d'); tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(c, 0, 0, t.width, t.height);
  const thumbBlob = await toBlob(t, 0.6);

  // Libera memoria del canvas (importante en iPhone)
  c.width = c.height = 0; t.width = t.height = 0;

  return {
    meta: { id: uid(), w, h: hgt, type: 'image/jpeg', thumb: await thumbBlob.arrayBuffer(), size: fullBlob.size, createdAt: Date.now() },
    full: await fullBlob.arrayBuffer(),
  };
}

/** Recomprime un JPEG (para PDFs livianos). Devuelve ArrayBuffer JPEG. */
export async function recompress(buffer, max = 1100, quality = 0.62) {
  const img = await loadImage(new Blob([buffer], { type: 'image/jpeg' }));
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (s === 1 && buffer.byteLength < 260000) return buffer;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const b = await toBlob(c, quality); c.width = c.height = 0;
  return b.arrayBuffer();
}

// ---------- Visor de fotos ----------
/** photos: [{ id, thumb, ... , full? (ArrayBuffer opcional para fotos aún no guardadas) }] */
export function openViewer(photos, start = 0, { caption = '' } = {}) {
  if (!photos.length) return;
  let i = start;
  const scope = 'viewer';
  const root = h(`<div class="fixed inset-0 z-[60] bg-black anim-fade select-none touch-none">
    <div class="absolute inset-0 flex items-center justify-center overflow-hidden" data-stage>
      <img data-img class="max-w-full max-h-full object-contain transition-transform duration-300" style="transition-timing-function: cubic-bezier(.32,.72,0,1)" alt="">
    </div>
    <div class="absolute top-0 inset-x-0 safe-top bg-gradient-to-b from-black/60 to-transparent">
      <div class="h-14 px-3 flex items-center justify-between text-white">
        <button data-close class="press w-10 h-10 rounded-full bg-white/15 flex items-center justify-center" aria-label="Cerrar">${icon('close', 'w-5 h-5', 2.2)}</button>
        <span data-count class="text-[15px] font-semibold"></span>
        <button data-share class="press w-10 h-10 rounded-full bg-white/15 flex items-center justify-center" aria-label="Compartir">${icon('share', 'w-5 h-5', 2)}</button>
      </div>
    </div>
    ${caption ? `<div class="absolute bottom-0 inset-x-0 safe-bottom bg-gradient-to-t from-black/70 to-transparent"><p class="px-5 pt-10 pb-5 text-white/90 text-[15px] leading-snug">${esc(caption)}</p></div>` : ''}
  </div>`);
  document.getElementById('layers').append(root);
  document.body.style.overflow = 'hidden';
  const img = root.querySelector('[data-img]');
  let zoom = 1;

  async function show(idx, dir = 0) {
    i = (idx + photos.length) % photos.length;
    const p = photos[i];
    zoom = 1; img.style.transform = dir ? `translateX(${dir * 40}px)` : '';
    img.style.opacity = '0.4';
    img.src = objectURL(p.thumb, 'image/jpeg', scope);
    root.querySelector('[data-count]').textContent = photos.length > 1 ? `${i + 1} de ${photos.length}` : '';
    requestAnimationFrame(() => { img.style.transform = ''; img.style.opacity = '1'; });
    const full = p.full || await getPhotoFull(p.id);
    if (full && photos[i] === p) img.src = objectURL(full, 'image/jpeg', scope);
  }

  const close = () => {
    root.classList.add('anim-fadeout');
    setTimeout(() => { root.remove(); revokeScope(scope); document.body.style.overflow = ''; }, 200);
  };
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('[data-share]').onclick = async () => {
    const p = photos[i]; const full = p.full || await getPhotoFull(p.id);
    if (!full) return toast('Foto no disponible', { type: 'error' });
    shareOrDownload(new Blob([full], { type: 'image/jpeg' }), `foto-${i + 1}.jpg`);
  };

  // Deslizar ← → para cambiar, ↓ para cerrar, doble toque para zoom
  const stage = root.querySelector('[data-stage]');
  let x0 = null, y0 = null, lastTap = 0;
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
  stage.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = y0 = null;
    if (zoom === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return show(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    if (zoom === 1 && dy > 90) return close();
    const now = Date.now();
    if (now - lastTap < 300) {
      zoom = zoom === 1 ? 2.2 : 1;
      const r = img.getBoundingClientRect();
      img.style.transformOrigin = `${e.clientX - r.left}px ${e.clientY - r.top}px`;
      img.style.transform = `scale(${zoom})`;
    }
    lastTap = now;
  });

  show(i);
}
