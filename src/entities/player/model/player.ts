import { isMobileBrowser } from '@/shared/lib'
import type { AnalyserStatus } from '../lib/analyser'
import type { EngineCallbacks, EngineKind } from '../lib/types'
import { createYandexEngine, type YandexEngine } from '../lib/yandex-engine'
import {
  initSpotify,
  spotifyEngine,
  spotifyError,
  spotifyLivePosition,
  spotifyPlay,
  spotifyStatus,
} from '../lib/spotify-engine'
import {
  setMediaHandlers,
  setMediaMetadata,
  setMediaPlaybackState,
  setMediaPosition,
} from '../lib/media-session'
import { createConnect } from './connect'

/**
 * Единый плеер: одна очередь, два движка.
 *  - трек Яндекса → <audio>;
 *  - трек Spotify → Web Playback SDK, если он готов (десктоп), иначе → тот же трек из Яндекса.
 * Состояние — модульный синглтон: изменяется только на клиенте.
 */

export type RepeatMode = 'off' | 'all' | 'one'

const queue = ref<Track[]>([])
const index = ref(-1)
const current = computed<Track | null>(() => queue.value[index.value] ?? null)
const isPlaying = ref(false)
const buffering = ref(false)
const position = ref(0)
const duration = ref(0)
const volume = ref(0.8)
const muted = ref(false)
const repeat = ref<RepeatMode>('off')
const error = ref('')
const engine = ref<EngineKind | null>(null)

let yandex: YandexEngine | null = null
/** Ревизия очереди: меняется при любой замене массива (для отправки снимка на сервер) */
let queueRev = 0
watch(queue, () => {
  queueRev++
  // Очередь поменялась (добавили трек, «играть следующим») — обновить кэш следующих треков
  if (import.meta.client) setTimeout(prefetchUpcoming, 1500)
})
/** Позиция, с которой начать после восстановления («продолжить с того же места») */
let pendingStartMs = 0
let ticker: ReturnType<typeof setInterval> | undefined

/** Визуализатор: включён ли в настройках и работает ли сейчас (CDN может не разрешить CORS) */
const visualizer = ref(false)
const analyserStatus = ref<AnalyserStatus>('off')
/** Только компьютер: на телефонах Web Audio обрывает звук в фоне и на экране блокировки */
const visualizerSupported = () => import.meta.client && !isMobileBrowser() && typeof AudioContext !== 'undefined'

/** Сколько недоступных треков подряд пропущено (сбрасывается, когда что-то заиграло) */
let skipStreak = 0

const callbacks: EngineCallbacks = {
  onAnalyser: s => (analyserStatus.value = s),
  onPlaying(p) {
    isPlaying.value = p
    if (p) {
      skipStreak = 0
      error.value = ''
    }
    setMediaPlaybackState(p)
  },
  onTime(pos, dur) {
    position.value = pos
    if (dur) duration.value = dur
  },
  onBuffering: b => (buffering.value = b),
  onLost(pos) {
    // Spotify замолчал посреди трека: сбрасываем «играет» и доигрываем тот же трек через Яндекс с этой позиции
    const t = current.value
    if (engine.value !== 'spotify' || !t) return
    isPlaying.value = false
    engine.value = 'yandex'
    getYandex().load(yandexSrc(t), pos)
  },
  onEnded: () => {
    if (sleepAt.value === 'track') {
      sleepAt.value = null
      pause()
      return
    }
    next(true)
  },
  onError(msg, skippable) {
    error.value = msg
    isPlaying.value = false
    // Недоступный трек — как в Spotify/Яндексе: сами переходим к следующему.
    // Не больше трёх подряд: если пропала сеть, не перебираем всю очередь.
    if (skippable && skipStreak < 3 && index.value < queue.value.length - 1) {
      skipStreak++
      error.value = 'Трек недоступен — включаю следующий'
      const at = index.value
      setTimeout(() => {
        if (index.value === at) next()
      }, 1200)
    }
  },
}

function getYandex() {
  yandex ??= createYandexEngine(callbacks)
  yandex.setVolume(muted.value ? 0 : volume.value)
  return yandex
}

// ---------- Предзагрузка и кроссфейд ----------

/** Длительность кроссфейда, мс (0 — без кроссфейда, только бесшовный переход) */
const crossfade = ref(0)
const PRELOAD_BEFORE_END_MS = 30_000
/** На хорошей сети следующий трек грузим почти сразу — «Следующий» срабатывает мгновенно */
const EARLY_PRELOAD_AFTER_MS = 4000

