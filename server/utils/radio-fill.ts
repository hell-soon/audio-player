import { and, desc, eq, gte } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Добор треков со станций Яндекса.
 *
 * 1. **Сессии радио** (`/rotor/session/new` → `/rotor/session/{id}/tracks` с `queue` — уже выданными треками),
 *    как у нынешних клиентов Яндекса: каждая порция — новые треки. Сессия живёт в памяти инстанса 20 мин,
 *    живой поток продолжает её же (на другом инстансе — просто новая сессия).
 * 2. Запасной путь — старый `/rotor/station/{id}/tracks?queue=`: без «обратной связи» (`trackStarted`) он раз за разом
 *    отдаёт одну и ту же порцию (так подборки и застревали на ~10 песнях). Поэтому перед продолжением шлём
 *    `feedback trackStarted` и идём «вширь»: каждый новый трек — точка продолжения.
 * Формат ответов не документирован — разбор мягкий; не распознали — следующий способ.
 */

/** id трека Яндекса без альбома ("123:456" → "123"), для других источников — null */
export const yandexTrackId = (t: Track | undefined | null) => (t?.source === 'yandex' ? t.sourceId.split(':')[0]! : null)

/** Ключ «та же песня»: исполнитель + название без пометок (одна запись с разных релизов — один ключ) */
export const songKey = (t: Track) => `${normalize(t.artists[0] ?? '')}|${normalize(t.title)}`

export interface FillOptions {
  /** Сколько новых треков набрать */
  target: number
  /** Не больше стольких запросов к Яндексу */
  maxCalls?: number
  /** Запросов одновременно (запасной путь) */
  concurrency?: number
  /** uid и ключи песен (`songKey`), которые не брать */
  exclude?: Set<string>
  /** Точки продолжения (id треков Яндекса) — с них начинаем; нет — первая порция станции */
  seeds?: (string | null | undefined)[]
  /** Дополнительный отбор (например, год выпуска) — отброшенные треки всё равно служат точками продолжения */
  accept?: (t: Track) => boolean
  /** Продолжить сессию радио пользователя (живой поток), а не начинать новую (подборки) */
  continueSession?: boolean
}

const SESSION_TTL = 20 * 60_000
/** Сессии радио: `userId:station` → id сессии и выданные треки ("id:album") */
const sessions = new Map<string, { id: string, queue: string[], at: number }>()

function parseSequence(seq: unknown): Track[] {
  if (!Array.isArray(seq)) return []
  return seq
    .map((s: any) => s?.track ?? s)
    .filter((t: any) => t && t.id !== undefined && typeof t.title === 'string' && t.available !== false)
    .map((t: any) => toTrack(t))
}

async function sessionStart(event: H3Event, station: string) {
  const res = await ymPost<{ result?: any }>(event, '/rotor/session/new', { seeds: [station], includeTracksInResponse: true })
  const id = res?.result?.radioSessionId
  if (typeof id !== 'string' || !id) return null
  return { id, tracks: parseSequence(res.result.sequence) }
}

async function sessionMore(event: H3Event, id: string, queue: string[]) {
  const res = await ymPost<{ result?: any }>(event, `/rotor/session/${encodeURIComponent(id)}/tracks`, { queue: queue.slice(-30) })
  return parseSequence(res?.result?.sequence)
}

