export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const track = await readTrackBody(event)
  await likeTrack(userId, track)
  // Лайк дублируется в сервис трека (Spotify / Яндекс) — без ожидания результата.
  event.waitUntil(syncLikeToService(event, userId, track, true))
  // «Лайкать в обоих сервисах» — ищем трек во втором сервисе и лайкаем и там
  event.waitUntil((async () => {
    if (await likeBothEnabled(userId)) await mirrorLike(event, userId, track)
  })().catch(e => console.warn('[like-both]', track.uid, e?.message)))
  return { ok: true }
})
