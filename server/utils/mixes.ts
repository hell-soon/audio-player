import { and, desc, eq, gte } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Подборки, которые сайт собирает сам из данных пользователя (история + лайки):
 *  - «Микс дня» — любимые исполнители последних 30 дней: их радио Яндекса вперемешку
 *    с любимыми треками, которые давно не звучали. Новый каждый день.
 *  - «Открытия недели» — исполнители, похожие на любимых, которых пользователь ещё не слушал,
 *    их популярные треки. Новые каждую неделю.
 * Собранный микс хранится в таблице mixes — на всех устройствах один и тот же до конца периода.
 * Новые треки: с Яндексом — через его рекомендации; без Яндекса — через Last.fm Similar-источник (#5),
 * т.к. у Spotify в Development Mode рекомендаций нет.
 */

const DAY = 86_400_000
/** Границы дня и недели — по Москве (UTC+3): пользователи из России. */
const TZ_SHIFT = 3 * 3600_000

export const MIX_META: Record<MixKind, { title: string, description: string }> = {
  daily: { title: 'Микс дня', description: 'Любимые исполнители и похожая музыка. Обновляется каждый день' },
  discover: { title: 'Открытия недели', description: 'Исполнители, которых вы ещё не слушали. Обновляется по понедельникам' },
}

/** Версия сборки: при изменении правил подборки текущего периода пересоберутся (период хранится с ней) */
const BUILD = 'v3'

function periodOf(kind: MixKind, now = Date.now()) {
  return `${calendarPeriod(kind, now)}:${BUILD}`
}

function calendarPeriod(kind: MixKind, now: number) {
  const d = new Date(now + TZ_SHIFT)
  if (kind === 'daily') return d.toISOString().slice(0, 10)
  // ISO-неделя: четверг текущей недели определяет год
  const day = (d.getUTCDay() + 6) % 7
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3))
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// ---------- Детерминированная случайность: один и тот же микс при пересборке в тот же период ----------

function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

function shuffle<T>(list: T[], rnd: () => number) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function uniqueByUid(list: Track[]) {
  const seen = new Set<string>()
  return list.filter(t => !seen.has(t.uid) && seen.add(t.uid))
}

// ---------- Вкус пользователя ----------

export interface ArtistScore { name: string, score: number, yandexId?: string, spotifyId?: string }

export interface Taste {
  /** Исполнители по убыванию «любви» (прослушивания + лайки) */
  artists: ArtistScore[]
  /** Нормализованные имена всех исполнителей, которых пользователь слушал или лайкал */
  knownArtists: Set<string>
  /** Все треки, которые пользователь слушал или лайкал */
  knownUids: Set<string>
  /** Прослушанные за последние дни — их в «Миксе дня» не повторяем */
  recentUids: Set<string>
  /** Любимые треки: лайки, часто слушаемые, затем остальная история */
  favorites: Track[]
}

export async function tasteOf(userId: string, days: number): Promise<Taste> {
  const { history, tracks } = schema
  const now = Date.now()
  const [rows, liked] = await Promise.all([
    useDb()
      .select({ playedAt: history.playedAt, t: tracks })
      .from(history)
      .innerJoin(tracks, eq(history.trackUid, tracks.uid))
      .where(and(eq(history.userId, userId), gte(history.playedAt, now - 365 * DAY)))
      .orderBy(desc(history.playedAt))
      .limit(5000),
    getLikedTracks(userId),
  ])

  const artists = new Map<string, ArtistScore>()
  const knownArtists = new Set<string>()
  const knownUids = new Set<string>()
  const recentUids = new Set<string>()
  const plays = new Map<string, { track: Track, n: number }>()

  const addArtists = (t: Track, weight: number) => {
    t.artists.forEach((name, i) => {
      const key = normalize(name)
      if (!key) return
      knownArtists.add(key)
      if (!weight) return
      const a = artists.get(key) ?? { name, score: 0 }
      // Главный исполнитель трека весит больше, чем приглашённые
      a.score += i === 0 ? weight : weight / 3
      if (!a.yandexId && t.source === 'yandex' && t.artistIds?.[i]) a.yandexId = t.artistIds[i]
      if (!a.spotifyId && t.source === 'spotify' && t.artistIds?.[i]) a.spotifyId = t.artistIds[i]
      artists.set(key, a)
    })
  }

  for (const r of rows) {
    const t = rowToTrack(r.t)
    knownUids.add(t.uid)
    if (now - r.playedAt < 3 * DAY) recentUids.add(t.uid)
    addArtists(t, now - r.playedAt < days * DAY ? 1 : 0)
    const p = plays.get(t.uid) ?? { track: t, n: 0 }
    p.n++
    plays.set(t.uid, p)
  }
  for (const t of liked) {
    knownUids.add(t.uid)
    addArtists(t, 2)
  }

  // Сначала часто слушаемое; остальная история — в конце, чтобы у новых пользователей микс был не из 3 треков
  const byPlays = [...plays.values()].sort((a, b) => b.n - a.n)
  const frequent = byPlays.filter(p => p.n >= 3).map(p => p.track)
  const rest = byPlays.filter(p => p.n < 3).slice(0, 200).map(p => p.track)
  return {
    artists: [...artists.values()].sort((a, b) => b.score - a.score),
    knownArtists,
    knownUids,
    recentUids,
    favorites: uniqueByUid([...liked, ...frequent, ...rest]),
  }
}

