import { and, desc, eq, gte } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Добор треков со станций Яндекса (`/rotor/station/{id}/tracks`).
 * Станция отдаёт ~5 треков за запрос, а продолжение зависит от `queue` — трека, «после которого» подбирать.
 * С одним и тем же `queue` приходит та же порция — поэтому идём «вширь»: каждый новый трек сам становится
 * точкой продолжения, запросы — параллельно небольшими волнами. Так плейлист набирается до нужного размера,
 * а не застревает на 10–15 песнях.
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
  /** Запросов одновременно */
  concurrency?: number
  /** uid и ключи песен (`songKey`), которые не брать */
  exclude?: Set<string>
  /** Точки продолжения (id треков Яндекса) — с них начинаем; нет — первая порция станции */
  seeds?: (string | null | undefined)[]
  /** Дополнительный отбор (например, год выпуска) — отброшенные треки всё равно служат точками продолжения */
  accept?: (t: Track) => boolean
}

export async function stationFill(event: H3Event, station: string, o: FillOptions): Promise<Track[]> {
  const maxCalls = o.maxCalls ?? 8
  const concurrency = o.concurrency ?? 3
  const exclude = o.exclude ?? new Set<string>()
  const out: Track[] = []
  const seen = new Set<string>()
  const usedQueue = new Set<string>()
  const seeds = [...new Set((o.seeds ?? []).filter((s): s is string => !!s))]
  const frontier: (string | undefined)[] = seeds.length ? seeds : [undefined]
  let calls = 0
  let first = true

  while (out.length < o.target && calls < maxCalls && frontier.length) {
    const wave = frontier.splice(0, Math.min(concurrency, maxCalls - calls))
    calls += wave.length
    const batches = await Promise.all(wave.map(async (q) => {
      if (q) usedQueue.add(q)
      try {
        return await yandexStationTracks(event, station, q)
      }
      catch (e) {
        // Ошибка самого первого запроса (Яндекс не подключён — 409) — наверх; дальше просто пропускаем
        if (first && wave.length === 1) throw e
        return [] as Track[]
      }
    }))
    first = false
    const next: string[] = []
    for (const batch of batches) {
      for (const t of batch) {
        const key = songKey(t)
        if (seen.has(t.uid) || seen.has(key)) continue
        seen.add(t.uid)
        seen.add(key)
        const id = yandexTrackId(t)
        if (id && !usedQueue.has(id)) next.push(id)
        if (exclude.has(t.uid) || exclude.has(key) || (o.accept && !o.accept(t))) continue
        out.push(t)
      }
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
