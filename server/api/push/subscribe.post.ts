/** Включить уведомления на этом устройстве: { subscription } — PushSubscription.toJSON() из браузера. */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  if (!pushEnabled()) throw createError({ statusCode: 501, message: 'Уведомления не настроены на сервере' })
  const { subscription: s } = await readBody<{ subscription?: any }>(event) ?? {}
  const ok = s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000
    && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string'
  if (!ok) throw createError({ statusCode: 400, message: 'Неверная подписка на уведомления' })
  await savePushSubscription(event, userId, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } })
  return { ok: true }
})
