/** Выключить уведомления на этом устройстве: { endpoint }. */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { endpoint } = await readBody<{ endpoint?: string }>(event) ?? {}
  if (typeof endpoint === 'string' && endpoint) await deletePushSubscription(userId, endpoint)
  return { ok: true }
})
