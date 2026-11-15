/** Изменить профиль: { name, bio?, avatar? } (avatar: data URL — новое фото, null — убрать, нет — не трогать). Обновляет сессию */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const body = await readBody<{ name?: unknown, bio?: unknown, avatar?: unknown }>(event) ?? {}
  const name = String(body.name ?? '').trim().slice(0, 40)
  if (!name) throw createError({ statusCode: 400, message: 'Укажите имя' })
  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 160) || undefined : undefined
  const avatar = body.avatar === null ? null : typeof body.avatar === 'string' ? body.avatar : undefined
  const user = await updateProfile(userId, { name, bio, avatar })
  // Имя и аватар лежат в сессии (шапка, настройки) — обновляем её
  await startSession(event, user)
  invalidateUserCache(userId)
  return { name: user.name, bio: user.bio ?? undefined, avatarUrl: user.avatarUrl ?? undefined }
})
