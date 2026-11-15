import { eq } from 'drizzle-orm'

/** Настройка «Лайкать в обоих сервисах» */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const u = await useDb().query.users.findFirst({ where: eq(schema.users.id, userId), columns: { likeBoth: true } })
  return { on: !!u?.likeBoth }
})