/** Мобильная сеть / экономия трафика — не качаем заранее больше необходимого */
function constrainedNetwork() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean, type?: string, effectiveType?: string } }).connection
  return !!c && (c.saveData === true || c.type === 'cellular' || c.effectiveType === '2g' || c.effectiveType === '3g')
}

/** Следующий трек заранее грузится во второй <audio>; кроссфейд — только между треками Яндекс-движка. */
function preloadNext() {
  if (!yandex || engine.value !== 'yandex' || !isPlaying.value || repeat.value === 'one') return
  const nextTrack = queue.value[index.value + 1]
  const nextOnYandex = !!nextTrack && pickEngine(nextTrack) === 'yandex'
  yandex.setCrossfade(nextOnYandex ? smartCrossfade(current.value, nextTrack) : 0)
  const nearEnd = duration.value - position.value <= PRELOAD_BEFORE_END_MS
  const early = position.value >= EARLY_PRELOAD_AFTER_MS && !constrainedNetwork()
  if (nextOnYandex && (nearEnd || early)) yandex.preload(yandexSrc(nextTrack))
}

/** Вызывать из клика: браузер запускает Web Audio только из жеста пользователя. */
function setVisualizer(on: boolean) {
  visualizer.value = on && visualizerSupported()
  getYandex().setAnalyser(visualizer.value)
  try {
    localStorage.setItem('player:visualizer', on ? '1' : '0')
  }
  catch {}
}

// ---------- Кэш следующих треков (метро, плохая связь) ----------

/** Заранее скачивать следующие треки (service worker, public/sw.js) */
const offlineNext = ref(true)
function setOfflineNext(on: boolean) {
  offlineNext.value = on
  try {
    localStorage.setItem('player:offline-next', on ? '1' : '0')
  }
  catch {}
  if (!on) navigator.serviceWorker?.controller?.postMessage({ type: 'clear-audio' })
}
let lastPrefetch = ''
/** Передать service worker'у 3 следующих трека, которые будут играть через <audio> */
function prefetchUpcoming() {
  const sw = navigator.serviceWorker?.controller
  if (!offlineNext.value || !sw) return
  const urls = queue.value.slice(index.value + 1, index.value + 4)
    .filter(t => pickEngine(t) === 'yandex')
    .map(t => yandexSrc(t))
  const key = urls.join('|')
  if (!urls.length || key === lastPrefetch) return
  lastPrefetch = key
  sw.postMessage({ type: 'prefetch-audio', urls })
}

/**
 * «Умный» кроссфейд: не накладываем треки одного альбома подряд (в альбомах песни часто перетекают
 * друг в друга без пауз — наложение испортило бы переход) и не съедаем короткие треки:
 * наложение — не больше четверти более короткого из двух.
 */
function smartCrossfade(cur: Track | null, nxt: Track | undefined) {
  if (!crossfade.value || !cur || !nxt) return 0
  if (cur.albumId && cur.albumId === nxt.albumId && cur.source === nxt.source) return 0
  const shortest = Math.min(cur.durationMs || Infinity, nxt.durationMs || Infinity)
  return Math.min(crossfade.value, Math.floor(shortest / 4))
}

function setCrossfade(ms: number) {
  crossfade.value = ms
  try {
    localStorage.setItem('player:crossfade', String(ms))
  }
  catch {}
}

// ---------- Качество звука ----------

export type AudioQuality = 'auto' | 'lq' | 'nq' | 'hq'
const quality = ref<AudioQuality>('auto')
function setQuality(q: AudioQuality) {
  quality.value = q
  try {
    localStorage.setItem('player:quality', q)
  }
  catch {}
}
/** «Авто»: высокое на Wi-Fi/кабеле, обычное в мобильной сети и при «Экономии трафика» */
function effectiveQuality(): Exclude<AudioQuality, 'auto'> {
  if (quality.value !== 'auto') return quality.value
  const c = (navigator as Navigator & { connection?: { saveData?: boolean, type?: string, effectiveType?: string } }).connection
  if (c?.saveData) return 'lq'
  if (c?.type === 'cellular' || c?.effectiveType === '3g' || c?.effectiveType === '2g') return 'nq'
  return 'hq'
}

