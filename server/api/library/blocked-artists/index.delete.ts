/** Вернуть исполнителя в подбор: ?name= */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const name = getQuery(event).name
  if (typeof name !== 'string' || !name.trim()) throw createError({ statusCode: 400, message: 'Не указан исполнитель' })
  await unblockArtist(userId, name)
  return { ok: true }
})
