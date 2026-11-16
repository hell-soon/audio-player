import { useLikes } from '@/entities/library'
import { useNowPlayingView, usePlayer } from '@/entities/player'
import { isModKey, useDocumentPip, useSpotlight } from '@/shared/lib'

/**
 * Горячие клавиши (компьютер). Сочетания записаны как в `UiKbd`: `mod` — ⌘ на Mac, Ctrl на остальных.
 * Буквы проверяются по `e.code` (физической клавише) — работают и в русской раскладке.
 */
export const HOTKEYS: { group: string, items: { combos: string[], action: string }[] }[] = [
  {
    group: 'Воспроизведение',
    items: [
      { combos: ['space'], action: 'Пауза / воспроизведение' },
      { combos: ['shift+left', 'shift+right'], action: 'Предыдущий / следующий трек' },
      { combos: ['left', 'right'], action: 'Перемотка на 10 секунд' },
      { combos: ['0…9'], action: 'Перейти к 0–90 % трека' },
      { combos: ['shift+up', 'shift+down'], action: 'Громкость' },
      { combos: ['m'], action: 'Выключить / включить звук' },
      { combos: ['s'], action: 'Перемешать' },
      { combos: ['r'], action: 'Повтор: выкл. → очередь → трек' },
      { combos: ['l'], action: 'В любимые' },
    ],
  },
  {
    group: 'Навигация',
    items: [
      { combos: ['mod+k'], action: 'Умный поиск — везде сразу' },
      { combos: ['/'], action: 'Страница поиска' },
      { combos: ['alt+1…5'], action: 'Главная, Поиск, Библиотека, Друзья, Профиль' },
      { combos: ['p'], action: 'Мини-плеер поверх окон (Chrome, Edge, Яндекс Браузер)' },
      { combos: ['f'], action: '«Сейчас играет», ещё раз — полноэкранный режим' },
      { combos: ['esc'], action: 'Выйти из полноэкранного режима / свернуть' },
      { combos: ['?'], action: 'Эта подсказка' },
    ],
  },
]

const SECTIONS = ['/', '/search', '/library', '/friends', '/profile']

export const hotkeysHelpOpen = ref(false)

/** Горячие клавиши плеера. Не срабатывают, пока пользователь печатает в поле ввода (кроме ⌘K). */
export function useHotkeys() {
  const p = usePlayer()
  const likes = useLikes()
  const view = useNowPlayingView()
  const spotlight = useSpotlight()
  const pip = useDocumentPip()

  function isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
  }

  function onKey(e: KeyboardEvent) {
    // ⌘K / Ctrl+K — умный поиск: открывается откуда угодно, в т.ч. из поля ввода
    if (isModKey(e) && !e.shiftKey && !e.altKey && e.code === 'KeyK') {
      e.preventDefault()
      spotlight.open.value = !spotlight.open.value
      return
    }
    if (isTyping(e) || spotlight.open.value || e.metaKey || e.ctrlKey) return

    // Alt+1…5 — разделы (по e.code: на Mac Alt+цифра печатает символ)
    if (e.altKey) {
      const n = /^Digit([1-5])$/.exec(e.code)?.[1]
      if (n) {
        e.preventDefault()
        navigateTo(SECTIONS[Number(n) - 1]!)
      }
      return
    }

    const key = e.key
    const code = e.code
    const has = !!p.current.value

    if (key === ' ' && has) {
      // Пробел на кнопке нажимает её — пусть так и будет.
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return
      e.preventDefault()
      p.toggle()
    }
    else if (key === 'ArrowRight' && has) {
      e.preventDefault()
      if (e.shiftKey) p.next()
      else p.seek(Math.min(p.duration.value, p.position.value + 10_000))
    }
    else if (key === 'ArrowLeft' && has) {
      e.preventDefault()
      if (e.shiftKey) p.previous()
      else p.seek(Math.max(0, p.position.value - 10_000))
    }
    else if (e.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
      e.preventDefault()
      p.setVolume(Math.round((p.volume.value + (key === 'ArrowUp' ? 0.05 : -0.05)) * 100) / 100)
    }
    // 0…9 — к 0–90 % трека (как на YouTube)
    else if (/^Digit\d$/.test(code) && !e.shiftKey && has && p.duration.value) {
      p.seek((Number(code.slice(5)) / 10) * p.duration.value)
    }
    else if (code === 'KeyM') {
      p.toggleMute()
    }
    else if (code === 'KeyS' && !e.shiftKey) {
      p.toggleShuffle()
    }
    else if (code === 'KeyR' && !e.shiftKey) {
      p.cycleRepeat()
    }
    else if (code === 'KeyL' && p.current.value) {
      likes.toggle(p.current.value)
    }
    // F: открыть «Сейчас играет»; когда она открыта, F переключает полноэкранный режим (обрабатывает сама карточка)
    else if (code === 'KeyF' && has && !view.open.value) {
      view.show()
    }
    else if (code === 'KeyP' && has && pip.supported) {
      pip.toggle().catch(() => {})
    }
    else if (key === '/' || key === '.') {
      e.preventDefault()
      navigateTo('/search')
    }
    else if (key === '?' || (key === ',' && e.shiftKey)) {
      hotkeysHelpOpen.value = true
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
