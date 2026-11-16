/**
 * Удалить присланное: получатель убирает у себя из «Вам прислали»,
 * отправитель — отменяет отправку (у друга песня тоже пропадёт). Чужое — 404.
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, message: 'Неверный id' })
  const ok = await deleteShare(await requireUserId(event), id)
  if (!ok) throw createError({ statusCode: 404, message: 'Не найдено' })
  return { ok: true }
})
