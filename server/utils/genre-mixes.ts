import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Плейлисты по жанрам, настроениям, эпохам и занятиям — из радиостанций Яндекса.
 *  - Каталог станций: `/rotor/stations/list` (разбор мягкий: что не распознали — не показываем).
 *  - «Жанры дня» на главной — 8 станций на весь день: половина по вкусу (жанры любимых исполнителей,
 *    рекомендации Яндекса), остальные — случайно по группам (зерно `userId:день`).
 *  - Плейлист станции собирается из нескольких порций треков станции (продолжение — по последнему треку),
 *    «мягко по вкусу»: радио Яндекса и так подбирает с оглядкой на аккаунт, лайкнутое отбрасываем; каждый пятый трек —
 *    любимое тех же исполнителей из библиотеки (Яндекс и Spotify вперемешку).
 *    Хранится в таблице mixes (kind = "station:genre:rock") до конца дня по Москве; «Пересобрать» — fresh.
 */

const TYPES: { type: string, title: string, daily: number }[] = [
  { type: 'genre', title: 'Жанры', daily: 4 },
  { type: 'mood', title: 'Настроение', daily: 2 },
  { type: 'epoch', title: 'Эпохи', daily: 1 },
  { type: 'activity', title: 'Занятия', daily: 1 },
]
/** Новых треков в плейлисте станции (плюс знакомые из библиотеки) */
const TARGET = 45
const MAX_CALLS = 14
/** Версия сборки — плейлисты, собранные по старым правилам, пересоберутся */
const BUILD = 'v3'
const TZ_SHIFT = 3 * 3600_000

const today = () => new Date(Date.now() + TZ_SHIFT).toISOString().slice(0, 10)
export const isStationId = (id: string) => /^(genre|mood|activity|epoch):[\w-]+$/.test(id)

function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/** Все станции по группам (кэш 12 ч — список меняется редко) */
export function stationGroups(event: H3Event, userId: string): Promise<StationGroup[]> {
  return cached(`u:${userId}:stations:list:v2`, 12 * 3600_000, async () => {
    const res = await ymGet<{ result: any }>(event, '/rotor/stations/list', { language: 'ru' })
    const list: any[] = Array.isArray(res.result) ? res.result : []
    const byType = new Map<string, StationInfo[]>()
    const seen = new Set<string>()
    for (const item of list) {
      const st = item?.station ?? item
      const type = st?.id?.type
      const tag = st?.id?.tag
      if (typeof type !== 'string' || typeof tag !== 'string' || typeof st?.name !== 'string') continue
      const id = `${type}:${tag}`
      if (!isStationId(id) || seen.has(id)) continue
      seen.add(id)
      const arr = byType.get(type) ?? []
      arr.push({
        id,
        name: st.name,
        color: typeof st.icon?.backgroundColor === 'string' ? st.icon.backgroundColor : undefined,
        iconUrl: typeof st.icon?.imageUrl === 'string' ? coverUrl(st.icon.imageUrl, '100x100') : undefined,
      })
      byType.set(type, arr)
    }
    return TYPES.flatMap(t => (byType.get(t.type)?.length ? [{ type: t.type, title: t.title, stations: distinctLook(byType.get(t.type)!) }] : []))
  })
}

/** Запасные цвета плиток: насыщенные, хорошо читается белый текст */
const PALETTE = [
  '#e0435e', '#f0703a', '#e2a31b', '#7cb82f', '#2fa66a', '#14a3a0', '#1f8fd6', '#3f63e0', '#6b4ee6', '#9b45d9',
  '#c93ea8', '#d94a7b', '#b5562e', '#58708a', '#2e7d5b', '#8a6d1f', '#5b4bb7', '#c2412d',
]

/**
 * Поджанры у Яндекса часто наследуют значок и цвет родителя — в каталоге получались ряды одинаковых плиток.
 * Значок оставляем только у первой станции с ним (у остальных клиент рисует крупную букву), а повторный цвет
 * заменяем свободным цветом из палитры (выбор зависит от id — у станции всегда один и тот же).
 */
function distinctLook(list: StationInfo[]): StationInfo[] {
  const icons = new Set<string>()
  const colors = new Set<string>()
  const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0
  return list.map((st) => {
    const out = { ...st }
    if (out.iconUrl) {
      if (icons.has(out.iconUrl)) out.iconUrl = undefined
      else icons.add(out.iconUrl)
    }
    const c = out.color?.toLowerCase()
    if (!c || colors.has(c)) {
      const start = hash(out.id) % PALETTE.length
      const free = Array.from({ length: PALETTE.length }, (_, k) => PALETTE[(start + k) % PALETTE.length]!).find(x => !colors.has(x))
      out.color = free ?? PALETTE[start]
    }
    colors.add(out.color!.toLowerCase())
    return out
  })
}

