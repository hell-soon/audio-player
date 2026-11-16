/**
 * Системные уведомления (Web Push) на этом устройстве: «друг прислал песню».
 *  - нужен service worker (только прод-сборка) и публичный ключ VAPID в конфиге;
 *  - на iPhone — только в установленном на экран «Домой» приложении (iOS 16.4+): в Safari PushManager нет;
 *  - разрешение спрашиваем только по нажатию (иначе браузеры блокируют запрос).
 * Состояние общее для всех мест (настройки, подсказка на «Друзьях»).
 */
type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on'

const state = ref<PushState>('unsupported')
const busy = ref(false)
let checked = false

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

/** Регистрация service worker (не ждём вечно: в режиме разработки SW нет) */
async function registration() {
  if (!('serviceWorker' in navigator)) return null
  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>(r => setTimeout(() => r(null), 3000)),
  ])
}

async function refreshState(publicKey: string) {
  if (!publicKey) return (state.value = 'unsupported')
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) return (state.value = isIos() && !isStandalone() ? 'install' : 'unsupported')
  if (Notification.permission === 'denied') return (state.value = 'denied')
  const reg = await registration()
  if (!reg) return (state.value = 'unsupported')
  const sub = await reg.pushManager.getSubscription().catch(() => null)
  state.value = sub && Notification.permission === 'granted' ? 'on' : 'off'
}

export function usePushNotifications() {
  const publicKey = String(useRuntimeConfig().public.vapidPublicKey || '')

  if (import.meta.client && !checked) {
    checked = true
    refreshState(publicKey)
  }

  /** Включить: вызывать из обработчика нажатия (запрос разрешения) */
  async function enable() {
    if (busy.value) return false
    busy.value = true
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        state.value = permission === 'denied' ? 'denied' : 'off'
        return false
      }
      const reg = await registration()
      if (!reg) throw new Error('нет service worker')
      const sub = await reg.pushManager.getSubscription()
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
      await $fetch('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } })
      state.value = 'on'
      return true
    }
    finally {
      busy.value = false
    }
  }

  async function disable() {
    if (busy.value) return
    busy.value = true
    try {
      const reg = await registration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
      state.value = 'off'
    }
    finally {
      busy.value = false
    }
  }

  return { state: readonly(state), busy: readonly(busy), enable, disable }
}
