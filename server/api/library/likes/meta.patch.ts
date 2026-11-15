/** Изменить «Любимые треки»: { description?, cover? } (cover — как у плейлиста: null / { url } / { upload }) */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ description?: unknown, cover?: unknown }>(event) ?? {}
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 300) || undefined : undefined
  const c = body.cover as { url?: unknown, upload?: unknown } | null | undefined
  const cover = c === null ? null : c && typeof c.upload === 'string' ? { upload: c.upload } : c && typeof c.url === 'string' ? { url: c.url } : undefined
  return updateLikedMeta(await requireUserId(event), { description, cover })
})
