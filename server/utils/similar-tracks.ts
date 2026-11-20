import type { H3Event } from 'h3'

/**
 * Similar-источник на базе Last.fm: по исполнителю (или нескольким) отдаёт воспроизводимые треки
 * других, похожих исполнителей — для подбора музыки без Яндекса (см. #4).
 *  - artist.getSimilar → похожие исполнители → artist.getTopTracks каждого → резолв в Spotify Search
 *    (у Last.fm треков не послушать, нужен playable-источник).
 *  - Результат кэшируется по исполнителю (как яндекс-запросы в taste-filter.ts/mixes.ts), TTL несколько часов.
 *  - Исполнитель без похожих или без находок в Spotify — пустой список, не ошибка.
 */

const TTL = 6 * 3600_000
const SIMILAR_ARTISTS = 8
const TOP_TRACKS_PER_ARTIST = 5

function similarTracksKey(artist: string) {
  return `lastfm:similar-tracks:${normalize(artist)}`
}

async function resolveInSpotify(event: H3Event, artist: string, title: string): Promise<Track | null> {
  const wantTitle = normalize(title)
  const wantArtist = normalize(artist)
  const q = `track:${wantTitle} artist:${wantArtist}`
  const { tracks } = await spotifySearch(event, q).catch(() => ({ tracks: [] as Track[] }))
  const sameArtist = (x: Track) => x.artists.some(a => normalize(a) === wantArtist)
  return tracks.find(x => normalize(x.title) === wantTitle && sameArtist(x)) ?? tracks.find(sameArtist) ?? null
}

/** Похожие (другие) исполнители → их топ-треки у Last.fm → резолв в Spotify. Кэш по исполнителю. */
export function similarTracksFor(event: H3Event, artist: string): Promise<Track[]> {
  return cached(similarTracksKey(artist), TTL, async () => {
    const similar = await lastfmSimilarArtists(event, artist, SIMILAR_ARTISTS).catch(() => [] as string[])
    if (!similar.length) return []

    const topTracks = await Promise.all(
      similar.map(name => lastfmTopTracks(event, name, TOP_TRACKS_PER_ARTIST).catch(() => [])),
    )

    const resolved = await Promise.all(
      topTracks.flat().map(t => resolveInSpotify(event, t.artist, t.title)),
    )

    const seen = new Set<string>()
    return resolved.filter((t): t is Track => Boolean(t) && !seen.has(t!.uid) && Boolean(seen.add(t!.uid)))
  })
}

/** То же для нескольких исполнителей сразу (например, топ-артистов пользователя) — без дублей. */
export async function similarTracksForMany(event: H3Event, artists: string[]): Promise<Track[]> {
  const lists = await Promise.all(artists.map(a => similarTracksFor(event, a).catch(() => [] as Track[])))
  const seen = new Set<string>()
  return lists.flat().filter(t => !seen.has(t.uid) && seen.add(t.uid))
}
