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

export async function findTrackVersions(event: H3Event, track: Track): Promise<TrackVersion[]> {
  const base = baseTitle(track.title)
  if (!base) return []
  const artist = track.artists[0] ?? ''
  const queries = [...new Set([`${artist} ${base}`.trim(), base])]
  const results = await Promise.all(queries.map(q => yandexSearch(event, q).then(r => r.tracks).catch(() => [] as Track[])))

  const ownId = track.source === 'yandex' ? track.sourceId.split(':')[0] : null
  const originalArtists = new Set(track.artists.map(a => a.toLowerCase()))
  const seen = new Set<string>()
  const out: TrackVersion[] = []
  for (const t of results.flat()) {
    const id = t.sourceId.split(':')[0]!
    if (id === ownId || seen.has(id)) continue
    seen.add(id)
    if (baseTitle(t.title) !== base) continue
    const kind = classify(t, originalArtists, track)
    if (!kind) continue
    // Одинаковые записи с разных релизов (тот же исполнитель, название и длительность) — одна
    const dup = out.some(v => v.track.title === t.title && v.track.artists.join() === t.artists.join() && Math.abs(v.track.durationMs - t.durationMs) < 2000)
    if (!dup) out.push({ kind, track: t })
  }
  return out
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .slice(0, 24)
}
