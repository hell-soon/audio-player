import { isMobileBrowser } from '@/shared/lib'
import type { EngineCallbacks } from './types'

/**
 * Spotify Web Playback SDK: сайт становится Spotify Connect-устройством и играет звук сам.
 * Работает только в десктопных браузерах и только при доступности серверов Spotify.
 * Если SDK недоступен (телефон, блокировка сети, нет Premium) — status != 'ready',
 * и плеер играет треки Spotify через совпадение в Яндекс Музыке.
 */

export type SpotifyStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'unavailable' | 'error'

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js'
const READY_TIMEOUT_MS = 10_000

export const spotifyStatus = ref<SpotifyStatus>('idle')
export const spotifyError = ref('')

let player: Spotify.Player | null = null
let deviceId: string | null = null
let tokenCache: { accessToken: string, expiresAt: number } | null = null
let cb: EngineCallbacks | null = null
/** Ждут нового device_id после переподключения */
let readyWaiters: ((ok: boolean) => void)[] = []

// Отслеживание окончания трека (у SDK нет события "ended").
let expectedId: string | null = null
let started = false
let lastState: { s: Spotify.PlaybackState, at: number } | null = null

function loadSdk() {
  return new Promise<void>((resolve, reject) => {
    if (window.Spotify) return resolve()
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const s = document.createElement('script')
    s.src = SDK_URL
    s.async = true
    s.onerror = () => reject(new Error('Не удалось загрузить Spotify SDK'))
    document.head.appendChild(s)
  })
}

async function getToken() {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 60_000) return tokenCache.accessToken
  const fresh = await $fetch('/api/spotify/token')
  tokenCache = fresh
  return fresh.accessToken
}

const isTrack = (t: Spotify.SdkTrack | null | undefined, id: string) => !!t && (t.id === id || t.linked_from?.id === id)

function handleState(s: Spotify.PlaybackState | null) {
  if (!s || !cb || !expectedId) return
  lastState = { s, at: Date.now() }
  const current = s.track_window.current_track
  const isExpected = isTrack(current, expectedId)

  if (isExpected) {
    started = true
    cb.onBuffering(Boolean(s.loading))
    cb.onPlaying(!s.paused)
    cb.onTime(s.position, s.duration)
    // Трек доиграл: пауза на нуле, а он уже в "предыдущих".
    if (s.paused && s.position === 0 && s.track_window.previous_tracks.some(t => isTrack(t, expectedId!))) {
      finish()
    }
    return
  }

  // Spotify сам включил что-то другое (автовоспроизведение после конца трека) — значит, наш доиграл.
  if (started && current && !s.paused) finish()
}

function finish() {
  expectedId = null
  started = false
  player?.pause()
  cb?.onEnded()
}

/** Позиция с поправкой на прошедшее время: SDK не шлёт события каждую секунду. */
export function spotifyLivePosition() {
  if (!lastState) return 0
  const { s, at } = lastState
  return s.paused ? s.position : Math.min(s.duration, s.position + (Date.now() - at))
}

export async function initSpotify(callbacks: EngineCallbacks) {
  cb = callbacks
  if (spotifyStatus.value === 'loading' || spotifyStatus.value === 'ready') return

  if (isMobileBrowser()) {
    spotifyStatus.value = 'unsupported'
    spotifyError.value = 'В мобильных браузерах Spotify не играет — треки звучат через Яндекс Музыку'
    return
  }

  spotifyStatus.value = 'loading'
  spotifyError.value = ''

  const timeout = setTimeout(() => {
    if (spotifyStatus.value !== 'loading') return
    spotifyStatus.value = 'unavailable'
    spotifyError.value = 'Нет соединения с серверами Spotify (VPN, блокировщик рекламы или DRM в браузере). Треки играют через Яндекс Музыку'
  }, READY_TIMEOUT_MS)

  try {
    await loadSdk()
    player = new window.Spotify!.Player({
      name: 'Audio Web',
      volume: 0.8,
      getOAuthToken: fn => void getToken().then(fn),
    })

    player.addListener('ready', ({ device_id }) => {
      clearTimeout(timeout)
      deviceId = device_id
      spotifyStatus.value = 'ready'
      spotifyError.value = ''
      readyWaiters.splice(0).forEach(r => r(true))
    })
    player.addListener('not_ready', () => {
      deviceId = null
      // Spotify сам сообщил, что плеер отключился — переподключаемся сразу, не дожидаясь запуска трека
      scheduleReconnect()
    })
    player.addListener('player_state_changed', handleState)
    player.addListener('initialization_error', (e) => {
      spotifyStatus.value = 'unsupported'
      spotifyError.value = `Браузер не поддерживает Spotify: ${e.message}`
    })
    player.addListener('authentication_error', (e) => {
      spotifyStatus.value = 'error'
      spotifyError.value = `Ошибка авторизации Spotify: ${e.message}`
    })
    player.addListener('account_error', () => {
      spotifyStatus.value = 'error'
      spotifyError.value = 'Для воспроизведения нужен Spotify Premium'
    })
    player.addListener('playback_error', (e) => {
      cb?.onError(`Spotify: ${e.message}`)
    })

    if (!(await player.connect())) {
      spotifyStatus.value = 'unsupported'
      spotifyError.value = 'Браузер не поддерживает воспроизведение Spotify'
    }
    else watchAlive()
  }
  catch (e: any) {
    clearTimeout(timeout)
    spotifyStatus.value = 'error'
    spotifyError.value = e?.message ?? String(e)
  }
}

