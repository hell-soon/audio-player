import { and, desc, eq, gte } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Фильтр «не моя музыка» для подбора (радио, миксы по годам, жанры, «Микс дня», «Открытия»): случайный поиск
 * Spotify по годам и станции Яндекса приносили, например, индийскую эстраду — тем, кто её никогда не слушал.
 *  - Письменность: латиница и кириллица — всегда; другие (деванагари, арабская, тайская, CJK…) — только если
 *    встречаются в библиотеке пользователя (лайки и история) хотя бы дважды.
 *  - Транслитерация (хинди латиницей не отличить по буквам): известные индийские лейблы и исполнители —
 *    отсекаются, если ни одного такого нет в библиотеке.
 *  - «Не предлагать исполнителя» (таблица blocked_artists) — всегда.
 * Правила по библиотеке считаются раз в 6 ч (кэш пользователя), список исполнителей — 10 мин (сброс при изменении).
 */

const SCRIPTS = [
  'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhala',
  'Arabic', 'Hebrew', 'Thai', 'Lao', 'Khmer', 'Myanmar', 'Han', 'Hiragana', 'Katakana', 'Hangul', 'Greek',
  'Armenian', 'Georgian', 'Ethiopic', 'Tibetan',
] as const
const SCRIPT_RE = SCRIPTS.map(name => [name, new RegExp(`\\p{Script=${name}}`, 'u')] as const)

/** Индийская эстрада латиницей: лейблы и самые частые исполнители (по артистам трека) */
const INDIAN = /\b(t-series|super cassettes|saregama|zee music|tips (music|industries)|sony music india|venus records|speed records|shemaroo|eros (music|now)|yrf|desi music|white hill|lata mangeshkar|kumar sanu|arijit singh|alka yagnik|udit narayan|kishore kumar|asha bhosle|sonu nigam|shreya ghoshal|mohammed rafi|anuradha paudwal|a\.? ?r\.? rahman|neha kakkar|atif aslam|pritam|sidhu moose ?wala|diljit dosanjh|badshah|jubin nautiyal|vishal[- ]shekhar|shankar[- ]ehsaan|himesh reshammiya|mika singh|yo yo honey singh|guru randhawa|b praak|darshan raval)\b/i

const textOf = (t: Track) => `${t.title} ${t.artists.join(' ')} ${t.album ?? ''}`
const scriptsOf = (s: string) => SCRIPT_RE.filter(([, re]) => re.test(s)).map(([name]) => name)
const isIndian = (t: Track) => INDIAN.test(t.artists.join(', ')) || INDIAN.test(t.album ?? '')

interface TasteRules { scripts: Set<string>, indian: boolean }

function rulesFor(userId: string): Promise<TasteRules> {
  return cached(`u:${userId}:taste-rules`, 6 * 3600_000, async () => {
    const taste = await tasteOf(userId, 365).catch(() => null)
    const counts = new Map<string, number>()
    let indian = false
    for (const t of taste?.favorites ?? []) {
      for (const sc of scriptsOf(textOf(t))) counts.set(sc, (counts.get(sc) ?? 0) + 1)
      if (!indian && isIndian(t)) indian = true
    }
    return { scripts: new Set([...counts].filter(([, n]) => n >= 2).map(([sc]) => sc)), indian }
  })
}

// ---------- Скрытые исполнители ----------

const blockedKey = (userId: string) => `u:${userId}:blocked-artists`

export function listBlockedArtists(userId: string): Promise<{ key: string, name: string, createdAt: number }[]> {
  return cached(blockedKey(userId), 10 * 60_000, () => useDb()
    .select({ key: schema.blockedArtists.key, name: schema.blockedArtists.name, createdAt: schema.blockedArtists.createdAt })
    .from(schema.blockedArtists)
    .where(eq(schema.blockedArtists.userId, userId))
    .orderBy(desc(schema.blockedArtists.createdAt))
    // Схема ещё не применена (db:push) — просто без списка, подбор работает
    .catch(() => []))
}

export async function blockArtist(userId: string, name: string) {
  const key = normalize(name)
  if (!key) throw createError({ statusCode: 400, message: 'Пустое имя исполнителя' })
  await useDb().insert(schema.blockedArtists).values({ userId, key, name: name.trim().slice(0, 200), createdAt: Date.now() }).onConflictDoNothing()
  forgetCached(blockedKey(userId))
  return key
}

export async function unblockArtist(userId: string, name: string) {
  await useDb().delete(schema.blockedArtists).where(and(eq(schema.blockedArtists.userId, userId), eq(schema.blockedArtists.key, normalize(name))))
  forgetCached(blockedKey(userId))
}

// ---------- «Чтобы не надоедало»: история + пропуски ----------

const DAY = 86_400_000
const fatigueKey = (userId: string) => `u:${userId}:fatigue`

interface Fatigue {
  /** Треки, которые надоели: ≥ 3 прослушиваний за неделю или ≥ 2 пропусков за месяц */
  tracks: Set<string>
  /** Исполнители, которых в основном пропускают (≥ 4 пропусков за месяц и пропусков больше, чем прослушиваний) */
  artists: Set<string>
}

