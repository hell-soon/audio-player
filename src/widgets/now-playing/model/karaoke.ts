import type { Ref } from 'vue'
import { usePlayer } from '@/entities/player'

/**
 * Заливка текущей строки текста по ходу песни (как караоке).
 *
 * Время слов: из расширенного LRC (line.words) — точно; иначе строка делится по слогам
 * (гласные: «соло-вей» тянется дольше, чем «и»), а длительность строки — до следующей строки,
 * но не дольше, чем примерно поётся (иначе в проигрыше последнее слово «ползло» бы секундами).
 * Позиция плеера приходит ~4 раза в секунду — между обновлениями досчитываем её сами, чтобы заливка шла плавно.
 * Каждый кадр обновляются только слова текущей строки (CSS-переменная --w у слова), без перерисовки Vue.
 */
export interface KaraokeWord { text: string, start: number, end: number }

const VOWELS = /[аеёиоуыэюяaeiouyäöü]/gi
const syllables = (w: string) => Math.max(1, (w.match(VOWELS) ?? []).length)

export function wordsOf(lines: LyricsLine[], i: number): KaraokeWord[] {
  const line = lines[i]
  if (!line) return []
  const next = lines[i + 1]?.t
  if (line.words?.length) {
    return line.words.map((w, k) => ({
      text: w.text,
      start: w.t,
      end: line.words![k + 1]?.t ?? Math.min(next ?? w.t + 1500, w.t + 1500),
    }))
  }
  const parts = line.text.split(/\s+/).filter(Boolean)
  const weights = parts.map(syllables)
  const total = weights.reduce((s, x) => s + x, 0)
  // Примерно 0,28 с на слог, но не дольше, чем до следующей строки
  const sung = total * 280 + 400
  const end = Math.min(next ?? line.t + sung, line.t + sung)
  const span = Math.max(300, end - line.t)
  let acc = line.t
  return parts.map((text, k) => {
    const d = (weights[k]! / total) * span
    const w = { text, start: acc, end: acc + d }
    acc += d
    return w
  })
}

export function useKaraokeFill(box: Ref<HTMLElement | null>, lines: Ref<LyricsLine[] | null | undefined>, activeIndex: Ref<number>) {
  const p = usePlayer()
  // Опорная точка позиции: досчитываем между обновлениями плеера
  let base = { pos: p.position.value, at: performance.now() }
  watch(() => p.position.value, pos => (base = { pos, at: performance.now() }))

  let frame = 0
  // Панель уже убрана (песня без текста) — ничего не запускаем: отложенный start (nextTick после смены строки)
  // иначе заводил бесконечный цикл кадров, и с каждой песней таких циклов становилось больше
  let alive = true
  let words: KaraokeWord[] = []
  let spans: HTMLElement[] = []
  function bind() {
    // Слова прошлой строки — снова по правилам CSS (иначе после перемотки строка осталась бы недозалитой)
    for (const el of spans) el.style.removeProperty('--w')
    const list = lines.value
    const i = activeIndex.value
    words = list && i >= 0 ? wordsOf(list, i) : []
    spans = [...(box.value?.querySelectorAll<HTMLElement>(`[data-i="${i}"] .lyrics__w`) ?? [])]
  }
  function tick() {
    frame = 0
    if (!alive) return
    const now = performance.now()
    const est = p.isPlaying.value ? base.pos + Math.min(1500, now - base.at) : base.pos
    const pos = est + 120 // чуть раньше звука — глаз успевает
    for (let k = 0; k < spans.length; k++) {
      const w = words[k]
      if (!w) continue
      const f = Math.min(1, Math.max(0, (pos - w.start) / Math.max(1, w.end - w.start)))
      spans[k]!.style.setProperty('--w', f.toFixed(3))
    }
    if (p.isPlaying.value && !document.hidden) frame = requestAnimationFrame(tick)
  }
  function start() {
    cancelAnimationFrame(frame)
    if (!alive) return
    bind()
    frame = requestAnimationFrame(tick)
  }
  watch([activeIndex, lines], () => nextTick(start))
  watch(() => p.isPlaying.value, start)
  onMounted(() => {
    start()
    document.addEventListener('visibilitychange', start)
  })
  onBeforeUnmount(() => {
    alive = false
    spans = []
    cancelAnimationFrame(frame)
    document.removeEventListener('visibilitychange', start)
  })
}
