/** «Не предлагать исполнителя»: { name } — больше не попадёт в радио и подборки */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { name } = await readBody<{ name?: unknown }>(event)
  if (typeof name !== 'string' || !name.trim()) throw createError({ statusCode: 400, message: 'Не указан исполнитель' })
  await blockArtist(userId, name)
  return { ok: true }
})