export async function stationFill(event: H3Event, station: string, o: FillOptions): Promise<Track[]> {
  const exclude = o.exclude ?? new Set<string>()
  const maxCalls = o.maxCalls ?? 8
  const out: Track[] = []
  const seen = new Set<string>()
  /** Добавить порцию; возвращает, сколько в ней было ещё не виденных треков */
  const add = (batch: Track[]) => {
    let fresh = 0
    for (const t of batch) {
      const key = songKey(t)
      if (seen.has(t.uid) || seen.has(key)) continue
      seen.add(t.uid)
      seen.add(key)
      fresh++
      if (exclude.has(t.uid) || exclude.has(key) || (o.accept && !o.accept(t))) continue
      out.push(t)
    }
    return fresh
  }

  // 1) Сессия радио
  let calls = 0
  try {
    const userId = await requireUserId(event)
    const key = `${userId}:${station}`
    let sess = o.continueSession ? sessions.get(key) : undefined
    if (sess && Date.now() - sess.at > SESSION_TTL) sess = undefined
    if (!sess) {
      const started = await sessionStart(event, station)
      calls++
      if (started) {
        sess = { id: started.id, queue: [], at: Date.now() }
        add(started.tracks)
        sess.queue.push(...started.tracks.map(t => t.sourceId))
      }
    }
    if (sess) {
      let empty = 0
      while (out.length < o.target && calls < maxCalls && empty < 2) {
        const batch = await sessionMore(event, sess.id, sess.queue)
        calls++
        sess.queue.push(...batch.map(t => t.sourceId))
        // Порция без нового — дважды подряд: сессия выдохлась
        empty = add(batch) ? 0 : empty + 1
      }
      sess.at = Date.now()
      sess.queue = sess.queue.slice(-60)
      sessions.set(key, sess)
      if (sessions.size > 500) sessions.delete(sessions.keys().next().value!)
    }
  }
  catch {
    // Сессии недоступны (метод изменился, 4xx) — запасной путь ниже; «не подключён» он сам отдаст наверх
  }
  if (out.length >= o.target) return out.slice(0, o.target)

  // 2) Запасной путь: старый метод станции + обратная связь, «вширь»
  const concurrency = o.concurrency ?? 3
  const usedQueue = new Set<string>()
  const seeds = [...new Set((o.seeds ?? []).filter((s): s is string => !!s))]
  const frontier: (string | undefined)[] = seeds.length ? seeds : [undefined]
  const budget = Math.max(maxCalls - calls, 3)
  let oldCalls = 0
  let first = true
  while (out.length < o.target && oldCalls < budget && frontier.length) {
    const wave = frontier.splice(0, Math.min(concurrency, budget - oldCalls))
    oldCalls += wave.length
    const batches = await Promise.all(wave.map(async (q) => {
      if (q) usedQueue.add(q)
      try {
        // Без «трек начал играть» станция не двигается дальше и отдаёт ту же порцию
        if (q) await ymPost(event, `/rotor/station/${station}/feedback`, { type: 'trackStarted', trackId: q, timestamp: Date.now() / 1000 }).catch(() => null)
        return await yandexStationTracks(event, station, q)
      }
      catch (e) {
        // Ошибка самого первого запроса (Яндекс не подключён — 409) — наверх, если сессия тоже ничего не дала
        if (first && wave.length === 1 && !out.length) throw e
        return [] as Track[]
      }
    }))
    first = false
    const next: string[] = []
    for (const batch of batches) {
      for (const t of batch) {
        const id = yandexTrackId(t)
        if (id && !usedQueue.has(id)) next.push(id)
      }
      add(batch)
    }
    // Сначала продолжаем от последних треков порций (так делает сам клиент Яндекса), потом от остальных
    frontier.push(...next.reverse())
  }
  return out.slice(0, o.target)
}

/** uid и ключи песен, звучавших у пользователя за последние `hours` часов — радио их не повторяет */
export async function recentlyPlayed(userId: string, hours: number) {
  const { history, tracks } = schema
  const rows = await useDb()
    .select({ t: tracks })
    .from(history)
    .innerJoin(tracks, eq(history.trackUid, tracks.uid))
    .where(and(eq(history.userId, userId), gte(history.playedAt, Date.now() - hours * 3600_000)))
    .orderBy(desc(history.playedAt))
    .limit(500)
    .catch(() => [])
  const out = new Set<string>()
  for (const r of rows) {
    const t = rowToTrack(r.t)
    out.add(t.uid)
    out.add(songKey(t))
  }
  return out
}

/**
 * «Знакомое» из библиотеки (лайки из Яндекса и Spotify вперемешку) — исполнители, которые есть среди `around`.
 * Так в подборки и поток попадают и песни Spotify, а не только находки Яндекса.
 */
export function familiarFor(library: Track[], around: Track[], exclude: Set<string>, limit: number, rnd = Math.random) {
  const artists = new Set(around.flatMap(t => t.artists.map(normalize)).filter(Boolean))
  const pool = library.filter(t => !exclude.has(t.uid) && !exclude.has(songKey(t)) && t.artists.some(a => artists.has(normalize(a))))
  return interleaveSources(shuffleWith(pool, rnd)).slice(0, limit)
}

/** Чередует источники (Яндекс / Spotify), сохраняя порядок внутри каждого: ни один сервис не «съедает» подборку */
export function interleaveSources(list: Track[]) {
  const ya = list.filter(t => t.source === 'yandex')
  const sp = list.filter(t => t.source !== 'yandex')
  const out: Track[] = []
  for (let i = 0; i < Math.max(ya.length, sp.length); i++) {
    if (ya[i]) out.push(ya[i]!)
    if (sp[i]) out.push(sp[i]!)
  }
  return out
}

/** Вставляет `extra` в `base` через каждые `every` треков (начиная после `every`-го) */
export function sprinkle(base: Track[], extra: Track[], every: number) {
  const out: Track[] = []
  let e = 0
  base.forEach((t, i) => {
    out.push(t)
    if ((i + 1) % every === 0 && e < extra.length) out.push(extra[e++]!)
  })
  return out
}

export function shuffleWith<T>(list: T[], rnd: () => number) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}