function yandexSrc(t: Track) {
  const q = effectiveQuality()
  if (t.source === 'yandex') return `/api/yandex/stream/${encodeURIComponent(t.sourceId)}?quality=${q}`
  // Трек Spotify → ищем этот же трек в Яндексе и сразу получаем поток (один запрос, без await в клике).
  const params = new URLSearchParams({ title: t.title, artists: t.artists.join('|'), durationMs: String(t.durationMs), quality: q })
  return `/api/yandex/match-stream?${params}`
}

/** «Только Яндекс» в настройках: даже треки Spotify играют через совпадение в Яндексе */
const onlyYandex = ref(false)
function setMusicServices(s: MusicServices) {
  onlyYandex.value = s === 'yandex'
}

function pickEngine(t: Track): EngineKind {
  return t.source === 'spotify' && spotifyStatus.value === 'ready' && !onlyYandex.value ? 'spotify' : 'yandex'
}

/** Запуск текущего трека. Синхронный до старта звука — можно вызывать из обработчика клика. */
function startCurrent(startMs = 0) {
  const t = current.value
  if (!t) return
  pendingStartMs = 0
  error.value = ''
  position.value = startMs
  duration.value = t.durationMs

  const kind = pickEngine(t)
  if (engine.value && engine.value !== kind) stopEngine(engine.value)
  engine.value = kind
  // Первый клик «Играть» (даже на треке Яндекса) активирует звук Spotify — автопереход на него потом не требует жеста
  spotifyEngine.activate()

  if (kind === 'spotify') {
    spotifyPlay(t.sourceId, startMs).catch((e: any) => {
      if (current.value?.uid !== t.uid) return // уже переключили дальше
      // Браузерный плеер Spotify отключился и не переподключился — этот трек играем через Яндекс (как на телефоне),
      // а не останавливаемся с ошибкой; следующий трек снова попробует Spotify
      if (e?.code === 'device-gone') {
        spotifyEngine.stop()
        engine.value = 'yandex'
        getYandex().load(yandexSrc(t), startMs)
        return
      }
      callbacks.onError(e?.data?.message || e?.message || 'Ошибка Spotify')
    })
  }
  else {
    getYandex().load(yandexSrc(t), startMs)
  }
  setMediaMetadata(t)
  // Следующие треки — заранее в кэш (с небольшой задержкой: сначала пусть начнёт играть текущий).
  // Только если трек всё ещё этот: при быстром листании каждый свайп иначе заказывал по три трека,
  // и ненужные загрузки забивали мобильную сеть — новый трек долго не начинал играть
  const uid = t.uid
  setTimeout(() => {
    if (current.value?.uid === uid) prefetchUpcoming()
  }, 4000)
  // Близко к концу очереди (осталось ≤ 3 трека) — заранее подгружаем продолжение: и у радио, и у альбома/плейлиста.
  // Раньше обычная очередь добиралась только на последнем треке — «Далее» успевало показать «Очередь пуста».
  const left = queue.value.length - 1 - index.value
  if (autoplay.value && left <= 3) void fetchMore()
}

// ---------- Подбор музыки (радио Яндекса) ----------

/** Продолжать похожей музыкой, когда очередь закончилась. */
const autoplay = ref(true)
/**
 * Источник радио: «Моя волна», станция или исполнитель — продолжение берём из него же.
 * null — обычная очередь (в конце подбираем похожее на последний трек).
 */
export type RadioSource =
  | { station: 'wave' }
  | { station: 'id', id: string, name?: string }
  | { station: 'artist', name: string }
  | { station: 'blend', id: string, name?: string }
const radioSource = ref<RadioSource | null>(null)
/** Совместимость: 'wave', если играет «Моя волна». */
const radioStation = computed(() => (radioSource.value?.station === 'wave' ? 'wave' as const : null))
const radioLoading = ref(false)
let pendingMore: Promise<Track[]> | null = null

/** Треки, которые пользователь попросил больше не предлагать (локально; в Яндекс уходит дизлайк) */
const blocked = new Set<string>()
function loadBlocked() {
  try {
    for (const u of JSON.parse(localStorage.getItem('player:blocked') || '[]')) blocked.add(String(u))
  }
  catch {}
}
function saveBlocked() {
  try {
    localStorage.setItem('player:blocked', JSON.stringify([...blocked].slice(-500)))
  }
  catch {}
}

/**
 * «Больше не предлагать»: запоминаем, убираем трек из оставшейся очереди и, если он играет, переключаем дальше.
 * Возвращает функцию отмены (вернуть в список «можно предлагать»).
 */
