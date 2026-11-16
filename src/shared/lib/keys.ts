/**
 * Сочетания клавиш: запись `mod+k`, `shift+→`, `space` → значки для текущей системы
 * (на Mac — ⌘ ⇧ ⌥, на остальных — Ctrl Shift Alt). `mod` — ⌘ на Mac и Ctrl в Windows/Linux.
 */
export function isMac() {
  return import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

const NAMES: Record<string, [mac: string, other: string]> = {
  mod: ['⌘', 'Ctrl'],
  shift: ['⇧', 'Shift'],
  alt: ['⌥', 'Alt'],
  enter: ['↵', 'Enter'],
  esc: ['Esc', 'Esc'],
  space: ['Пробел', 'Пробел'],
  up: ['↑', '↑'],
  down: ['↓', '↓'],
  left: ['←', '←'],
  right: ['→', '→'],
}

/** `mod+k` → ['⌘', 'K'] */
export function comboKeys(combo: string, mac = isMac()) {
  return combo.split('+').map((k) => {
    const n = NAMES[k.toLowerCase()]
    return n ? n[mac ? 0 : 1] : k.toUpperCase()
  })
}

/** Для подсказок `title`: `shift+right` → «Shift+→» (на Mac — «⇧→») */
export function comboText(combo: string, mac = isMac()) {
  return comboKeys(combo, mac).join(mac ? '' : '+')
}

/** Нажата ли «главная» клавиша-модификатор (⌘ на Mac, Ctrl на остальных) */
export function isModKey(e: KeyboardEvent) {
  return isMac() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}