/**
 * Станции «по вкусу»: жанры любимых исполнителей (brief-info Яндекса → станция genre:<код>) по весу
 * + рекомендованные Яндексом станции (`/rotor/stations/dashboard`). Ошибки — просто пустой список.
 */
export async function tasteStations(event: H3Event, userId: string, known: Set<string>): Promise<{ id: string, score: number }[]> {
  const scores = new Map<string, number>()
  const taste = await tasteOf(userId, 90).catch(() => null)
  const top = taste?.artists.slice(0, 10) ?? []
  await mapLimit(top, 4, async (a) => {
    const id = await resolveYandexArtist(event, a)
    if (!id) return
    const page = await cached(`u:${userId}:artist:${id}`, 30 * 60_000, () => yandexArtist(event, id)).catch(() => null)
    for (const g of page?.genres ?? []) {
      const sid = `genre:${g}`
      if (known.has(sid)) scores.set(sid, (scores.get(sid) ?? 0) + a.score)
    }
  })
  const dash = await ymGet<{ result: any }>(event, '/rotor/stations/dashboard').catch(() => null)
  const list: any[] = Array.isArray(dash?.result?.stations) ? dash.result.stations : []
  list.forEach((item, i) => {
    const st = item?.station ?? item
    const sid = `${st?.id?.type}:${st?.id?.tag}`
    // Рекомендации Яндекса — чуть слабее собственных жанров пользователя, выше в списке — весомее
    if (known.has(sid)) scores.set(sid, (scores.get(sid) ?? 0) + 3 / (i + 1))
  })
  return [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score)
}

/**
 * Каталог: «Жанры дня» + все группы.
 * «Жанры дня» — половина по вкусу (жанры любимых исполнителей, рекомендации Яндекса), остальное — случайно
 * по группам; одни и те же весь день (кэш до конца дня + зерно userId:день).
 */
export async function genreCatalog(event: H3Event, userId: string): Promise<GenreCatalog> {
  const groups = await stationGroups(event, userId)
  const day = today()
  const daily = await cached(`u:${userId}:genres:daily:${day}:v2`, 6 * 3600_000, async () => {
    const rnd = seeded(`${userId}:genres:${day}`)
    const all = new Map(groups.flatMap(g => g.stations.map(st => [st.id, st] as const)))
    const out: StationInfo[] = []
    const take = (id: string) => {
      const st = all.get(id)
      if (st && !out.includes(st)) out.push(st)
    }
    // По вкусу: из лучших 8 — 4 случайных (каждый день немного разные, но «свои»)
    const liked = await tasteStations(event, userId, new Set(all.keys())).catch(() => [])
    const best = liked.slice(0, 8)
    while (out.length < 4 && best.length) take(best.splice(Math.floor(rnd() * best.length), 1)[0]!.id)
    // Остальное — по квотам групп, как раньше: чтобы были и настроения, и эпохи, и занятия
    for (const t of TYPES) {
      const pool = (groups.find(g => g.type === t.type)?.stations ?? []).filter(st => !out.includes(st))
      const want = Math.max(0, t.daily - out.filter(st => st.id.startsWith(`${t.type}:`)).length)
      for (let k = 0; k < want && pool.length; k++) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!)
    }
    // Плитки рядом — разных цветов (станции из разных групп могли совпасть)
    return distinctLook(out.slice(0, 8))
  })
  return { daily, groups }
}

/** Жанр Spotify (`genre:"…"`) по тегу станции Яндекса: начало тега → жанр */
const SPOTIFY_GENRES: [RegExp, string][] = [
  [/^rusrock/, 'russian rock'],
  [/^ruspop/, 'russian pop'],
  [/^rusrap/, 'russian hip hop'],
  [/^(rap|foreignrap|hiphop)/, 'hip-hop'],
  [/^(pop|foreignpop|kpop|jpop)/, 'pop'],
  [/^(electronics|electronic|edm)/, 'electronic'],
  [/^(dance|house|deephouse)/, 'house'],
  [/^techno/, 'techno'],
  [/^trance/, 'trance'],
  [/^(dnb|drumandbass)/, 'drum and bass'],
  [/^dubstep/, 'dubstep'],
  [/^(indie|local-indie)/, 'indie'],
  [/^alternative/, 'alternative'],
  [/^(rock|hardrock|prog|postrock)/, 'rock'],
  [/^(metal|numetal|epicmetal|alternativemetal)/, 'metal'],
  [/^punk/, 'punk'],
  [/^(jazz)/, 'jazz'],
  [/^(classical|classicalmusic)/, 'classical'],
  [/^(rnb|rnbswing)/, 'r&b'],
  [/^soul/, 'soul'],
  [/^funk/, 'funk'],
  [/^blues/, 'blues'],
  [/^reggae/, 'reggae'],
  [/^country/, 'country'],
  [/^folk/, 'folk'],
  [/^latin/, 'latin'],
  [/^(soundtrack|films|tvseries|animated)/, 'soundtrack'],
  [/^(ambient|newage|relax|lounge)/, 'ambient'],
  [/^(shanson|estrada)/, 'russian pop'],
]
/** Десятилетия эпох: тег или две цифры в названии */
const EPOCHS: Record<string, number> = { fifties: 1950, sixties: 1960, seventies: 1970, eighties: 1980, nineties: 1990, zeroes: 2000, tens: 2010, twenties: 2020 }

