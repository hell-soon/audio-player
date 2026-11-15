/**
 * Изменить плейлист: { name, description?, cover? }.
 * cover: не передан — не трогать; null — коллаж из треков; { url } — обложка трека; { upload: dataURL } — своё фото.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string, description?: string, cover?: unknown }>(event) ?? {}
  const name = String(body.name ?? '').trim().slice(0, 100)
  if (!name) throw createError({ statusCode: 400, message: 'Укажите название' })
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 300) || undefined : undefined
  const c = body.cover as { url?: unknown, upload?: unknown } | null | undefined
  const cover = c === null
    ? null
    : c && typeof c.upload === 'string'
      ? { upload: c.upload }
      : c && typeof c.url === 'string'
        ? { url: c.url }
        : undefined
  return updatePlaylist(await requireUserId(event), getRouterParam(event, 'id')!, { name, description, cover })
})
