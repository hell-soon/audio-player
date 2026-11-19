/** Песня по ссылке /t/… — без входа (маршрут в списке публичных в middleware/auth.ts). Неверная подпись — 404. */
export default defineEventHandler((event) => {
  const token = getQuery(event).t
  const res = typeof token === 'string' ? readShareToken(token) : null
  if (!res) throw createError({ statusCode: 404, message: 'Ссылка недействительна' })
  setHeader(event, 'cache-control', 'public, max-age=86400')
  return res
})
