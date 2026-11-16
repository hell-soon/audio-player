import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * «Сведения о треке» / вкладка «О треке»: подробности из сервиса (дата выхода, жанр, альбом, авторы),
 * качество потока, где ещё есть этот трек, ваша статистика и коротко об исполнителе.
 * Всё мягко: нет данных — нет строки.
 */
export default defineEventHandler(async (event): Promise<TrackDetails> => {
  const userId = await requireUserId(event)
  const track = await readTrackBody(event)
  const conn = await activeConnections(userId)
  const { history, likes } = schema
  const db = useDb()

  const [plays, first, liked, yandexInfo, quality, other, artist] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(history).where(and(eq(history.userId, userId), eq(history.trackUid, track.uid))).then(r => r[0]?.n ?? 0),
    db.select({ at: history.playedAt }).from(history).where(and(eq(history.userId, userId), eq(history.trackUid, track.uid))).orderBy(asc(history.playedAt)).limit(1).then(r => r[0]?.at),
    db.select({ at: likes.likedAt }).from(likes).where(and(eq(likes.userId, userId), eq(likes.trackUid, track.uid))).orderBy(desc(likes.likedAt)).limit(1).then(r => r[0]?.at),
    // Подробности из Яндекса — общие для всех, кэш на полчаса
    track.source === 'yandex' && conn.yandex
      ? cached(`trackinfo:${track.sourceId}`, 30 * 60_000, () => yandexTrackFacts(event, track.sourceId)).catch(() => undefined)
      : Promise.resolve(undefined),
    // Качество потока
    track.source === 'yandex' && conn.yandex
      ? cached(`u:${userId}:stream:${track.sourceId}:hq`, 90_000, () => yandexStreamUrl(event, track.sourceId, 'hq'))
          .then(s => `${s.codec.toUpperCase()} · ${s.bitrate} кбит/с`).catch(() => undefined)
      : Promise.resolve(undefined),
    // Где ещё есть: в другом подключённом сервисе
    (async () => {
      if (track.source === 'yandex' && conn.spotify) return (await findSpotifyMatch(event, track).catch(() => null)) ? 'spotify' as const : undefined
      if (track.source === 'spotify' && conn.yandex) return (await findYandexMatch(event, { title: track.title, artists: track.artists, durationMs: track.durationMs }).catch(() => null)) ? 'yandex' as const : undefined
      return undefined
    })(),
    conn.yandex ? artistAbout(event, userId, track).catch(() => undefined) : Promise.resolve(undefined),
  ])

  return {
    ...yandexInfo,
    quality,
    plays,
    firstPlayedAt: first,
    likedAt: liked,
    alsoIn: other,
    artist,
  }
})

/** Год, дата выхода, жанр, лейбл, тип релиза, место в альбоме и авторы — из Яндекса */
async function yandexTrackFacts(event: H3Event, sourceId: string) {
  const id = sourceId.split(':')[0]!
  const [res, writers] = await Promise.all([
    ymGet<{ result?: any[] }>(event, `/tracks/${id}`).catch(() => null),
    yandexTrackWriters(event, id),
  ])
  const t = res?.result?.[0]
  const al = t?.albums?.[0]
  const pos = al?.trackPosition
  const date = typeof al?.releaseDate === 'string' && !Number.isNaN(Date.parse(al.releaseDate)) ? al.releaseDate : undefined
  return {
    year: typeof al?.year === 'number' ? al.year : undefined,
    releaseDate: date,
    genre: typeof al?.genre === 'string' ? al.genre : undefined,
    label: (al?.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l?.name)).filter(Boolean)[0] as string | undefined,
    albumType: typeof al?.type === 'string' ? al.type : undefined,
    position: typeof pos?.index === 'number'
      ? { index: pos.index, total: typeof al?.trackCount === 'number' ? al.trackCount : undefined, volume: typeof pos.volume === 'number' ? pos.volume : undefined }
      : undefined,
    writers: writers.length ? writers : undefined,
  }
}

/** Коротко о первом исполнителе — из того же кэша, что и страница исполнителя */
async function artistAbout(event: H3Event, userId: string, track: Track): Promise<TrackArtistAbout | undefined> {
  const name = track.artists[0]
  if (!name) return undefined
  const ownId = track.source === 'yandex' ? track.artistIds?.[0] : undefined
  const yid = ownId && /^\d+$/.test(ownId)
    ? ownId
    : await cached(`artistid:${name.toLowerCase()}`, 24 * 3_600_000, () => yandexFindArtistId(event, name))
  if (!yid) return undefined
  const page = await cached(`u:${userId}:artist:${yid}`, 30 * 60_000, () => yandexArtist(event, yid))
  return {
    id: `yandex:${yid}`,
    name: page.artist.name || name,
    imageUrl: page.artist.imageUrl,
    bio: page.bio,
    genres: page.genres,
    listeners: page.listeners,
    likes: page.likes,
  }
}