function dislike(t: Track) {
  blocked.add(t.uid)
  saveBlocked()
  const wasCurrent = current.value?.uid === t.uid
  const keep = queue.value.filter((x, i) => i <= index.value || x.uid !== t.uid)
  if (keep.length !== queue.value.length) queue.value = keep
  if (wasCurrent) next()
  return () => {
    blocked.delete(t.uid)
    saveBlocked()
  }
}

function requestMore(): Promise<Track[]> {
  const seed = queue.value.at(-1)
  if (!seed && !radioSource.value) return Promise.resolve([])
  return $fetch<Track[]>('/api/radio', {
    method: 'POST',
    body: {
      // seed — точка продолжения: без неё станция отдаёт ту же первую порцию, и поток обрывался
      ...(radioSource.value ?? { station: 'similar' }),
      seed,
      exclude: queue.value.slice(-300).map(t => t.uid),
    },
  })
}

/**
 * «Не предлагать исполнителя»: его песни убираются из оставшейся очереди (играет — переключаемся дальше)
 * и не берутся из радио на этом устройстве (на сервере список общий — radio/подборки фильтрует он).
 * Возвращает функцию отмены (вернуть в подбор; убранное из очереди не возвращается).
 */
const blockedArtists = new Set<string>()
const artistKey = (name: string) => name.trim().toLowerCase().replace(/ё/g, 'е')
const byBlockedArtist = (t: Track) => t.artists.some(a => blockedArtists.has(artistKey(a)))

function blockArtist(name: string) {
  const key = artistKey(name)
  blockedArtists.add(key)
  const wasCurrent = !!current.value && byBlockedArtist(current.value)
  const keep = queue.value.filter((x, i) => i <= index.value || !byBlockedArtist(x))
  if (keep.length !== queue.value.length) queue.value = keep
  if (wasCurrent) next()
  return () => {
    blockedArtists.delete(key)
  }
}

function fetchMore(): Promise<Track[]> {
  if (pendingMore) return pendingMore
  if (!queue.value.length && !radioSource.value) return Promise.resolve([])
  radioLoading.value = true
  // Сбой сети / пустой ответ — ещё одна попытка через секунду, прежде чем остановить музыку
  pendingMore = requestMore()
    .catch(() => [] as Track[])
    .then(all => all.length ? all : new Promise<Track[]>(r => setTimeout(r, 1000, null)).then(() => requestMore()))
    .then((all) => {
      // «Больше не предлагать» — такие треки радио не ставит
      const more = all.filter(t => !blocked.has(t.uid) && !byBlockedArtist(t))
      if (more.length) {
        queue.value = [...queue.value, ...more]
        originalQueue.push(...more)
      }
      return more
    })
    .catch(() => [] as Track[])
    .finally(() => {
      pendingMore = null
      radioLoading.value = false
    })
  return pendingMore
}

/** Запуск радио (волна / станция / исполнитель). Вызывается из клика. */
async function startRadio(source: RadioSource) {
  // Разблокируем звук до сетевого запроса (iOS разрешает старт только из жеста).
  getYandex().unlock()
  spotifyEngine.activate()
  radioSource.value = source
  radioLoading.value = true
  try {
    const tracks = await $fetch<Track[]>('/api/radio', { method: 'POST', body: source })
    if (!tracks.length) throw new Error('Станция пуста')
    playQueue(tracks, 0, { shuffle: false, keepRadio: true })
  }
  catch (e: any) {
    error.value = e?.data?.message || 'Не удалось запустить радио'
    radioSource.value = null
  }
  finally {
    radioLoading.value = false
  }
}

const startWave = () => startRadio({ station: 'wave' })

function setAutoplay(v: boolean) {
  autoplay.value = v
  try {
    localStorage.setItem('player:autoplay', v ? '1' : '0')
  }
  catch {}
}

function stopEngine(kind: EngineKind) {
  if (kind === 'spotify') spotifyEngine.stop()
  else yandex?.stop()
}

const shuffle = ref(false)
/** Исходный порядок очереди — чтобы вернуть его при выключении перемешивания. */
let originalQueue: Track[] = []

