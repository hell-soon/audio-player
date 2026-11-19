import type { H3Event } from 'h3'

/**
 * «Миксы из двух сервисов» (BLEND_PRESETS в shared/utils/blends.ts): порция случайной музыки
 * сразу из Яндекса и Spotify — для бесконечного потока (/api/radio, station: 'blend').
 *  - Яндекс: станция эпохи/жанра из каталога (нет нужной — «Моя волна»), отбор по году выпуска;
 *  - Spotify: поиск `year:FROM-TO` (+ жанр) с нескольких случайных мест выдачи (limit 10 в Development Mode).
 * Источники идут через один; подключён один сервис — поток только из него.
 */

/** Не дальше этого места в выдаче Spotify: дальше — малоизвестное (выдача примерно по популярности) */
const SPOTIFY_DEPTH = 400

/** Станция Яндекса для микса: первый существующий тег, затем эпоха по названию, иначе «Моя волна» */
async function blendStation(event: H3Event, userId: string, b: BlendPreset) {
  const groups = await stationGroups(event, userId).catch(() => [] as StationGroup[])
  const all = groups.flatMap(g => g.stations)
  const byTag = b.yandex.find(id => all.some(s => s.id === id))
  if (byTag) return { id: byTag, exact: byTag.startsWith('epoch:') }
  if (b.epoch) {
    // «20-е», «2020-е», «2000-е», «00-е»… — но не «2000-е» для «20»
    const re = new RegExp(`(^|\\D)(19|20)?${b.epoch}-?(е|x|s)`, 'i')
    const st = groups.find(g => g.type === 'epoch')?.stations.find(s => re.test(s.name))
    if (st) return { id: st.id, exact: true }
  }
  return { id: 'user:onyourwave', exact: false }
}

async function yandexPart(event: H3Event, userId: string, b: BlendPreset, n: number, exclude: Set<string>, seedId?: string | null) {
  const st = await blendStation(event, userId, b)
  const inRange = (t: Track) => t.year !== undefined && t.year >= b.from && t.year <= b.to
  // Станция эпохи и так про своё десятилетие: год у трека может быть годом переиздания/сборника — не придираемся,
  // отсекаем только явно свежие перевыпуски вне эпохи. Жанр и волна — строго по году.
  const accept = st.exact ? (t: Track) => t.year === undefined || t.year <= b.to + 5 : inRange
  return stationFill(event, st.id, {
    target: n,
    maxCalls: st.exact ? 4 : 8,
    concurrency: 3,
    exclude,
    accept,
    // Продолжение — от последнего трека Яндекса в очереди (без него станция повторила бы первую порцию)
    seeds: [seedId],
  })
}

async function spotifyPart(event: H3Event, b: BlendPreset, n: number, exclude: Set<string>) {
  const queries = [
    b.spotifyGenre ? `year:${b.from}-${b.to} genre:"${b.spotifyGenre}"` : `year:${b.from}-${b.to}`,
  ]
  // Жанр в Spotify может не найтись — тогда только по годам
  if (b.spotifyGenre) queries.push(`year:${b.from}-${b.to} ${b.spotifyGenre}`)

  const out: Track[] = []
  const seen = new Set<string>()
  for (const q of queries) {
    // Несколько случайных мест выдачи параллельно: каждый раз — новый набор
    const offsets = [...new Set(Array.from({ length: Math.ceil(n / 6) + 1 }, () => Math.floor(Math.random() * (SPOTIFY_DEPTH / 10)) * 10))]
    const pages = await Promise.all(offsets.map(o => spotifySearch(event, q, o).then(r => r.tracks).catch(() => [] as Track[])))
    for (const t of pages.flat()) {
      const key = songKey(t)
      if (seen.has(key) || exclude.has(t.uid) || exclude.has(key)) continue
      // Сборники «лучшее за все годы» и т.п.: год релиза — вне десятилетия
      if (t.year !== undefined && (t.year < b.from || t.year > b.to + 1)) continue
      seen.add(key)
      out.push(t)
    }
    if (out.length >= n / 2) break
  }
  return shuffleWith(out, Math.random).slice(0, n)
}

/** Порция микса: ~n треков, Яндекс и Spotify через один */
export async function blendTracks(event: H3Event, userId: string, b: BlendPreset, o: { n: number, exclude: Set<string>, seedId?: string | null }) {
  const conn = await activeConnections(userId)
  if (!conn.yandex && !conn.spotify) {
    throw createError({ statusCode: 409, message: 'Подключите Яндекс Музыку или Spotify в настройках' })
  }
  const both = !!conn.yandex && !!conn.spotify
  const half = both ? Math.ceil(o.n / 2) : o.n
  const [ya, sp] = await Promise.all([
    conn.yandex ? yandexPart(event, userId, b, half, o.exclude, o.seedId).catch(() => [] as Track[]) : [],
    conn.spotify ? spotifyPart(event, b, half, o.exclude).catch(() => [] as Track[]) : [],
  ])
  // Одна и та же песня из двух сервисов — оставляем одну
  const keys = new Set(ya.map(songKey))
  const spUnique = sp.filter(t => !keys.has(songKey(t)))
  // Через один, но начинаем со случайного сервиса: поток не всегда «Яндекс первым»
  const [a, c] = Math.random() < 0.5 ? [ya, spUnique] : [spUnique, ya]
  const out: Track[] = []
  for (let i = 0; i < Math.max(a.length, c.length); i++) {
    if (a[i]) out.push(a[i]!)
    if (c[i]) out.push(c[i]!)
  }
  return out
}