/** id исполнителя в Яндексе: из трека Яндекса, иначе поиском по имени. */
export async function resolveYandexArtist(event: H3Event, a: ArtistScore) {
  if (a.yandexId) return a.yandexId
  return yandexFindArtistId(event, a.name).catch(() => null)
}

// ---------- Сборка ----------

async function buildDaily(event: H3Event, userId: string, seed: string): Promise<Track[]> {
  const rnd = seededRandom(seed)
  const taste = await tasteOf(userId, 30)
  const hasYandex = !!(await getAccount(userId, 'yandex'))

  // Знакомое: любимое (Яндекс и Spotify вперемешку), что не звучало последние 3 дня
  const limit = hasYandex ? 20 : 50
  let familiar = shuffle(taste.favorites.filter(t => !taste.recentUids.has(t.uid)), rnd)
  // Мало данных (новый пользователь) — добираем и недавно звучавшим, лишь бы микс не был пустым
  if (familiar.length < limit) familiar = [...familiar, ...shuffle(taste.favorites.filter(t => taste.recentUids.has(t.uid)), rnd)]
  familiar = interleaveSources(familiar).slice(0, limit)

  // Новое: уже известное пользователю не предлагаем
  const exclude = new Set<string>([...taste.recentUids, ...taste.favorites.map(t => t.uid), ...taste.favorites.map(songKey)])

  // Без Яндекса «новое» берём из Last.fm Similar-источника (#5) по любимым исполнителям —
  // Spotify в Development Mode рекомендаций не отдаёт. Нет исполнителей во вкусе — только знакомое.
  if (!hasYandex) {
    if (!taste.artists.length) return familiar
    const found = await similarTracksForTaste(event, taste)
    const fresh = found.filter(t => !exclude.has(t.uid) && !exclude.has(songKey(t)))
    return interleaveFamiliarFresh(familiar, capPerArtist(shuffle(uniqueByUid(fresh), rnd), 4))
  }

  // 1) радио по 8 любимым исполнителям (из топ-14 — немного случайности, чтобы каждый день был разный набор)
  const picked = shuffle(taste.artists.slice(0, 14), rnd).slice(0, 8)
  const byArtist = await mapLimit(picked, 3, async (a) => {
    const id = await resolveYandexArtist(event, a)
    if (!id) return []
    return stationFill(event, `artist:${id}`, { target: 6, maxCalls: 2, concurrency: 2, exclude }).catch(() => [] as Track[])
  })
  // 2) «похожее на» 4 любимых трека из Яндекса
  const seedTracks = shuffle(taste.favorites.filter(t => t.source === 'yandex'), rnd).slice(0, 4)
  const byTrack = await mapLimit(seedTracks, 2, async (t) => {
    const id = yandexTrackId(t)!
    return stationFill(event, `track:${id}`, { target: 4, maxCalls: 1, exclude, seeds: [id] }).catch(() => [] as Track[])
  })
  // Не больше 4 песен одного исполнителя: иначе микс превращается в дискографию
  const fresh = capPerArtist(shuffle(uniqueByUid([...byArtist.flat(), ...byTrack.flat()]), rnd), 4)
  return interleaveFamiliarFresh(familiar, fresh)
}

