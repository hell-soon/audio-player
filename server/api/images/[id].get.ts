import { eq } from 'drizzle-orm'

/** Загруженная картинка (аватар, обложка плейлиста). Для вошедших; id меняется при каждой загрузке — кэш вечный */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[0-9a-f-]{36}$/.test(id)) throw createError({ statusCode: 404, message: 'Нет картинки' })
  const img = await useDb().query.images.findFirst({ where: eq(schema.images.id, id) })
  if (!img) throw createError({ statusCode: 404, message: 'Нет картинки' })
  setHeaders(event, { 'content-type': img.mime, 'cache-control': 'private, max-age=31536000, immutable' })
  return Buffer.from(img.data, 'base64')
})
