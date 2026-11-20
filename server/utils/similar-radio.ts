import type { H3Event } from 'h3'

/**
 * «Похожее на трек» без Яндекса (#9): Last.fm Similar-источник (#5) от исполнителя seed-трека.
 * Имена исполнителей берём прямо из seed.artists — они одинаковы для треков Spotify и Яндекса,
 * отдельный резолв id не нужен (Last.fm ищет по имени). Основной исполнитель — первый,
 * остальные (фиты) — запасные зёрна, если основной выдохся.
 */

const MAX_PER_ARTIST = 3

export async function similarRadioTracks(
  event: H3Event,
  seed: Track,
  opts: { exclude: Set<string>, target: number },
): Promise<Track[]> {
  const fresh = (list: Track[]) => list.filter(t => !opts.exclude.has(t.uid) && !opts.exclude.has(songKey(t)))
  const names = seed.artists.filter(Boolean)
  const out: Track[] = []
  const seen = new Set<string>()
  // Сначала основной исполнитель, затем остальные — пока не наберём порцию
  for (const name of names) {
    const found = fresh(await similarTracksFor(event, name).catch(() => [] as Track[]))
    for (const t of found) if (!seen.has(t.uid)) { seen.add(t.uid); out.push(t) }
    if (out.length >= opts.target) break
  }
  return capPerArtist(shuffleWith(out, Math.random), MAX_PER_ARTIST).slice(0, opts.target)
}
