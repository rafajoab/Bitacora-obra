// report-pdf.js — informe PDF con el formato técnico de SELEVA (pdf-lib).
// Estilo tomado del "Informe Verificación Alturas": logo arriba a la derecha, azul #021335,
// rojo #A9050F, tabla de datos con etiquetas azules, secciones numeradas, figuras y firma.
// Es independiente del DOM: recibe los datos y devuelve los bytes del PDF.
import { fmtLong, fmtShort, cap, weatherSummary, rainHours, fmtHours, weatherById, fmtTime, whereText } from './utils.js';

const PAGE_W = 612, PAGE_H = 792, M = 50;          // Carta
const CW = PAGE_W - M * 2;
const hex = (PDFLib, h) => { const n = parseInt(h.slice(1), 16); return PDFLib.rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

/**
 * o: { PDFLib, project, from, to, title, entries[], days{date:day}, photosByEntry{entryId:[photo]},
 *      loadPhoto(photo) → ArrayBuffer JPEG, logo (ArrayBuffer PNG/JPG opcional),
 *      settings{author, company}, includePhotos, maxPhotosPerEntry }
 */
export async function buildReportPDF(o) {
  const { PDFLib, project: P, from, to, entries, days = {}, photosByEntry = {}, loadPhoto, settings = {} } = o;
  const includePhotos = o.includePhotos !== false;
  const maxPh = o.maxPhotosPerEntry || 99;
  const { PDFDocument, StandardFonts } = PDFLib;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${o.title} – ${P.name}`);
  pdf.setAuthor(settings.company || P.contractor || '');
  pdf.setCreator('Bitácora de Obra (PWA)');
  const F = await pdf.embedFont(StandardFonts.Helvetica);
  const FB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const FI = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const C = {
    navy: hex(PDFLib, '#021335'), red: hex(PDFLib, '#A9050F'), text: hex(PDFLib, '#111111'),
    gray: hex(PDFLib, '#555555'), head: hex(PDFLib, '#E9EEF6'), label: hex(PDFLib, '#F2F4F7'),
    border: hex(PDFLib, '#C9D1DC'), white: PDFLib.rgb(1, 1, 1), photoBg: hex(PDFLib, '#FAFBFC'),
  };

  let logo = null;
  if (o.logo) {
    try {
      const b = new Uint8Array(o.logo);
      logo = b[0] === 0x89 ? await pdf.embedPng(b) : await pdf.embedJpg(b);
    } catch (e) { logo = null; }
  }

  // Solo caracteres que Helvetica (WinAnsi) puede dibujar
  const charset = new Set(F.getCharacterSet());
  const clean = (s) => String(s ?? '').replace(/\t/g, ' ').replace(/[‘’]/g, "'")
    .split('').map((ch) => (ch === '\n' || charset.has(ch.codePointAt(0)) ? ch : '')).join('');

  const wrap = (txt, font, size, maxW) => {
    const out = [];
    for (const para of clean(txt).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const w of words) {
        const t = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(t, size) <= maxW) { line = t; continue; }
        if (line) out.push(line);
        let rest = w;
        while (font.widthOfTextAtSize(rest, size) > maxW) {
          let k = rest.length; while (k > 1 && font.widthOfTextAtSize(rest.slice(0, k), size) > maxW) k--;
          out.push(rest.slice(0, k)); rest = rest.slice(k);
        }
        line = rest;
      }
      out.push(line);
    }
    return out;
  };

  let page, y;
  const pages = [];
  const TOP = PAGE_H - 100, BOTTOM = M + 30;
  const periodTxt = from === to ? cap(fmtLong(from)) : `Del ${fmtShort(from)} al ${fmtShort(to)}`;

  const text = (s, x, yy, { font = F, size = 10, color = C.text, maxW } = {}) => {
    let t = clean(s);
    if (maxW) while (t && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + '…';
    page.drawText(t, { x, y: yy, size, font, color });
  };
  const textRight = (s, xr, yy, opts = {}) => text(s, xr - (opts.font || F).widthOfTextAtSize(clean(s), opts.size || 10), yy, opts);
  const textCenter = (s, yy, opts = {}) => text(s, M + (CW - (opts.font || F).widthOfTextAtSize(clean(s), opts.size || 10)) / 2, yy, opts);
  const rect = (x, yy, w, hh, color, border) => page.drawRectangle({ x, y: yy, width: w, height: hh, color, ...(border ? { borderColor: border, borderWidth: 0.6 } : {}) });

  // ---------- encabezado de cada página (como el Word) ----------
  function newPage() {
    page = pdf.addPage([PAGE_W, PAGE_H]); pages.push(page);
    text(P.name.toUpperCase(), M, PAGE_H - 50, { font: FB, size: 10.5, color: C.navy, maxW: CW * 0.55 });
    text(o.title, M, PAGE_H - 62, { size: 8, color: C.gray, maxW: CW * 0.55 });
    if (logo) {
      const lh = 34, lw = logo.width * (lh / logo.height);
      page.drawImage(logo, { x: PAGE_W - M - lw, y: PAGE_H - 34 - lh, width: lw, height: lh });
    } else if (settings.company || P.contractor) {
      textRight(settings.company || P.contractor, PAGE_W - M, PAGE_H - 54, { font: FB, size: 13, color: C.red });
    }
    if (P.systemLabel) textRight(P.systemLabel, PAGE_W - M, PAGE_H - 79, { size: 7, color: C.gray });
    rect(M, PAGE_H - 84, CW, 0.8, C.navy);
    y = TOP;
  }
  const ensure = (hh) => { if (y - hh < BOTTOM) newPage(); };

  // ---------- títulos de sección ----------
  let sec = 0, sub = 0;
  function section(title, keep = 80) {
    ensure(keep); sec++; sub = 0; y -= 8;
    text(`${sec}. ${title.toUpperCase()}`, M, y, { font: FB, size: 12.5, color: C.navy });
    y -= 7; rect(M, y, CW, 1.3, C.red); y -= 18;
  }
  function subsection(title, keep = 80) {
    ensure(keep); sub++; y -= 4;
    rect(M, y - 2, 2.6, 13, C.red);
    text(`${sec}.${sub} ${title.toUpperCase()}`, M + 8, y, { font: FB, size: 10.5, color: C.navy, maxW: CW - 10 });
    y -= 17;
  }
  function paragraph(s, { font = F, size = 10, color = C.text, gap = 6 } = {}) {
    for (const line of wrap(s, font, size, CW)) { ensure(size + 4); text(line, M, y, { font, size, color }); y -= size * 1.38; }
    y -= gap;
  }

  // ---------- tabla genérica con ajuste de texto y salto de página ----------
  function table(cols, rows, { head = true, labelCol = false, size = 9 } = {}) {
    const pad = 5, lh = size * 1.3;
    const drawRow = (cells, isHead) => {
      const fonts = cells.map((_, i) => (isHead || (labelCol && i === 0) ? FB : F));
      const lines = cells.map((c, i) => wrap(c ?? '', fonts[i], size, cols[i].w - pad * 2));
      const hh = Math.max(...lines.map((l) => l.length)) * lh + pad * 2 - (lh - size);
      if (y - hh < BOTTOM) { newPage(); if (head && !isHead) drawRow(cols.map((c) => c.label), true); }
      let x = M;
      cells.forEach((_, i) => {
        const navyLabel = labelCol === 'navy' && i === 0 && !isHead;
        const fill = isHead ? C.head : navyLabel ? C.navy : (labelCol && i === 0) ? C.label : C.white;
        rect(x, y - hh, cols[i].w, hh, fill, C.border);
        lines[i].forEach((t, k) => text(t, x + pad, y - pad - size * 0.82 - k * lh, { font: fonts[i], size, color: navyLabel ? C.white : C.text }));
        x += cols[i].w;
      });
      y -= hh;
    };
    if (head) drawRow(cols.map((c) => c.label), true);
    rows.forEach((r) => drawRow(r, false));
    y -= 12;
  }

  // ================= PORTADA =================
  newPage();
  textCenter(o.title.toUpperCase(), y, { font: FB, size: 18, color: C.navy }); y -= 22;
  const subt = P.subtitle || 'Registro diario de avance de obra';
  for (const l of wrap(subt.toUpperCase(), FB, 12, CW - 40)) { textCenter(l, y, { font: FB, size: 12, color: C.navy }); y -= 16; }
  y -= 2; rect(M, y, CW, 1.5, C.red); y -= 18;

  const company = settings.company || P.contractor || '';
  table([{ w: 130 }, { w: CW - 130 }], [
    ['Proyecto', P.name],
    P.addressee ? ['Dirigido a', P.addressee] : null,
    company ? ['Elaborado por', company] : null,
    [from === to ? 'Fecha' : 'Periodo', periodTxt],
    ['Asunto', `${o.title} – actividades ejecutadas, clima y evidencia fotográfica${P.code ? ` (${P.code})` : ''}`],
    settings.author ? ['Responsable', settings.author] : null,
  ].filter(Boolean), { head: false, labelCol: 'navy', size: 10 });

  // ================= 1. RESUMEN =================
  const workDates = [...new Set(entries.map((e) => e.date))].sort();
  const dayList = Object.values(days).filter((d) => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const allDates = [...new Set([...workDates, ...dayList.map((d) => d.date)])].sort();
  const totalPhotos = entries.reduce((s, e) => s + Math.min(maxPh, (photosByEntry[e.id] || []).length), 0);
  const totalRain = dayList.reduce((s, d) => s + rainHours(d), 0);
  const crews = dayList.map((d) => d.crew).filter((c) => c !== '' && c != null && !isNaN(c)).map(Number);

  section('Resumen del periodo');
  table([{ w: 250, label: 'PARÁMETRO' }, { w: CW - 250, label: 'RESULTADO' }], [
    ['Días con registro de avance', String(workDates.length)],
    ['Registros de avance', String(entries.length)],
    ['Fotografías', includePhotos ? String(totalPhotos) : 'No incluidas'],
    ['Horas de lluvia / paralización', totalRain ? fmtHours(totalRain) : 'Sin registro'],
    crews.length ? ['Personal en obra (promedio)', `${Math.round(crews.reduce((a, b) => a + b, 0) / crews.length)} personas`] : null,
  ].filter(Boolean), { labelCol: true });

  // actividades por rubro
  const byCat = {};
  for (const e of entries) {
    const r = (byCat[e.category] ||= { n: 0, qty: {} });
    r.n++;
    if (e.qty !== '' && e.qty != null) r.qty[e.unit] = (r.qty[e.unit] || 0) + Number(e.qty);
  }
  const catRows = Object.entries(byCat).sort((a, b) => b[1].n - a[1].n).map(([c, r]) => [
    c, String(r.n), Object.entries(r.qty).map(([u, v]) => `${Number(v.toFixed(2)).toLocaleString('es-PA')} ${u}`).join(' · ') || '—',
  ]);
  if (catRows.length) {
    subsection('Actividades por rubro');
    table([{ w: 230, label: 'RUBRO' }, { w: 90, label: 'REGISTROS' }, { w: CW - 320, label: 'CANTIDAD EJECUTADA' }], catRows, { labelCol: true });
  }

  // ================= 2. CLIMA =================
  if (dayList.length) {
    section('Clima y condiciones de trabajo');
    table([
      { w: 72, label: 'FECHA' }, { w: 64, label: 'CLIMA' }, { w: 112, label: 'LLUVIA (HORARIO)' },
      { w: 44, label: 'HORAS' }, { w: 62, label: 'PERSONAL' }, { w: CW - 354, label: 'NOTAS' },
    ], dayList.map((d) => [
      fmtShort(d.date), weatherById(d.condition)?.label || '—',
      (d.rain || []).filter((r) => r.from && r.to).map((r) => `${fmtTime(r.from)} – ${fmtTime(r.to)}`).join('\n') || '—',
      rainHours(d) ? fmtHours(rainHours(d)) : '—', d.crew !== '' && d.crew != null ? String(d.crew) : '—', d.weatherNote || '—',
    ]), { labelCol: true, size: 8.5 });
  }

  // ================= 3. DETALLE DIARIO =================
  section('Detalle diario de avance', 140);
  if (!allDates.length) paragraph('Sin registros en el periodo seleccionado.', { font: FI, color: C.gray });
  let fig = 0;

  for (const d of allDates) {
    const list = entries.filter((e) => e.date === d).sort((a, b) => a.createdAt - b.createdAt);
    const firstHasPh = list.length && includePhotos && (photosByEntry[list[0].id] || []).length;
    subsection(cap(fmtLong(d)), !list.length ? 50 : firstHasPh ? 330 : 150);   // el título del día no queda solo
    if (days[d] && weatherSummary(days[d], { emoji: false })) {
      paragraph(`Condición del día: ${weatherSummary(days[d], { emoji: false })}.`, { size: 9, color: C.gray, gap: 4 });
    }
    if (!list.length) { paragraph('Sin avance registrado en esta fecha.', { font: FI, color: C.gray }); continue; }

    for (const e of list) {
      const step = e.activity ? e.activity.replace(/^\d+\.\s*/, '') + (e.stepPct ? ` (${e.stepPct} %)` : '') : (e.stepPct ? `${e.stepPct} % del paso` : '');
      const title = [e.category, step].filter(Boolean).join(' – ');
      const loc = whereText(e);
      const qty = e.qty !== '' && e.qty != null ? `${e.qty} ${e.unit}` : '';
      const desc = wrap(e.text, F, 10, CW);
      const ph = includePhotos ? (photosByEntry[e.id] || []).slice(0, maxPh) : [];
      const gap = 14, cellW = (CW - gap) / 2, cellH = 200;
      // el registro arranca junto con su primera fila de fotos (no queda la foto sola en otra página)
      ensure(40 + Math.min(desc.length, 3) * 14 + (ph.length && desc.length <= 6 ? cellH + 30 : 0));

      // fila de título (como encabezado de tabla del Word)
      rect(M, y - 18, CW, 18, C.head, C.border);
      text(title, M + 6, y - 12.5, { font: FB, size: 9.5, maxW: CW - 80 });
      textRight(new Date(e.createdAt).toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' }), PAGE_W - M - 6, y - 12.5, { size: 8, color: C.gray });
      y -= 18;
      if (loc || qty) {
        rect(M, y - 16, CW, 16, C.label, C.border);
        if (loc) text(`Ubicación: ${loc}`, M + 6, y - 11, { size: 8.5, color: C.gray, maxW: CW - 130 });
        if (qty) textRight(`Cantidad: ${qty}`, PAGE_W - M - 6, y - 11, { font: FB, size: 8.5, color: C.navy });
        y -= 16;
      }
      y -= 13;
      for (const line of desc) { ensure(14); text(line, M, y, { size: 10 }); y -= 13.8; }
      y -= 6;

      // figuras (2 por fila, con pie de figura como en el Word)
      for (let i = 0; i < ph.length; i += 2) {
        const caps = [0, 1].filter((j) => i + j < ph.length).map((j) =>
          wrap(`Figura ${fig + j + 1}. ${[e.level, [e.front, e.zone].filter(Boolean).join(', '), step || e.category].filter(Boolean).join(' – ')}.`, FI, 7.5, cellW - 8));
        fig += caps.length;
        const capH = Math.max(...caps.map((c) => c.length)) * 9.5 + 4;
        ensure(cellH + capH + 8);
        for (let j = 0; j < caps.length; j++) {
          const x = M + j * (cellW + gap);
          rect(x, y - cellH, cellW, cellH, C.photoBg, C.border);
          try {
            const bytes = await loadPhoto(ph[i + j]);
            if (bytes) {
              const img = await pdf.embedJpg(bytes);
              const s = Math.min((cellW - 8) / img.width, (cellH - 8) / img.height);
              const w = img.width * s, hh = img.height * s;
              page.drawImage(img, { x: x + (cellW - w) / 2, y: y - cellH + (cellH - hh) / 2, width: w, height: hh });
            }
          } catch (err) { text('Imagen no disponible', x + 10, y - cellH / 2, { font: FI, size: 9, color: C.gray }); }
          caps[j].forEach((l, k) => text(l, x + (cellW - FI.widthOfTextAtSize(l, 7.5)) / 2, y - cellH - 10 - k * 9.5, { font: FI, size: 7.5, color: C.gray }));
        }
        y -= cellH + capH + 10;
      }
      y -= 8;
    }
  }

  // ================= 4. CONSTANCIA Y FIRMAS =================
  section('Constancia', 160);
  paragraph(`Se remite el presente informe${P.addressee ? ` a ${P.addressee}` : ''} para dejar constancia de las actividades ejecutadas, las condiciones climáticas y la evidencia fotográfica correspondientes al periodo indicado.`);
  y -= 4;
  text('Atentamente,', M, y, { size: 10 }); y -= 50;
  const sw = (CW - 40) / 2;
  [[company || 'Elaborado por', settings.author ? `Nombre / cargo: ${settings.author}` : 'Nombre / cargo: ______________________'],
   ['Recibido por', P.addressee || 'Nombre / cargo: ______________________']].forEach(([a, b], i) => {
    const x = M + i * (sw + 40);
    rect(x, y, sw, 0.8, C.text);
    text(a, x, y - 13, { font: FB, size: 9.5, color: C.navy, maxW: sw });
    text(b, x, y - 26, { size: 8.5, color: C.gray, maxW: sw });
  });

  // ================= PIE DE PÁGINA =================
  pages.forEach((pg, i) => {
    page = pg;
    rect(M, M + 4, CW, 0.6, C.navy);
    text(`${o.title} | ${P.name}`, M, M - 8, { size: 7.5, color: C.gray, maxW: CW - 90 });
    textRight(`Página ${i + 1} de ${pages.length}`, PAGE_W - M, M - 8, { size: 8, color: C.navy });
  });

  return pdf.save();
}
