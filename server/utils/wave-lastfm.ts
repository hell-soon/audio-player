import type { H3Event } from 'h3'

/**
 * «Моя волна» без Яндекса (#10): бесконечный поток из Last.fm Similar-источника (#5) по исполнителям Вкуса.
 * Яндекс-сессии радио нет, поэтому непрерывность — расширяющаяся выборка зёрен:
 *  - первая порция — топ-N исполнителей Вкуса;
 *  - продолжение — следующий срез (окно сдвигается по числу уже выданных uid в `exclude`);
 *  - зёрна кончились — окно идёт по кругу (те же исполнители, но треки из exclude отсеиваются, т.е. новые);
 *  - совсем нечего отдать — пустой список, вызывающий код деградирует на любимое.
 */

const SEEDS_PER_PORTION = 5
/** Сколько треков в среднем приходит за порцию — по нему из размера exclude выводим номер среза. */
const PORTION_SIZE = 20
const MAX_PER_ARTIST = 3

/** Срез зёрен для порции: `offset` растёт с продолжениями, по кругу. Чистая функция. */
export function waveSeedSlice<T>(seeds: T[], issued: number, size = SEEDS_PER_PORTION): T[] {
  if (!seeds.length) return []
  const n = Math.min(size, seeds.length)
  const start = (Math.floor(issued / PORTION_SIZE) * n) % seeds.length
  return Array.from({ length: n }, (_, i) => seeds[(start + i) % seeds.length]!)
}

export async function waveLastfmTracks(
  event: H3Event,
  userId: string,
  opts: { issued: number, exclude: Set<string>, target: number },
): Promise<Track[]> {
  const taste = await tasteOf(userId, 90).catch(() => null)
  if (!taste?.artists.length) return []

  // Топ Вкуса как пул зёрен (с запасом, чтобы поток не повторялся долго)
  const pool = taste.artists.slice(0, 40).map(a => a.name)
  const names = waveSeedSlice(pool, opts.issued)
  const found = await similarTracksForMany(event, names).catch(() => [] as Track[])
  const fresh = found.filter(t => !opts.exclude.has(t.uid) && !opts.exclude.has(songKey(t)))
  return capPerArtist(shuffleWith(fresh, Math.random), MAX_PER_ARTIST).slice(0, opts.target)
}
