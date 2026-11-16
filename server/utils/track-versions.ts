import type { H3Event } from 'h3'

/**
 * «Другие версии» песни: ремиксы, концертные и акустические записи, каверы других исполнителей,
 * slowed / sped up, инструменталы, ремастеры. Источник — поиск Яндекса (у Spotify в Development Mode
 * поиск урезан до 10 результатов и ничего не говорит о версии).
 *
 * Ищем «исполнитель + название без пометок» (свои версии и ремиксы) и просто название (каверы),
 * оставляем только ту же песню (совпадает «чистое» название) и раскладываем по видам по пометкам
 * в названии. Та же самая запись с другого релиза (сборник, переиздание) — не версия, отбрасываем.
 */

/** Порядок видов в выдаче */
const KINDS: { kind: TrackVersionKind, re: RegExp }[] = [
  { kind: 'live', re: /\blive\b|концерт|unplugged|session|сессия/ },
  { kind: 'acoustic', re: /acoustic|акуст|piano|оркестр|orchestr|symphon|симфон|stripped/ },
  { kind: 'slowed', re: /slowed|reverb|замедл/ },
  { kind: 'sped', re: /sped\s*up|speed\s*up|nightcore|ускор/ },
  { kind: 'instrumental', re: /instrumental|инструмент|karaoke|караоке|минус/ },
  { kind: 'remix', re: /remix|rmx|ремикс|\bmix\b|\bedit\b|bootleg|rework|\bflip\b|\bvip\b/ },
  { kind: 'remaster', re: /remaster|ремастер|anniversary|deluxe|mono|stereo/ },
]
const ORDER: TrackVersionKind[] = ['original', 'remix', 'live', 'acoustic', 'cover', 'slowed', 'sped', 'instrumental', 'remaster', 'other']

