/**
 * Уменьшить фото перед загрузкой: длинная сторона ≤ max px, JPEG (с телефона приходят снимки по 3–10 МБ).
 * square — обрезать по центру в квадрат (аватар, обложка). Возвращает data URL.
 */
export async function resizeImage(file: File, max = 600, square = true): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Это не картинка')
  const bitmap = await createImageBitmap(file).catch(() => null)
  const source: CanvasImageSource & { width: number, height: number } = bitmap ?? await loadImg(file)
  const sw = source.width
  const sh = source.height
  const side = Math.min(sw, sh)
  const [sx, sy, cw, ch] = square ? [(sw - side) / 2, (sh - side) / 2, side, side] : [0, 0, sw, sh]
  const scale = Math.min(1, max / Math.max(cw, ch))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(cw * scale)
  canvas.height = Math.round(ch * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height)
  bitmap?.close()
  return canvas.toDataURL('image/jpeg', 0.86)
}

function loadImg(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не удалось открыть картинку'))
    img.src = URL.createObjectURL(file)
  })
}
