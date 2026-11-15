export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const uid = decodeURIComponent(getRouterParam(event, 'uid')!)
  await unlikeTrack(userId, uid)
  const [source, ...rest] = uid.split(':')
  if (source === 'spotify' || source === 'yandex') {
    const stub: Track = { uid, source, sourceId: rest.join(':'), title: '', artists: [], durationMs: 0 }
    event.waitUntil(syncLikeToService(event, userId, stub, false))
  }
  // Копии лайка во втором сервисе (если были) — тоже снимаем
  event.waitUntil(unmirrorLike(event, userId, uid).catch(e => console.warn('[like-both]', uid, e?.message)))
  return { ok: true }
})