/** «Песня (Remix) - Live at…» → «песня»: без скобок, хвоста после тире и feat. */
function baseTitle(s: string) {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[([{].*?[)\]}]/g, ' ')
    .replace(/\s[-–—]\s.*$/, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Пометка версии — всё, что в названии сверх «чистого» (скобки, хвост после тире) */
function versionTag(title: string) {
  return title.toLowerCase().replace(/ё/g, 'е')
}

function classify(t: Track, originalArtists: Set<string>, original: Track): TrackVersionKind | null {
  const tag = versionTag(t.title)
  const ownTag = versionTag(original.title)
  for (const { kind, re } of KINDS) {
    // У исходного трека та же пометка (оба — ремиксы) — не повод считать отличием
    if (re.test(tag) && !re.test(ownTag)) return kind
  }
  const sameArtist = t.artists.some(a => originalArtists.has(a.toLowerCase()))
  if (!sameArtist) return 'cover'
  // Играет ремикс / live / slowed…, а это та же песня без пометок — оригинал
  if (KINDS.some(({ re }) => re.test(ownTag)) && !KINDS.some(({ re }) => re.test(tag))) return 'original'
  // Тот же исполнитель, без пометок: другая запись — только если заметно другая длительность
  if (t.title.toLowerCase() === original.title.toLowerCase() && Math.abs(t.durationMs - original.durationMs) < 4000) return null
  return 'other'
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Исполнитель — один из авторов песни («Земфира» ↔ «Земфира Рамазанова») */
function isAuthor(artist: string, writers: string[]) {
  const a = norm(artist)
  if (a.length < 3) return false
  return writers.some((w) => {
    const n = norm(w)
    return n === a || (a.length >= 4 && n.includes(a)) || (n.length >= 4 && a.includes(n))
  })
}

function shareWriter(a: string[], b: string[]) {
  const set = new Set(a.map(norm))
  return b.some(w => set.has(norm(w)))
}

/** Слова текста песни (без повторов). Кэш — общий с карточкой (`lyrics:<uid>`): тексты не меняются */
async function lyricWords(event: H3Event, t: Track) {
  const l = await cached(`lyrics:${t.uid}`, 24 * 3600_000, () => findLyrics(event, t)).catch(() => null)
  const text = l?.synced ? l.synced.map(x => x.text).join(' ') : l?.plain ?? ''
  return new Set(norm(text).split(' ').filter(w => w.length >= 3))
}

/**
 * Тот же текст — та же песня. У кавера слова совпадают почти все, у одноимённых разных песен — единицы.
 * Доля общих слов от меньшего текста; слишком короткий текст (инструментал, обрывок) — не решаем.
 */
function sameLyrics(a: Set<string>, b: Set<string>): boolean | null {
  if (a.size < 15 || b.size < 15) return null
  let common = 0
  for (const w of a) if (b.has(w)) common++
  return common / Math.min(a.size, b.size) >= 0.6
}

/** Авторы трека Яндекса (кэш сутки: не меняются) */
function writersOf(event: H3Event, yandexId: string) {
  return cached(`writers:${yandexId}`, 24 * 3_600_000, () => yandexTrackWriters(event, yandexId)).catch(() => [] as string[])
}

/**
 * Отличить кавер от одноимённой песни помогают авторы (Яндекс отдаёт их вместе с текстом):
 *  - чужая запись — кавер, только если у неё и у этой песни есть общий автор; другие авторы — другая песня, не показываем;
 *  - исполнитель записи — сам автор, а играет не она → «Оригинал»;
 *  - поёт сам автор → «Вы слушаете оригинал».
 * Авторов не знаем (нет прав на текст) — сравниваем тексты песен: совпали — кавер, нет — другая песня.
 */
export async function findTrackVersions(event: H3Event, track: Track): Promise<TrackVersions> {
  const base = baseTitle(track.title)
  if (!base) return { versions: [] }
  const artist = track.artists[0] ?? ''

  // Авторы этой песни: у Spotify — через совпадение в Яндексе
  const ownId = track.source === 'yandex'
    ? track.sourceId.split(':')[0]!
    : (await findYandexMatch(event, { title: track.title, artists: track.artists, durationMs: track.durationMs }).catch(() => null))?.split(':')[0]
  const writers = ownId ? await writersOf(event, ownId) : []
  const authorSings = writers.length > 0 && track.artists.some(a => isAuthor(a, writers))

  // Поёт не автор — ищем и запись автора (оригинал)
  const queries = [...new Set([
    `${artist} ${base}`.trim(),
    base,
    ...(writers.length && !authorSings ? writers.slice(0, 2).map(w => `${w} ${base}`) : []),
  ])]
  const results = await Promise.all(queries.map(q => yandexSearch(event, q).then(r => r.tracks).catch(() => [] as Track[])))

  const originalArtists = new Set(track.artists.map(a => a.toLowerCase()))
  const seen = new Set<string>()
  const found: TrackVersion[] = []
  for (const t of results.flat()) {
    const id = t.sourceId.split(':')[0]!
    if (id === ownId || seen.has(id)) continue
    seen.add(id)
    if (baseTitle(t.title) !== base) continue
    const kind = classify(t, originalArtists, track)
    if (!kind) continue
    // Одинаковые записи с разных релизов (тот же исполнитель, название и длительность) — одна
    const dup = found.some(v => v.track.title === t.title && v.track.artists.join() === t.artists.join() && Math.abs(v.track.durationMs - t.durationMs) < 2000)
    if (!dup) found.push({ kind, track: t })
  }

  // Чужие записи без пометок: кавер, оригинал или просто одноимённая песня.
  // Решают авторы (если Яндекс знает их у обеих записей), иначе — совпадение текста песни.
  // Не удалось проверить — не показываем: одноимённых песен много, метка «кавер» на них вводила в заблуждение
  const strangers = found.filter(v => v.kind === 'cover').slice(0, 10)
  const verified = new Set<TrackVersion>()
  let ownWords: Promise<Set<string>> | null = null
  await Promise.all(strangers.map(async (v) => {
    if (!authorSings && writers.length && v.track.artists.some(a => isAuthor(a, writers))) {
      v.kind = 'original'
      verified.add(v)
      return
    }
    const theirs = writers.length ? await writersOf(event, v.track.sourceId.split(':')[0]!) : []
    if (writers.length && theirs.length) {
      if (shareWriter(theirs, writers)) verified.add(v)
      return
    }
    ownWords ??= lyricWords(event, track)
    const [mine, other] = await Promise.all([ownWords, lyricWords(event, v.track)])
    if (sameLyrics(mine, other)) verified.add(v)
  }))
  const versions = found
    // Свои версии (ремиксы, live, оригинал без пометок) — как есть; чужие — только проверенные
    .filter(v => verified.has(v) || (!strangers.includes(v) && v.kind !== 'cover'))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .slice(0, 24)

  const hasOriginal = versions.some(v => v.kind === 'original')
  return {
    versions,
    writers: writers.length ? writers : undefined,
    // «Вы слушаете оригинал» — только если поёт автор и это не ремикс/live (у них оригинал — запись без пометок)
    isOriginal: authorSings && !KINDS.some(({ re }) => re.test(versionTag(track.title))) && !hasOriginal ? true : undefined,
  }
}