/** Кандидаты «похожего» из Last.fm Similar-источника (#5) по топ-20 любимым исполнителям вкуса. */
function similarTracksForTaste(event: H3Event, taste: Taste): Promise<Track[]> {
  const names = taste.artists.slice(0, 20).map(a => a.name)
  return similarTracksForMany(event, names).catch(() => [] as Track[])
}

/** Не больше `max` треков одного (главного) исполнителя: иначе микс превращается в дискографию. */
export function capPerArtist(list: Track[], max: number): Track[] {
  const perArtist = new Map<string, number>()
  return list.filter((t) => {
    const k = normalize(t.artists[0] ?? '')
    const n = perArtist.get(k) ?? 0
    perArtist.set(k, n + 1)
    return n < max
  })
}

/** Чередуем: два новых — один знакомый. */
function interleaveFamiliarFresh(familiar: Track[], fresh: Track[]): Track[] {
  const out: Track[] = []
  let f = 0
  let n = 0
  while (out.length < 60 && (f < familiar.length || n < fresh.length)) {
    if (n < fresh.length) out.push(fresh[n++]!)
    if (n < fresh.length) out.push(fresh[n++]!)
    if (f < familiar.length) out.push(familiar[f++]!)
  }
  return uniqueByUid(out)
}

/**
 * «Открытия недели» без Яндекса: похожие на любимых исполнителей треки через Last.fm Similar-источник (#5),
 * из которых исключены уже известные пользователю исполнители и треки.
 */
async function buildDiscoverLastfm(event: H3Event, taste: Taste, rnd: () => number): Promise<Track[]> {
  // Послушать нечего (новый пользователь, пустая история и лайки) — собирать подборку не из чего
  const noTaste = () => createError({ statusCode: 409, message: 'Послушайте или лайкните что-нибудь — и «Открытия недели» подберутся из похожего' })
  if (!taste.artists.length) throw noTaste()

  // Похожие на топ-20 любимых исполнителей; Last.fm уже отдаёт треки других исполнителей, резолвленные в Spotify
  const found = await similarTracksForTaste(event, taste)

  // Known-исполнителей и уже знакомые треки не предлагаем (как яндекс-ветка по taste.knownArtists/knownUids)
  const fresh = found.filter(t => !taste.knownUids.has(t.uid) && !t.artists.some(a => taste.knownArtists.has(normalize(a))))

  // Не больше 3 треков одного исполнителя — иначе подборка превращается в дискографию одного имени
  const out = capPerArtist(shuffle(uniqueByUid(fresh), rnd), 3)
  // Last.fm не нашёл похожего или ничего не резолвится в Spotify — лучше понятная ошибка, чем пустой экран
  if (!out.length) throw noTaste()
  return out.slice(0, 50)
}

