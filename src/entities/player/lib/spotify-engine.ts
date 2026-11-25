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
let activated = false
let lastState: { s: Spotify.PlaybackState, at: number } | null = null
let preparing: { id: string, ready: () => void, fail: (error: Error) => void } | null = null

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

/** Прошло столько мс без движения позиции у «играющего» трека — считаем плеер сломанным */
const STALL_MS = 8000
let watchdog: ReturnType<typeof setInterval> | undefined
let playRequestedAt = 0
let progress = { pos: 0, at: 0 }

function stopWatchdog() {
  clearInterval(watchdog)
  watchdog = undefined
}

/** Звук пропал посреди трека: сбрасываем состояние и просим плеер доиграть через Яндекс с той же позиции */
function lost() {
  if (!expectedId) return
  const pos = spotifyLivePosition()
  expectedId = null
  started = false
  lastState = null
  stopWatchdog()
  void player?.pause()
  cb?.onLost?.(pos)
}

function startWatchdog() {
  stopWatchdog()
  playRequestedAt = Date.now()
  progress = { pos: -1, at: Date.now() }
  watchdog = setInterval(() => {
    if (!expectedId) return stopWatchdog()
    const now = Date.now()
    if (!started) {
      // Запрос на воспроизведение ушёл, а SDK так и не сообщил, что трек играет
      if (now - playRequestedAt > 15_000) lost()
      return
    }
    const s = lastState?.s
    if (!s || s.paused || s.loading) {
      progress = { pos: -1, at: now }
      return
    }
    const live = spotifyLivePosition()
    // Позиция из SDK обновляется редко, поэтому сверяем реальную позицию плеера
    void player?.getCurrentState().then((cur) => {
      if (!expectedId) return
      if (!cur) return lost()
      if (cur.paused || cur.position !== progress.pos) progress = { pos: cur.position, at: Date.now() }
      else if (Date.now() - progress.at > STALL_MS && live < cur.duration - 1500) lost()
    }).catch(() => {})
  }, 2000)
}

function handleState(s: Spotify.PlaybackState | null) {
  if (!cb) return
  const current = s?.track_window.current_track
  if (preparing && isTrack(current, preparing.id)) {
    if (!s || s.paused || s.loading) return
    preparing.ready()
  }
  // Этот трек не ждём (отменили или ушли на Яндекс), а Spotify запоздало стартовал — глушим, чтобы не играли два источника
  if (!expectedId) {
    if (s && !s.paused) void player?.pause()
    return
  }
  // Пустое состояние: SDK потерял воспроизведение (переподключение, сон) — звука нет
  if (!s) {
    if (started) lost()
    return
  }
  lastState = { s, at: Date.now() }
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
  stopWatchdog()
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
      // Трек идёт — звук уже оборвался: доигрываем через Яндекс, а переподключение отложим до конца трека
      if (expectedId && started) return lost()
      // Иначе переподключаемся сразу, не дожидаясь запуска трека
      if (!expectedId) scheduleReconnect()
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
      const message = `Spotify: ${e.message}`
      if (preparing) preparing.fail(new Error(message))
      else cb?.onError(message)
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
  // Пока трек играет — не трогаем плеер: переподключение оборвёт звук
  if (!player || reconnecting || document.hidden || (expectedId && started)) return
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
 * не вышло — ошибка с code 'device-gone' (плеер сыграет трек через Яндекс). Так же — если Spotify
 * не дал включить (403 «Restriction violated») или не отвечает (5xx): сервер уже повторил один раз.
 */
export async function spotifyPlay(trackId: string, positionMs = 0) {
  expectTrack(trackId)
  cb?.onBuffering(true)
  await requestSpotifyPlay(trackId, positionMs)
}

function expectTrack(trackId: string) {
  expectedId = trackId
  started = false
  lastState = null
  startWatchdog()
}

/** Дождаться звука от SDK перед сменой очереди и отключением движка Яндекса. */
export function prepareSpotifyPlay(trackId: string, signal: AbortSignal, commit: () => void) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const deadline = AbortSignal.timeout(20_000)
    const pendingSignal = AbortSignal.any([signal, deadline])
    const request = {
      id: trackId,
      fail: finish,
      ready() {
        // Сначала меняем очередь, чтобы события SDK относились уже к новому треку.
        expectTrack(trackId)
        commit()
        finish()
      },
    }
    function finish(error?: unknown) {
      if (preparing !== request) return
      preparing = null
      pendingSignal.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve()
    }
    function abort() { finish(pendingSignal.reason) }
    preparing = request
    pendingSignal.addEventListener('abort', abort, { once: true })
    void requestSpotifyPlay(trackId, 0, pendingSignal).catch(finish)
  })
}

async function requestSpotifyPlay(trackId: string, positionMs: number, signal?: AbortSignal) {
  if (!player) throw Object.assign(new Error('Плеер Spotify не готов'), { code: 'device-gone' })
  await player.activateElement()
  const gone = () => Object.assign(new Error('Плеер Spotify отключился'), { code: 'device-gone' })
  if (!deviceId && !(await (reconnecting ?? reconnect()))) throw gone()
  const send = () => {
    signal?.throwIfAborted()
    return $fetch('/api/spotify/play', {
      method: 'PUT',
      body: { deviceId, trackIds: [trackId], positionMs },
      signal,
    })
  }
  // Spotify не дал включить или не отвечает (сервер уже повторил) — трек сыграет Яндекс, как при отключённом плеере
  const fallback = (e: any) => {
    const code = e?.data?.data?.code
    return code === 'spotify-restricted' || code === 'spotify-unavailable'
      ? Object.assign(new Error(e?.data?.message || 'Spotify недоступен'), { code: 'device-gone' })
      : e
  }
  try {
    await send()
  }
  catch (e: any) {
    if (e?.statusCode !== 404) throw fallback(e)
    if (!(await reconnect())) throw gone()
    try {
      await send()
    }
    catch (again: any) {
      if (again?.statusCode === 404) throw gone()
      throw fallback(again)
    }
  }
}

export const spotifyEngine = {
  resume: () => player?.resume(),
  pause: () => player?.pause(),
  seek: (ms: number) => player?.seek(ms),
  setVolume: (v: number) => player?.setVolume(v),
  /** Вызывать из любого жеста пользователя: без активации звук SDK при автопереходе не заиграет (Safari) */
  activate() {
    // Вне жеста активация не сработает — не «сжигаем» флаг
    if (player && !activated && navigator.userActivation?.isActive !== false) {
      activated = true
      void player?.activateElement()
    }
  },
  stop() {
    stopWatchdog()
    expectedId = null
    started = false
    lastState = null
    return player?.pause()
  },
}

export function disconnectSpotify() {
  clearTimeout(retryTimer)
  player?.disconnect()
  stopWatchdog()
  player = null
  activated = false
  deviceId = null
  tokenCache = null
  spotifyStatus.value = 'idle'
}
