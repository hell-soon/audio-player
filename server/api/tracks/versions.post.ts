/**
 * «Другие версии» песни (ремиксы, live, акустика, каверы, slowed / sped up…) — поиск Яндекса.
 * Яндекс не подключён — пустой список: блок необязательный, вкладка «О треке» просто его не покажет.
 */
export default defineEventHandler(async (event): Promise<TrackVersions> => {
  const userId = await requireUserId(event)
  const track = await readTrackBody(event)
  const conn = await activeConnections(userId)
  if (!conn.yandex) return { versions: [] }
  // Выдача общая для всех — кэш по треку, не по пользователю
  return cached(`versions2:${track.uid}`, 6 * 3_600_000, () => findTrackVersions(event, track))
})