/**
 * Переподключить браузерный плеер: Spotify «забывает» устройство после сна компьютера, долгой фоновой
 * вкладки или обрыва связи — старый device_id отвечает 404 «Device not found». Ждём новый (не дольше 8 с).
 */
async function reconnect(): Promise<boolean> {
  const p = player
  if (!p) return false
  deviceId = null
  const ready = new Promise<boolean>((resolve) => {
    readyWaiters.push(resolve)
    setTimeout(() => resolve(false), 8000)
  })
  p.disconnect()
  if (!(await p.connect())) return false
  return ready
}

// ---------- Держим плеер подключённым ----------

let reconnecting: Promise<boolean> | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined

/** Переподключение с повторами (1 с, 5 с, 20 с): один процесс за раз */
function scheduleReconnect(attempt = 0) {
  clearTimeout(retryTimer)
  if (!player || attempt > 2) return
  retryTimer = setTimeout(async () => {
    if (deviceId || reconnecting) return
    const ok = await (reconnecting = reconnect().finally(() => (reconnecting = null)))
    if (!ok) scheduleReconnect(attempt + 1)
  }, [1000, 5000, 20_000][attempt])
}

/** Проверить, что Spotify ещё видит наш плеер; нет — переподключить заранее (до нажатия «Играть») */
async function ensureAlive() {
  if (!player || reconnecting || document.hidden) return
  if (!deviceId) return scheduleReconnect()
  const id = deviceId
  const r = await $fetch<{ alive: boolean }>('/api/spotify/device-alive', { query: { id } }).catch(() => null)
  // Нет ответа (сеть, Spotify не подключён) — не трогаем; плеер «забыт» — переподключаем
  if (r && !r.alive && deviceId === id) {
    deviceId = null
    scheduleReconnect()
  }
}

let watching = false
/**
 * Когда Spotify обычно «забывает» плеер: компьютер спал, вкладка долго была в фоне, пропадала сеть.
 * В эти моменты (и только тогда — запросы к API Spotify ограничены) проверяем и переподключаем.
 */
function watchAlive() {
  if (watching) return
  watching = true
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) void ensureAlive()
  })
  window.addEventListener('online', () => void ensureAlive())
  // Сон компьютера: таймеры стоят, после пробуждения разрыв во времени намного больше интервала
  let tick = Date.now()
  setInterval(() => {
    const now = Date.now()
    if (now - tick > 90_000) void ensureAlive()
    tick = now
  }, 30_000)
}

/**
 * Вызывать из обработчика клика: activateElement() стартует синхронно, внутри жеста пользователя.
 * Плеер отключился (нет device_id или Spotify ответил 404) — переподключаемся и повторяем один раз;
 * не вышло — ошибка с code 'device-gone' (плеер сыграет трек через Яндекс).
 */
export async function spotifyPlay(trackId: string, positionMs = 0) {
  if (!player) throw Object.assign(new Error('Плеер Spotify не готов'), { code: 'device-gone' })
  expectedId = trackId
  started = false
  lastState = null
  cb?.onBuffering(true)
  await player.activateElement()
  const gone = () => Object.assign(new Error('Плеер Spotify отключился'), { code: 'device-gone' })
  if (!deviceId && !(await (reconnecting ?? reconnect()))) throw gone()
  const send = () => $fetch('/api/spotify/play', {
    method: 'PUT',
    body: { deviceId, trackIds: [trackId], positionMs },
  })
  try {
    await send()
  }
  catch (e: any) {
    if (e?.statusCode !== 404) throw e
    if (!(await reconnect())) throw gone()
    try {
      await send()
    }
    catch (again: any) {
      if (again?.statusCode === 404) throw gone()
      throw again
    }
  }
}

export const spotifyEngine = {
  resume: () => player?.resume(),
  pause: () => player?.pause(),
  seek: (ms: number) => player?.seek(ms),
  setVolume: (v: number) => player?.setVolume(v),
  stop() {
    expectedId = null
    started = false
    lastState = null
    return player?.pause()
  },
}

export function disconnectSpotify() {
  clearTimeout(retryTimer)
  player?.disconnect()
  player = null
  deviceId = null
  tokenCache = null
  spotifyStatus.value = 'idle'
}