function shuffled<T>(arr: T[]) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function playQueue(tracks: Track[], startIndex = 0, opts: { shuffle?: boolean, keepRadio?: boolean } = {}) {
  if (!opts.keepRadio) radioSource.value = null
  if (opts.shuffle !== undefined) shuffle.value = opts.shuffle
  originalQueue = tracks.slice()
  if (shuffle.value) {
    // Выбранный трек (или случайный при «Перемешать») — первым, остальные вперемешку.
    const first = opts.shuffle ? Math.floor(Math.random() * tracks.length) : startIndex
    const rest = tracks.filter((_, i) => i !== first)
    queue.value = [tracks[first]!, ...shuffled(rest)]
    index.value = 0
  }
  else {
    queue.value = tracks.slice()
    index.value = startIndex
  }
  startCurrent()
}

function toggleShuffle() {
  shuffle.value = !shuffle.value
  const cur = current.value
  if (!cur) return
  if (shuffle.value) {
    originalQueue = queue.value.slice()
    const rest = queue.value.filter((_, i) => i !== index.value)
    queue.value = [cur, ...shuffled(rest)]
    index.value = 0
  }
  else if (originalQueue.length) {
    queue.value = originalQueue.slice()
    index.value = Math.max(0, queue.value.findIndex(t => t.uid === cur.uid))
  }
}

/** Вставить сразу после текущего трека. */
function playNext(t: Track) {
  if (!current.value) return playQueue([t])
  const q = queue.value.slice()
  q.splice(index.value + 1, 0, t)
  queue.value = q
  originalQueue.push(t)
}

/** В конец очереди. */
function addToQueue(list: Track[]) {
  if (!current.value) return playQueue(list)
  queue.value = [...queue.value, ...list]
  originalQueue.push(...list)
}

/** Убрать трек из оставшейся очереди (номер — в queue; играющий и прошлые не трогаем) */
function removeAt(i: number) {
  if (i <= index.value || i >= queue.value.length) return
  const [t] = queue.value.slice(i, i + 1)
  queue.value = queue.value.filter((_, k) => k !== i)
  // Из исходного порядка (для выключения «перемешать») — одну копию того же трека
  const j = originalQueue.findIndex(x => x.uid === t?.uid)
  if (j >= 0) originalQueue.splice(j, 1)
}

/** Переставить трек в оставшейся очереди: from → to (оба — после играющего) */
function moveInQueue(from: number, to: number) {
  const min = index.value + 1
  if (from < min || to < min || from >= queue.value.length || to >= queue.value.length || from === to) return
  const q = queue.value.slice()
  const [t] = q.splice(from, 1)
  q.splice(to, 0, t!)
  queue.value = q
}

function playAt(i: number) {
  if (i < 0 || i >= queue.value.length) return
  index.value = i
  startCurrent()
}

function resume() {
  if (!current.value) return
  if (!engine.value) return startCurrent(pendingStartMs)
  if (engine.value === 'spotify') spotifyEngine.resume()
  else getYandex().resume()
}

function pause() {
  if (engine.value === 'spotify') spotifyEngine.pause()
  else yandex?.pause()
}

function toggle() {
  if (isPlaying.value) pause()
  else resume()
}

/**
 * Сигнал подбору: трек дослушан или пропущен (< 30 с). Только для радио (волна, станции, миксы) — в своих
 * плейлистах переключение не значит «не нравится». Сервер копит пропуски («чтобы не надоедало») и передаёт
 * обратную связь «Моей волне» Яндекса. Меньше секунды — случайное касание, не считаем.
 */
function reportListen(t: Track, auto: boolean) {
  const radio = radioSource.value
  if (!radio) return
  const played = position.value
  const type = auto ? 'finish' : played < 30_000 && played >= 1000 ? 'skip' : null
  if (!type) return
  const station = radio.station === 'wave' ? 'wave' : radio.station === 'id' ? radio.id : undefined
  $fetch('/api/radio/feedback', { method: 'POST', body: { track: t, type, playedMs: Math.round(played), station } }).catch(() => {})
}

function next(auto = false) {
  if (!queue.value.length) return
  if (current.value && !(auto && repeat.value === 'one')) reportListen(current.value, auto)
  if (auto && repeat.value === 'one') {
    seek(0)
    resume()
    return
  }
  if (index.value < queue.value.length - 1) {
    index.value++
  }
  else if (repeat.value === 'all') {
    index.value = 0
  }
  else if (autoplay.value) {
    // Конец очереди: продолжаем похожей музыкой (продолжение обычно уже подгружено заранее).
    const from = index.value
    void fetchMore().then((more) => {
      if (!more.length || index.value !== from) {
        if (!more.length) isPlaying.value = false
        return
      }
      index.value = from + 1
      startCurrent()
    })
    return
  }
  else {
    // Конец очереди: останавливаемся на последнем треке.
    isPlaying.value = false
    return
  }
  startCurrent()
}

