import type { Directive } from 'vue'

/**
 * Появление при прокрутке — `v-reveal` (значение — вид анимации: 'rise' по умолчанию, 'tilt' у плейлистов,
 * 'pop' у исполнителей, 'row' у строк треков).
 *
 * Раньше это была scroll-driven animation (`animation-timeline: view()`): прозрачность зависела от положения
 * на экране. Но браузер пересчитывает такой таймлайн только при прокрутке — если раскладка сдвинулась без неё
 * (догрузились данные, при быстрой прокрутке вниз — постоянно), карточки и строки «застревали» полупрозрачными.
 * Теперь одноразово: элемент ниже экрана прячется, при первом появлении проигрывает короткую анимацию и дальше
 * виден всегда. IntersectionObserver сам учитывает сдвиги раскладки.
 *
 * Что видно сразу при монтировании (и всё на сервере) — не анимируется: без JS и при гидрации ничего не прячется.
 * Элементы, появившиеся в одном кадре (ряд карточек), идут лесенкой. Уже проскоченные (выше экрана) —
 * показываются без анимации.
 */

export type RevealKind = 'rise' | 'tilt' | 'pop' | 'row'

const STAGGER_MS = 45
const MAX_STAGGER = 6

let observer: IntersectionObserver | null = null
const pending = new WeakSet<Element>()

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function finish(el: HTMLElement) {
  el.classList.remove('reveal-pending', 'reveal-in')
  el.style.removeProperty('--reveal-delay')
}

/** Высота «парящего» плеера и меню снизу: под ними анимация прошла бы незамеченной */
function bottomInset(el: HTMLElement) {
  return Number.parseFloat(getComputedStyle(el).getPropertyValue('--bottom-h')) || 0
}

function getObserver(inset: number) {
  if (observer) return observer
  observer = new IntersectionObserver((entries) => {
    let n = 0
    // Сверху вниз, слева направо — лесенка идёт в порядке чтения
    const shown = entries.filter(e => e.isIntersecting || e.boundingClientRect.bottom < 0)
    shown.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
    for (const e of shown) {
      const el = e.target as HTMLElement
      observer!.unobserve(el)
      pending.delete(el)
      if (!e.isIntersecting) {
        // Проскочили, не увидев (выше экрана) — просто показываем
        finish(el)
        continue
      }
      el.style.setProperty('--reveal-delay', `${Math.min(n++, MAX_STAGGER) * STAGGER_MS}ms`)
      el.classList.add('reveal-in')
      el.classList.remove('reveal-pending')
      // Свои кадры, а не всплывшее событие от анимации внутри (обложка проявляется и т.п.)
      const done = (ev: AnimationEvent) => {
        if (ev.target !== el || !ev.animationName.startsWith('reveal-')) return
        el.removeEventListener('animationend', done)
        finish(el)
      }
      el.addEventListener('animationend', done)
      // Подстраховка: если анимация не запустилась (вкладка в фоне и т.п.) — снять классы всё равно
      setTimeout(() => finish(el), 1500)
    }
  }, { rootMargin: `0px 0px -${Math.round(inset + 16)}px 0px` })
  return observer
}

export const vReveal: Directive<HTMLElement, RevealKind | undefined> = {
  mounted(el, { value }) {
    if (typeof IntersectionObserver === 'undefined' || reducedMotion()) return
    el.dataset.reveal = value ?? 'rise'
    const inset = bottomInset(el)
    // Уже на экране (или выше) — не трогаем: иначе при открытии страницы всё мигнуло бы
    if (el.getBoundingClientRect().top < window.innerHeight - inset - 16) return
    el.classList.add('reveal-pending')
    pending.add(el)
    getObserver(inset).observe(el)
  },
  beforeUnmount(el) {
    if (pending.has(el)) {
      observer?.unobserve(el)
      pending.delete(el)
    }
  },
}
