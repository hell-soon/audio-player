/**
 * Document Picture-in-Picture: отдельное маленькое окно поверх всех программ (Chrome, Edge, Яндекс Браузер на компьютере).
 * Окно одно на всё приложение (модульный синглтон). Содержимое рисует Vue через <Teleport> в `body` окна —
 * у окна тот же JS, что у вкладки, поэтому плеер, лайки и т.п. работают как обычно.
 * Стили копируются из вкладки, атрибуты <html> (тема, акцент, цвета обложки) — синхронизируются.
 */

interface DocumentPictureInPicture extends EventTarget {
  requestWindow(options?: { width?: number, height?: number, disallowReturnToOpener?: boolean, preferInitialWindowPlacement?: boolean }): Promise<Window>
  readonly window: Window | null
}

function api(): DocumentPictureInPicture | null {
  if (!import.meta.client) return null
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null
}

/** Размер окна мини-плеера по умолчанию (дальше человек меняет его сам — браузер запоминает) */
export const PIP_SIZE = { width: 360, height: 164 }

const pipWindow = shallowRef<Window | null>(null)
let observer: MutationObserver | null = null

/**
 * Стили вкладки → в окно. Файлы CSS подключаем ссылкой (из кэша браузера): в них относительные адреса
 * шрифтов (`./inter-….woff2`), скопированный текст считал бы их от корня сайта — шрифт не грузился.
 * Встроенные <style> (в т.ч. в dev) копируем текстом. Ждём загрузки ссылок, чтобы окно не мигнуло без стилей.
 */
function copyStyles(target: Document) {
  const loading: Promise<unknown>[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href) {
      const link = target.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      if (sheet.media.mediaText) link.media = sheet.media.mediaText
      loading.push(new Promise(resolve => (link.onload = link.onerror = resolve)))
      target.head.appendChild(link)
      continue
    }
    try {
      const style = target.createElement('style')
      style.textContent = Array.from(sheet.cssRules, r => r.cssText).join('\n')
      target.head.appendChild(style)
    }
    catch {
      // правила недоступны — пропускаем
    }
  }
  return Promise.race([Promise.all(loading), new Promise(resolve => setTimeout(resolve, 1000))])
}

function syncRoot(target: Document) {
  const from = document.documentElement
  const to = target.documentElement
  for (const { name } of Array.from(to.attributes)) {
    if (!from.hasAttribute(name)) to.removeAttribute(name)
  }
  for (const { name, value } of Array.from(from.attributes)) to.setAttribute(name, value)
  to.setAttribute('data-pip', '')
}

let opening: Promise<Window | null> | null = null

function open(size = PIP_SIZE): Promise<Window | null> {
  if (pipWindow.value) {
    pipWindow.value.focus()
    return Promise.resolve(pipWindow.value)
  }
  // Пока окно открывается (ждём стили), повторное нажатие не открывает второе
  opening ??= create(size).finally(() => (opening = null))
  return opening
}

async function create(size: typeof PIP_SIZE): Promise<Window | null> {
  const pip = api()
  if (!pip) return null
  const win = await pip.requestWindow(size)
  win.document.title = 'Audio'
  syncRoot(win.document)
  await copyStyles(win.document)
  if (win.closed) return null
  observer = new MutationObserver(() => syncRoot(win.document))
  observer.observe(document.documentElement, { attributes: true })
  win.addEventListener('pagehide', () => {
    observer?.disconnect()
    observer = null
    pipWindow.value = null
  }, { once: true })
  pipWindow.value = win
  return win
}

function close() {
  pipWindow.value?.close()
}

/** Окно «поверх всех окон». `supported` — false в Safari/Firefox и на SSR. */
export function useDocumentPip() {
  return {
    supported: !!api(),
    window: readonly(pipWindow),
    isOpen: computed(() => !!pipWindow.value),
    open,
    close,
    toggle: (size = PIP_SIZE) => (pipWindow.value ? (close(), Promise.resolve(null)) : open(size)),
  }
}