function previous() {
  // Как в привычных плеерах: если трек играет дольше 3 с — сначала в начало.
  if (position.value > 3000 || index.value <= 0) {
    seek(0)
    return
  }
  index.value--
  startCurrent()
}

function seek(ms: number) {
  position.value = ms
  if (engine.value === 'spotify') spotifyEngine.seek(ms)
  else yandex?.seek(ms)
}

function applyVolume() {
  const v = muted.value ? 0 : volume.value
  yandex?.setVolume(v)
  spotifyEngine.setVolume(v)
  try {
    localStorage.setItem('player:volume', String(volume.value))
  }
  catch {}
}

function setVolume(v: number) {
  volume.value = Math.min(1, Math.max(0, v))
  muted.value = volume.value === 0
  applyVolume()
}

function toggleMute() {
  muted.value = !muted.value
  if (!muted.value && volume.value === 0) volume.value = 0.5
  applyVolume()
}

function cycleRepeat() {
  repeat.value = repeat.value === 'off' ? 'all' : repeat.value === 'all' ? 'one' : 'off'
}

// ---------- Таймер сна ----------

/** Когда поставить паузу (unix ms) или 'track' — после текущего трека */
const sleepAt = ref<number | 'track' | null>(null)
let sleepTimer: ReturnType<typeof setTimeout> | undefined

function setSleepTimer(minutes: number | 'track' | null) {
  clearTimeout(sleepTimer)
  if (minutes === null) {
    sleepAt.value = null
    return
  }
  if (minutes === 'track') {
    sleepAt.value = 'track'
    return
  }
  sleepAt.value = Date.now() + minutes * 60_000
  sleepTimer = setTimeout(() => {
    sleepAt.value = null
    pause()
  }, minutes * 60_000)
}

// ---------- Подключение устройств ----------

function executeCommand(cmd: DeviceCommand) {
  switch (cmd.type) {
    case 'play-queue':
      radioSource.value = cmd.radio ?? null
      originalQueue = cmd.queue.slice()
      queue.value = cmd.queue.slice()
      index.value = Math.min(Math.max(0, cmd.index), cmd.queue.length - 1)
      startCurrent(cmd.positionMs)
      break
    case 'handoff': connect.handoff(cmd.to); break
    case 'enqueue':
      if (cmd.next) [...cmd.tracks].reverse().forEach(playNext)
      else addToQueue(cmd.tracks)
      break
    case 'pause': pause(); break
    case 'resume': resume(); break
    case 'next': next(); break
    case 'previous': previous(); break
    case 'seek': seek(cmd.ms); break
    case 'volume': setVolume(cmd.value); break
  }
}

/** Показать последнее воспроизведение на паузе — «Играть» продолжит с той же секунды. */
function restore(r: ResumeState) {
  if (current.value) return
  const q = r.queue?.queue.length ? r.queue : { queue: [r.track], index: 0, radio: null }
  const i = Math.max(0, q.queue.findIndex(t => t.uid === r.track.uid))
  queue.value = q.queue.slice()
  originalQueue = q.queue.slice()
  index.value = i
  radioSource.value = q.radio ?? null
  position.value = r.positionMs
  duration.value = r.track.durationMs
  pendingStartMs = r.positionMs
  isPlaying.value = false
  setMediaMetadata(r.track)
}

const connect = createConnect({
  state: () => (current.value
    ? { track: current.value, isPlaying: isPlaying.value, positionMs: Math.round(position.value), durationMs: Math.round(duration.value), at: Date.now(), volume: volume.value }
    : null),
  isPlaying: () => isPlaying.value,
  snapshot: () => (current.value
    ? { queue: queue.value.slice(index.value, index.value + 300), index: 0, positionMs: Math.round(position.value), radio: radioSource.value }
    : null),
  queueSnapshot: () => (current.value
    ? {
        key: `${queueRev}:${index.value}`,
        data: { queue: queue.value.slice(index.value, index.value + 200), index: 0, radio: radioSource.value },
      }
    : null),
  execute: executeCommand,
  pauseLocal: () => pause(),
  unlock: () => {
    getYandex().unlock()
    spotifyEngine.activate()
  },
})

/** Действия плеера: при управлении другим устройством уходят ему командой. */
const remoteActive = computed(() => connect.controlling.value !== null)