async function buildDiscover(event: H3Event, userId: string, seed: string): Promise<Track[]> {
  const rnd = seededRandom(seed)
  const taste = await tasteOf(userId, 90)

  // Без Яндекса — Last.fm Similar-источник (#5) по любимым исполнителям вкуса
  if (!(await getAccount(userId, 'yandex'))) {
    return buildDiscoverLastfm(event, taste, rnd)
  }

  // Похожие на 12 любимых исполнителей, которых пользователь ещё не слушал
  const seeds = taste.artists.slice(0, 12)
  const similar = await mapLimit(seeds, 4, async (a) => {
    const id = await resolveYandexArtist(event, a)
    if (!id) return []
    return cached(`u:${userId}:artist:${id}`, 30 * 60_000, () => yandexArtist(event, id)).then(p => p.similar).catch(() => [] as ArtistInfo[])
  })

  // Чем больше любимых исполнителей «советуют» кандидата и чем выше он в их списках — тем выше он в выдаче
  const candidates = new Map<string, { a: ArtistInfo, score: number }>()
  similar.forEach(list => list.forEach((a, rank) => {
    const key = normalize(a.name)
    if (!key || taste.knownArtists.has(key)) return
    const c = candidates.get(key) ?? { a, score: 0 }
    c.score += 1 / (rank + 2)
    candidates.set(key, c)
  }))
  // Лучшие 16 + 8 случайных из остальных: каждую неделю не одни и те же «очевидные» имена
  const ranked = [...candidates.values()].sort((x, y) => y.score - x.score)
  const chosen = [...ranked.slice(0, 16), ...shuffle(ranked.slice(16, 60), rnd).slice(0, 8)]

  const perArtist = await mapLimit(chosen, 4, async ({ a }) => {
    const id = a.id.replace(/^yandex:/, '')
    const res = await ymGet<{ result: any }>(event, `/artists/${encodeURIComponent(id)}/tracks`, { 'page': 0, 'page-size': 10 }).catch(() => null)
    const list: Track[] = (res?.result?.tracks ?? []).filter((t: any) => t?.title && t.available !== false).map(toTrack)
    // Два-три трека из самых популярных — немного случайно, чтобы не всегда один и тот же хит
    const seenSongs = new Set<string>()
    const fresh = list.filter(t => !taste.knownUids.has(t.uid) && !seenSongs.has(songKey(t)) && seenSongs.add(songKey(t)))
    return shuffle(fresh.slice(0, 6), rnd).slice(0, 3)
  })
  let out = uniqueByUid(perArtist.flat())

  // Мало похожих (новый пользователь, мало истории) — добираем «Моей волной», только незнакомые исполнители
  if (out.length < 30) {
    const have = new Set([...out.map(t => t.uid), ...taste.knownUids])
    const wave = await stationFill(event, 'user:onyourwave', { target: 40, maxCalls: 8, concurrency: 3, exclude: have }).catch(() => [] as Track[])
    out = [...out, ...wave.filter(t => !t.artists.some(a => taste.knownArtists.has(normalize(a))))]
  }
  return shuffle(uniqueByUid(out), rnd).slice(0, 50)
}

/**
 * Микс текущего периода: из базы, а если его нет или период закончился — собирается заново.
 * fresh — пересобрать прямо сейчас (кнопка «Обновить»): берётся новое зерно случайности.
 */
export async function getMix(event: H3Event, userId: string, kind: MixKind, fresh = false): Promise<Collection> {
  const period = periodOf(kind)
  const db = useDb()
  const [row] = await db.select().from(schema.mixes).where(and(eq(schema.mixes.userId, userId), eq(schema.mixes.kind, kind))).limit(1)

  let list = row && row.period === period && !fresh ? row.tracks : null
  if (!list) {
    const seed = `${userId}:${kind}:${period}${fresh ? `:${Date.now()}` : ''}`
    list = kind === 'daily' ? await buildDaily(event, userId, seed) : await buildDiscover(event, userId, seed)
    // Скрытые исполнители и «не моя музыка» (taste-filter.ts)
    list = await keepToTaste(userId, list)
    // Пустой микс не сохраняем: как только появятся прослушивания, соберётся заново
    if (list.length) {
      const values = { userId, kind, period, tracks: list, createdAt: Date.now() }
      await db.insert(schema.mixes).values(values).onConflictDoUpdate({
        target: [schema.mixes.userId, schema.mixes.kind],
        set: { period, tracks: list, createdAt: values.createdAt },
      })
    }
  }

  return {
    kind: 'playlist',
    id: `mix:${kind}`,
    title: MIX_META[kind].title,
    subtitle: MIX_META[kind].description,
    tracks: list,
  }
}

/** Карточки миксов для главной — только из базы (без сборки), чтобы главная открывалась быстро. */
export async function mixCards(userId: string): Promise<MixInfo[]> {
  const rows = await useDb().select().from(schema.mixes).where(eq(schema.mixes.userId, userId))
  const coversOf = (list: Track[]) => [...new Set(list.map(t => t.coverUrl).filter(Boolean) as string[])].slice(0, 8)
  // Сегодняшний микс ещё не собран (соберётся при открытии) — обложки из прошлого или из любимых,
  // чтобы карточка не была пустой
  let fallback: string[] | null = null
  const fallbackCovers = async () => (fallback ??= coversOf((await getLikedTracks(userId)).slice(0, 40)))
  return Promise.all((['daily', 'discover'] as const).map(async (kind) => {
    const row = rows.find(r => r.kind === kind)
    const fresh = row && row.period === periodOf(kind)
    const tracks = fresh ? row.tracks : []
    const covers = row ? coversOf(row.tracks) : []
    return {
      kind,
      ...MIX_META[kind],
      covers: covers.length ? covers : await fallbackCovers(),
      count: tracks.length,
    }
  }))
}