/** Жанр Spotify для тега жанровой станции Яндекса ("rusrap" → "russian hip hop") */
export const spotifyGenreForTag = (tag: string) => SPOTIFY_GENRES.find(([re]) => re.test(tag))?.[1] ?? null

/** Что искать в Spotify для станции: жанры и эпохи — да; настроения и занятия — нет (по словам Spotify ищет названия) */
function spotifyQueriesFor(stationId: string): { queries: string[], years?: { from: number, to: number } } | null {
  const [type, tag = ''] = stationId.split(':')
  if (type === 'genre') {
    const g = spotifyGenreForTag(tag)
    return g ? { queries: [`genre:"${g}"`, g] } : null
  }
  if (type === 'epoch') {
    const from = EPOCHS[tag] ?? (/^(\d{4})/.test(tag) ? Number(tag.slice(0, 4)) : undefined)
    return from ? { queries: [`year:${from}-${from + 9}`], years: { from, to: from + 10 } } : null
  }
  return null
}

/** Плейлист станции на сегодня: из базы или собирается заново (fresh — пересобрать) */
export async function stationMix(event: H3Event, userId: string, stationId: string, fresh = false): Promise<Collection> {
  if (!isStationId(stationId)) throw createError({ statusCode: 404, message: 'Нет такой подборки' })
  const kind = `station:${stationId}` as const
  const period = `${today()}:${BUILD}`
  const db = useDb()
  const [row] = await db.select().from(schema.mixes).where(and(eq(schema.mixes.userId, userId), eq(schema.mixes.kind, kind))).limit(1)

  let list = row && row.period === period && !fresh ? row.tracks : null
  if (!list) {
    const liked = await getLikedTracks(userId)
    const exclude = new Set([...liked.map(t => t.uid), ...liked.map(songKey)])
    // Ошибка первой порции (Яндекс не подключён — 409) уходит наверх
    const raw = await stationFill(event, stationId, { target: TARGET, maxCalls: MAX_CALLS, concurrency: 3, exclude })
    // Не больше 3 песен одного исполнителя — подборка жанра, а не дискография
    const perArtist = new Map<string, number>()
    const found = raw.filter((t) => {
      const k = normalize(t.artists[0] ?? '')
      const n = perArtist.get(k) ?? 0
      perArtist.set(k, n + 1)
      return n < 3
    })
    // Spotify (если пользуется): поиск по жанру/эпохе станции — каждый третий трек
    const conn = await activeConnections(userId)
    const spQueries = conn.spotify ? spotifyQueriesFor(stationId) : null
    const fromSpotify = spQueries
      ? await spotifyDiscover(event, spQueries.queries, 20, new Set([...exclude, ...found.map(songKey)]), spQueries.years).catch(() => [] as Track[])
      : []
    const mixed = sprinkle(found, fromSpotify, 2)
    // Знакомое из любимых (Яндекс и Spotify) — тех же исполнителей, каждый пятый трек
    const rnd = seeded(`${userId}:${stationId}:${period}${fresh ? Date.now() : ''}`)
    const known = familiarFor(liked, mixed, new Set(), Math.ceil(mixed.length / 5), rnd)
    // Скрытые исполнители и «не моя музыка» (taste-filter.ts)
    list = await keepToTaste(userId, sprinkle(mixed, known, 4))
    if (list.length) {
      const values = { userId, kind, period, tracks: list, createdAt: Date.now() }
      await db.insert(schema.mixes).values(values).onConflictDoUpdate({
        target: [schema.mixes.userId, schema.mixes.kind],
        set: { period, tracks: list, createdAt: values.createdAt },
      })
    }
  }

  const station = (await stationGroups(event, userId).catch(() => [])).flatMap(g => g.stations).find(s => s.id === stationId)
  return {
    kind: 'playlist',
    id: `station:${stationId}`,
    title: station?.name ?? 'Подборка',
    subtitle: 'Новое для вас в этом жанре и немного любимого. Каждый день — своя подборка',
    tracks: list,
  }
}