// ---------- Разогрев: ссылка на поток готова к моменту клика ----------

const warmed = new Map<string, number>()
/**
 * Палец коснулся трека (касание → отпускание ≈ 100–300 мс) — просим сервер заранее получить ссылку на поток.
 * Сервер держит её 90 с, и запуск трека не ждёт API Яндекса. Сам звук не качаем.
 */
function warmTrack(t: Track) {
  if (pickEngine(t) !== 'yandex' || remoteActive.value) return
  const src = yandexSrc(t)
  const at = warmed.get(src)
  if (at && Date.now() - at < 60_000) return
  warmed.set(src, Date.now())
  if (warmed.size > 50) warmed.delete(warmed.keys().next().value!)
  // redirect: 'manual' — нужен только ответ нашего сервера (он и кэширует ссылку), до CDN не идём
  fetch(src, { redirect: 'manual', credentials: 'same-origin' }).catch(() => {})
}

/** Включить треки с позиции (например, «Слушать вместе» — догоняем друга). Только это устройство. */
function playFrom(tracks: Track[], startIndex: number, positionMs: number) {
  if (!tracks.length) return
  radioSource.value = null
  originalQueue = tracks.slice()
  queue.value = tracks.slice()
  index.value = Math.min(Math.max(0, startIndex), tracks.length - 1)
  startCurrent(Math.max(0, positionMs))
}

function uiPlayQueue(tracks: Track[], startIndex = 0, opts: { shuffle?: boolean, keepRadio?: boolean } = {}) {
  if (!remoteActive.value) return playQueue(tracks, startIndex, opts)
  let list = tracks
  let i = startIndex
  if (opts.shuffle) {
    list = shuffled(tracks)
    i = 0
  }
  connect.control({ type: 'play-queue', queue: list.slice(0, 300), index: i, positionMs: 0, play: true, radio: opts.keepRadio ? radioSource.value : null })
}

async function uiStartRadio(source: RadioSource) {
  if (!remoteActive.value) return startRadio(source)
  radioLoading.value = true
  try {
    const tracks = await $fetch<Track[]>('/api/radio', { method: 'POST', body: source })
    if (tracks.length) connect.control({ type: 'play-queue', queue: tracks, index: 0, positionMs: 0, play: true, radio: source })
  }
  catch (e: any) {
    error.value = e?.data?.message || 'Не удалось запустить радио'
  }
  finally {
    radioLoading.value = false
  }
}

const viaRemote = (cmd: DeviceCommand, localFn: () => void) => () => {
  if (!connect.control(cmd)) localFn()
}

let initialized = false
/** Вызывается один раз на клиенте (плагин app-слоя). */
function initPlayer() {
  if (initialized || import.meta.server) return
  initialized = true

  try {
    const saved = Number(localStorage.getItem('player:volume'))
    if (saved >= 0 && saved <= 1 && localStorage.getItem('player:volume') !== null) volume.value = saved
  }
  catch {}

  try {
    if (localStorage.getItem('player:autoplay') === '0') autoplay.value = false
    crossfade.value = Number(localStorage.getItem('player:crossfade')) || 0
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    const savedOffline = localStorage.getItem('player:offline-next')
    offlineNext.value = savedOffline ? savedOffline === '1' : !conn?.saveData
    const q = localStorage.getItem('player:quality') as AudioQuality | null
    if (q && ['auto', 'lq', 'nq', 'hq'].includes(q)) quality.value = q
    // По умолчанию включён на компьютере. AudioContext запустится при первом нажатии «Играть».
    if (visualizerSupported() && localStorage.getItem('player:visualizer') !== '0') {
      visualizer.value = true
      getYandex().setAnalyser(true)
    }
  }
  catch {}

  loadBlocked()
  setMediaHandlers({ play: resume, pause, next: () => next(), previous, seek })
  connect.start()

  // Продолжить с того же места: последнее воспроизведение с любого устройства (если сейчас нигде не играет).
  $fetch<ResumeState | null>('/api/devices/resume', { query: { device: connect.selfId.value } })
    .then((r) => {
      if (r && !current.value && !connect.controlling.value) restore(r)
    })
    .catch(() => {})

  // Spotify присылает позицию редко — для него досчитываем её сами.
  ticker = setInterval(() => {
    if (engine.value === 'spotify' && isPlaying.value) position.value = spotifyLivePosition()
    if (isPlaying.value) setMediaPosition(position.value, duration.value)
    preloadNext()
  }, 500)
}

