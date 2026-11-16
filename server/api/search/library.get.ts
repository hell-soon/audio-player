import { and, desc, eq, ilike, max, notInArray, or, sql } from 'drizzle-orm'

/**
 * Поиск по своей медиатеке — для умного поиска (⌘K): любимые, треки в своих плейлистах
 * и недавно слушанные (без повторов). Совпадение — по названию, исполнителям и альбому.
 */
export default defineEventHandler(async (event): Promise<LibrarySearchResult> => {
  const userId = await requireUserId(event)
  const q = String(getQuery(event).q ?? '').trim().slice(0, 100)
  if (q.length < 2) return { liked: [], inPlaylists: [], history: [] }

  const { tracks, likes, playlists, playlistTracks, history } = schema
  // Экранируем % и _ — иначе «100%» искал бы что угодно
  const like = `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`
  const match = or(ilike(tracks.title, like), ilike(tracks.album, like), sql`${tracks.artists}::text ilike ${like}`)!
  const db = useDb()

  const [liked, inPlaylists, played] = await Promise.all([
    db.select({ t: tracks })
      .from(likes)
      .innerJoin(tracks, eq(likes.trackUid, tracks.uid))
      .where(and(eq(likes.userId, userId), match))
      .orderBy(desc(likes.likedAt))
      .limit(8),
    db.select({ t: tracks, playlistId: playlists.id, playlistName: playlists.name })
      .from(playlistTracks)
      .innerJoin(playlists, eq(playlistTracks.playlistId, playlists.id))
      .innerJoin(tracks, eq(playlistTracks.trackUid, tracks.uid))
      .where(and(eq(playlists.userId, userId), match))
      .orderBy(desc(playlistTracks.addedAt))
      .limit(12),
    db.select({ t: tracks, last: max(history.playedAt) })
      .from(history)
      .innerJoin(tracks, eq(history.trackUid, tracks.uid))
      .where(and(
        eq(history.userId, userId),
        match,
        // Любимые и так показаны выше
        notInArray(history.trackUid, db.select({ uid: likes.trackUid }).from(likes).where(eq(likes.userId, userId))),
      ))
      .groupBy(tracks.uid)
      .orderBy(desc(max(history.playedAt)))
      .limit(6),
  ])

  // Один трек в нескольких плейлистах — показываем один раз
  const seen = new Set<string>()
  return {
    liked: liked.map(r => rowToTrack(r.t)),
    inPlaylists: inPlaylists
      .filter(r => !seen.has(r.t.uid) && seen.add(r.t.uid))
      .slice(0, 6)
      .map(r => ({ track: rowToTrack(r.t), playlistId: r.playlistId, playlistName: r.playlistName })),
    history: played.map(r => rowToTrack(r.t)),
  }
})
