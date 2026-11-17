// Чек в PDF (например, из приложения Mans Rimi) превращаем в картинки прямо в телефоне,
// чтобы Claude прочитал его так же, как фото. Библиотека грузится только когда выбран PDF.
// Длинный чек режем на 2–4 куска с небольшим нахлёстом: так мелкий шрифт не сжимается и читается.
export async function pdfToImages(file) {
  // pdf.js берём с CDN по точной версии: в сборку приложения он не входит, грузится только при выборе PDF
  // (для чтения чека всё равно нужен интернет — его читает Claude).
  const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/'
  const pdfjs = await import(/* @vite-ignore */ CDN + 'pdf.min.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.mjs'
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  try {
    const pages = []
    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      pages.push({ page, w: base.width, h: base.height })
    }
    const ratio = pages.reduce((s, p) => s + p.h / p.w, 0)          // высота всего чека в «ширинах»
    const PIECE = 1.1, OVER = 0.06, MAX = 4                           // кусок ≈ 1,1 ширины, нахлёст 6 %
    const width = Math.round(Math.min(1000, 1000 * (MAX * (PIECE - OVER)) / Math.max(ratio, 0.01)))
    const full = document.createElement('canvas'); full.width = width; full.height = Math.round(ratio * width)
    const fctx = full.getContext('2d'); fctx.fillStyle = '#fff'; fctx.fillRect(0, 0, full.width, full.height)
    let y = 0
    for (const p of pages) {
      const vp = p.page.getViewport({ scale: width / p.w })
      const c = document.createElement('canvas'); c.width = width; c.height = Math.round(vp.height)
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      await p.page.render({ canvasContext: ctx, viewport: vp }).promise
      fctx.drawImage(c, 0, y); y += c.height
    }
    const ph = Math.round(width * PIECE), step = Math.round(width * (PIECE - OVER)), out = []
    for (let top = 0; top < full.height && out.length < MAX; top += step) {
      const h = Math.min(ph, full.height - top)
      const c = document.createElement('canvas'); c.width = width; c.height = h
      c.getContext('2d').drawImage(full, 0, top, width, h, 0, 0, width, h)
      out.push(await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('pdf'))), 'image/png')))
      if (top + h >= full.height) break
    }
    return out
  } finally { doc.destroy() }
}