function connectSpotifyEngine() {
  return initSpotify(callbacks)
}

export function usePlayer() {
  const r = connect.remoteState
  const remote = remoteActive
  return {
    // При управлении другим устройством показываем его состояние.
    queue: computed(() => (remote.value ? [] : queue.value)),
    index: computed(() => (remote.value ? -1 : index.value)),
    current: computed<Track | null>(() => (remote.value ? r.value?.track ?? null : current.value)),
    isPlaying: computed(() => (remote.value ? Boolean(r.value?.isPlaying) : isPlaying.value)),
    buffering: computed(() => (remote.value ? false : buffering.value)),
    position: computed(() => (remote.value ? connect.remotePosition.value : position.value)),
    duration: computed(() => (remote.value ? r.value?.durationMs ?? 0 : duration.value)),
    volume: computed(() => (remote.value ? r.value?.volume ?? volume.value : volume.value)),
    muted: readonly(muted),
    repeat: readonly(repeat),
    shuffle: readonly(shuffle),
    autoplay: readonly(autoplay),
    crossfade: readonly(crossfade),
    quality: readonly(quality),
    setQuality,
    offlineNext: readonly(offlineNext),
    setOfflineNext,
    visualizer: readonly(visualizer),
    visualizerSupported,
    /** Узел анализатора для отрисовки (null — визуализатор не работает для текущего трека) */
    analyserNode: () => (remoteActive.value || engine.value !== 'yandex' ? null : yandex?.analyserNode() ?? null),
    analyserStatus: readonly(analyserStatus),
    sleepAt: readonly(sleepAt),
    radioStation,
    radioSource: readonly(radioSource),
    radioLoading: readonly(radioLoading),
    error: computed(() => (remote.value ? '' : error.value)),
    engine: computed(() => (remote.value ? null : engine.value)),
    spotifyStatus: readonly(spotifyStatus),
    spotifyError: readonly(spotifyError),

    // Устройства
    devices: connect.devices,
    loadSpotifyDevices: connect.loadSpotifyDevices,
    selfDeviceId: connect.selfId,
    controlling: connect.controlling,
    remoteDevice: connect.remote,
    transferTo: connect.transferTo,

    playQueue: uiPlayQueue,
    /** Разрешить звук на iOS: вызвать в клике, если перед playQueue нужен запрос */
    unlock: () => {
      if (remoteActive.value) return
      getYandex().unlock()
      spotifyEngine.activate()
    },
    playFrom,
    warmTrack,
    playAt,
    playNext: (t: Track) => {
      if (!connect.control({ type: 'enqueue', tracks: [t], next: true })) playNext(t)
    },
    addToQueue: (list: Track[]) => {
      if (!connect.control({ type: 'enqueue', tracks: list, next: false })) addToQueue(list)
    },
    toggleShuffle,
    /** Очередь «Далее»: убрать / переставить (только на этом устройстве — у пульта команд для этого нет) */
    removeAt,
    moveInQueue,
    /** Сыграть следующим трек, уже стоящий в очереди (переставить сразу за играющим) */
    playNextAt: (i: number) => moveInQueue(i, index.value + 1),
    /** «Больше не предлагать» (только это устройство): убрать из очереди и не брать из радио */
    dislike,
    /** «Не предлагать исполнителя»: убрать его песни из оставшейся очереди и не брать из радио */
    blockArtist,
    startWave: () => uiStartRadio({ station: 'wave' }),
    startRadio: uiStartRadio,
    setAutoplay,
    setCrossfade,
    setVisualizer,
    setMusicServices,
    setSleepTimer,
    toggle: () => {
      if (remote.value) connect.control({ type: r.value?.isPlaying ? 'pause' : 'resume' })
      else toggle()
    },
    resume: viaRemote({ type: 'resume' }, resume),
    pause: viaRemote({ type: 'pause' }, pause),
    next: viaRemote({ type: 'next' }, () => next()),
    previous: viaRemote({ type: 'previous' }, previous),
    seek: (ms: number) => {
      if (!connect.control({ type: 'seek', ms })) seek(ms)
    },
    setVolume: (v: number) => {
      if (!connect.control({ type: 'volume', value: v })) setVolume(v)
    },
    toggleMute,
    cycleRepeat,
    initPlayer,
    connectSpotifyEngine,
  }
}

// для HMR в dev
if (import.meta.hot) import.meta.hot.dispose(() => clearInterval(ticker))