function fatigueOf(userId: string): Promise<Fatigue> {
  return cached(fatigueKey(userId), 10 * 60_000, async () => {
    const now = Date.now()
    const [hist, sk] = await Promise.all([
      useDb().select({ uid: schema.history.trackUid, at: schema.history.playedAt, artists: schema.tracks.artists })
        .from(schema.history)
        .innerJoin(schema.tracks, eq(schema.history.trackUid, schema.tracks.uid))
        .where(and(eq(schema.history.userId, userId), gte(schema.history.playedAt, now - 30 * DAY)))
        .limit(5000)
        .catch(() => []),
      useDb().select({ uid: schema.skips.trackUid, artist: schema.skips.artistKey })
        .from(schema.skips)
        .where(and(eq(schema.skips.userId, userId), gte(schema.skips.at, now - 30 * DAY)))
        .limit(5000)
        // Схема ещё не применена (db:push) — без пропусков
        .catch(() => []),
    ])
    const weekPlays = new Map<string, number>()
    const artistPlays = new Map<string, number>()
    for (const h of hist) {
      if (now - h.at < 7 * DAY) weekPlays.set(h.uid, (weekPlays.get(h.uid) ?? 0) + 1)
      const a = normalize(h.artists[0] ?? '')
      if (a) artistPlays.set(a, (artistPlays.get(a) ?? 0) + 1)
    }
    const trackSkips = new Map<string, number>()
    const artistSkips = new Map<string, number>()
    for (const s of sk) {
      trackSkips.set(s.uid, (trackSkips.get(s.uid) ?? 0) + 1)
      artistSkips.set(s.artist, (artistSkips.get(s.artist) ?? 0) + 1)
    }
    const tracks = new Set<string>()
    for (const [uid, n] of weekPlays) if (n >= 3) tracks.add(uid)
    for (const [uid, n] of trackSkips) if (n >= 2) tracks.add(uid)
    const artists = new Set<string>()
    // В истории пропуск тоже записан как прослушивание (трек успел заиграть) — сравниваем «дослушанные»
    for (const [a, n] of artistSkips) if (n >= 4 && n > (artistPlays.get(a) ?? 0) - n) artists.add(a)
    return { tracks, artists }
  })
}

/** Пропуск или дослушанный трек (от плеера): пропуски копятся для «не надоедать» */
export async function recordSkip(userId: string, t: Track, playedMs: number) {
  await useDb().insert(schema.skips).values({
    userId,
    trackUid: t.uid,
    artistKey: normalize(t.artists[0] ?? ''),
    playedMs: Math.max(0, Math.min(Math.round(playedMs), 3_600_000)),
    at: Date.now(),
  })
  forgetCached(fatigueKey(userId))
}

/**
 * Подходит ли трек для подбора: не скрытый исполнитель, своя письменность, без «индийских» меток,
 * не надоел (часто играл / пропускали) и исполнитель не из тех, кого обычно пропускают.
 */
export async function tasteGuard(userId: string): Promise<(t: Track) => boolean> {
  const [rules, blocked, fatigue] = await Promise.all([
    rulesFor(userId).catch(() => ({ scripts: new Set<string>(), indian: true })),
    listBlockedArtists(userId),
    fatigueOf(userId).catch(() => ({ tracks: new Set<string>(), artists: new Set<string>() })),
  ])
  const hidden = new Set([...blocked.map(b => b.key), ...fatigue.artists])
  return (t) => {
    if (fatigue.tracks.has(t.uid)) return false
    if (hidden.size && t.artists.some(a => hidden.has(normalize(a)))) return false
    if (!rules.indian && isIndian(t)) return false
    return scriptsOf(textOf(t)).every(sc => rules.scripts.has(sc))
  }
}

/** Оставить только подходящее под вкус */
export async function keepToTaste(userId: string, list: Track[]) {
  const ok = await tasteGuard(userId)
  return list.filter(ok)
}

/**
 * Без Яндекса жанры берём у самого Spotify: `genres` из `GET /artists/{id}` для топ-12 исполнителей Вкуса со `spotifyId`.
 * Самые частые — первыми (до 4). Нет spotifyId / жанров / запрос упал — исполнитель пропускается.
 */
async function spotifyArtistGenres(event: H3Event, userId: string): Promise<string[]> {
  const taste = await tasteOf(userId, 90).catch(() => null)
  const ids = (taste?.artists ?? []).filter(a => a.spotifyId).slice(0, 12).map(a => a.spotifyId!)
  const lists = await Promise.all(ids.map(id =>
    spotifyFetch<{ genres?: string[] }>(event, `/artists/${encodeURIComponent(id)}`).then(r => r.genres ?? []).catch(() => [] as string[])))
  const counts = new Map<string, number>()
  for (const g of lists.flat()) counts.set(g, (counts.get(g) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g)
}

/**
 * Жанры Spotify «по вкусу» (для миксов по годам без своего жанра): жанры любимых исполнителей из Яндекса
 * → `genre:"…"` Spotify. Нет Яндекса или данных — пусто (тогда поиск только по годам, с фильтром выше).
 */
export function tasteSpotifyGenres(event: H3Event, userId: string): Promise<string[]> {
  return cached(`u:${userId}:taste-sp-genres`, 12 * 3600_000, async () => {
    const conn = await activeConnections(userId)
    if (!conn.yandex) return spotifyArtistGenres(event, userId)
    const all = await stationGroups(event, userId).catch(() => [] as StationGroup[])
    const known = new Set(all.flatMap(g => g.stations.map(s => s.id)))
    const scored = await tasteStations(event, userId, known).catch(() => [])
    const out: string[] = []
    for (const { id } of scored) {
      if (!id.startsWith('genre:')) continue
      const g = spotifyGenreForTag(id.slice(6))
      if (g && !out.includes(g)) out.push(g)
      if (out.length >= 4) break
    }
    return out
  })
}
