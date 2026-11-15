import { coverAccent } from './cover-color'

/**
 * Генерация обложки плейлиста прямо в браузере (без внешних сервисов): цвета берутся из обложек треков,
 * название — крупным шрифтом. Три стиля: «градиент», «волна» (эквалайзер), «мозаика» (размытый коллаж).
 * seed — для «Ещё варианты»: другие сочетания цветов и форм. Возвращает data URL (JPEG 600×600).
 */
const SIZE = 600

export type CoverStyle = 'gradient' | 'wave' | 'mosaic' | 'spotlight'

interface Palette { deep: string[], bright: string[] }

function rand(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

async function paletteOf(covers: string[], title: string): Promise<Palette> {
  const accents = (await Promise.all(covers.slice(0, 8).map(c => coverAccent(c).catch(() => null)))).filter(Boolean) as { dark: string, light: string }[]
  if (accents.length) return { deep: accents.map(a => a.light), bright: accents.map(a => a.dark) }
  // Обложек нет — цвета из названия (стабильные)
  const hue = [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 11)
  return { deep: [`hsl(${hue} 60% 38%)`, `hsl(${(hue + 40) % 360} 60% 30%)`], bright: [`hsl(${hue} 80% 72%)`, `hsl(${(hue + 40) % 360} 80% 70%)`] }
}

function loadSameOrigin(url: string, size = 50) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    // Через наш прокси — иначе холст «испачкается» чужой картинкой и его нельзя будет сохранить
    img.src = url.startsWith('/') ? url : `/api/cover?url=${encodeURIComponent(url)}&size=${size}`
  })
}

/** Название крупно, в несколько строк, по левому краю снизу */
function drawTitle(ctx: CanvasRenderingContext2D, title: string, opts: { y?: number, size?: number, caption?: string } = {}) {
  const size = opts.size ?? (title.length > 28 ? 52 : title.length > 14 ? 64 : 80)
  ctx.font = `800 ${size}px "Inter Variable", "Inter", system-ui, sans-serif`
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'
  const max = SIZE - 96
  const words = title.split(/\s+/)
  const lines: string[] = []
  for (const w of words) {
    const cur = lines.at(-1)
    if (cur && ctx.measureText(`${cur} ${w}`).width <= max) lines[lines.length - 1] = `${cur} ${w}`
    else lines.push(w)
  }
  const shown = lines.slice(0, 3)
  const lh = size * 1.02
  let y = (opts.y ?? SIZE - 56) - (shown.length - 1) * lh
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 24
  for (const l of shown) {
    ctx.fillText(l, 48, y, max)
    y += lh
  }
  ctx.shadowBlur = 0
  if (opts.caption) {
    ctx.font = '700 22px "Inter Variable", system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText(opts.caption.toUpperCase(), 48, 72)
  }
}

function gradient(ctx: CanvasRenderingContext2D, p: Palette, r: () => number) {
  const a = r() * Math.PI * 2
  const g = ctx.createLinearGradient(SIZE / 2 - Math.cos(a) * SIZE, SIZE / 2 - Math.sin(a) * SIZE, SIZE / 2 + Math.cos(a) * SIZE, SIZE / 2 + Math.sin(a) * SIZE)
  const cols = [...p.deep].sort(() => r() - 0.5).slice(0, 3)
  cols.forEach((c, i) => g.addColorStop(cols.length === 1 ? 0 : i / (cols.length - 1), c))
  if (cols.length === 1) g.addColorStop(1, '#111')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)
  // Мягкие световые пятна ярких цветов
  for (let i = 0; i < 3; i++) {
    const x = r() * SIZE
    const y = r() * SIZE * 0.7
    const rad = SIZE * (0.35 + r() * 0.4)
    const glow = ctx.createRadialGradient(x, y, 0, x, y, rad)
    glow.addColorStop(0, p.bright[Math.floor(r() * p.bright.length)]!.replace('hsl(', 'hsla(').replace(')', ' / 0.55)'))
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, SIZE, SIZE)
  }
}

function wave(ctx: CanvasRenderingContext2D, p: Palette, r: () => number) {
  ctx.fillStyle = '#0e0e12'
  ctx.fillRect(0, 0, SIZE, SIZE)
  const bg = ctx.createRadialGradient(SIZE / 2, SIZE * 0.4, 0, SIZE / 2, SIZE * 0.4, SIZE * 0.8)
  bg.addColorStop(0, p.deep[0]!)
  bg.addColorStop(1, '#0e0e12')
  ctx.fillStyle = bg
  ctx.globalAlpha = 0.6
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.globalAlpha = 1
  const bars = 18 + Math.floor(r() * 10)
  const w = (SIZE - 96) / bars
  const grad = ctx.createLinearGradient(48, 0, SIZE - 48, 0)
  p.bright.slice(0, 3).forEach((c, i, arr) => grad.addColorStop(arr.length === 1 ? 0 : i / (arr.length - 1), c))
  if (p.bright.length === 1) grad.addColorStop(1, p.bright[0]!)
  ctx.fillStyle = grad
  const phase = r() * 10
  for (let i = 0; i < bars; i++) {
    const h = SIZE * 0.08 + SIZE * 0.3 * Math.abs(Math.sin(i * 0.45 + phase)) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.3 + phase)))
    const x = 48 + i * w + w * 0.18
    const y = SIZE * 0.38 - h / 2
    ctx.beginPath()
    ctx.roundRect(x, y, w * 0.64, h, w * 0.32)
    ctx.fill()
  }
}

async function mosaic(ctx: CanvasRenderingContext2D, p: Palette, covers: string[], r: () => number) {
  const imgs = (await Promise.all(covers.slice(0, 9).map(loadSameOrigin))).filter(Boolean) as HTMLImageElement[]
  if (!imgs.length) return gradient(ctx, p, r)
  // Коллаж на крошечном холсте, растянутый с сглаживанием, — мягкое размытие (ctx.filter есть не везде)
  const small = document.createElement('canvas')
  small.width = small.height = 12
  const s = small.getContext('2d')!
  const n = Math.ceil(Math.sqrt(imgs.length))
  const order = [...imgs].sort(() => r() - 0.5)
  order.forEach((img, i) => s.drawImage(img, (i % n) * (12 / n), Math.floor(i / n) * (12 / n), 12 / n, 12 / n))
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, -60, -60, SIZE + 120, SIZE + 120)
  const shade = ctx.createLinearGradient(0, SIZE * 0.35, 0, SIZE)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.6)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, SIZE, SIZE)
}

/**
 * «Как микс дня в Spotify»: случайная обложка трека во весь квадрат, цветной уголок и полоса её цвета
 * с названием снизу. seed выбирает, какую обложку взять.
 */
async function spotlight(ctx: CanvasRenderingContext2D, covers: string[], title: string, r: () => number) {
  const pick = covers.length ? covers[Math.floor(r() * covers.length)]! : null
  const img = pick ? await loadSameOrigin(pick, 600) : null
  const accent = pick ? await coverAccent(pick).catch(() => null) : null
  const tint = accent?.light ?? `hsl(${Math.floor(r() * 360)} 60% 40%)`
  if (img) ctx.drawImage(img, 0, 0, SIZE, SIZE)
  else {
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, SIZE, SIZE)
  }
  ctx.fillStyle = tint
  ctx.beginPath()
  ctx.roundRect(0, 0, SIZE * 0.22, SIZE * 0.07, [0, 0, 12, 0])
  ctx.fill()
  const band = SIZE * 0.3
  ctx.globalAlpha = 0.9
  ctx.fillRect(0, SIZE - band, SIZE, band)
  ctx.globalAlpha = 1
  drawTitle(ctx, title, { y: SIZE - 52, size: title.length > 22 ? 44 : 56 })
}

export async function generateCover(style: CoverStyle, title: string, covers: string[], seed = 1): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const r = rand(seed * 7919 + style.length)
  const p = await paletteOf(covers, title)
  await document.fonts?.load('800 64px "Inter Variable"').catch(() => {})
  if (style === 'spotlight') {
    await spotlight(ctx, covers, title, r)
    return canvas.toDataURL('image/jpeg', 0.88)
  }
  if (style === 'gradient') gradient(ctx, p, r)
  else if (style === 'wave') wave(ctx, p, r)
  else await mosaic(ctx, p, covers, r)
  drawTitle(ctx, title, { caption: 'Плейлист' })
  return canvas.toDataURL('image/jpeg', 0.88)
}
