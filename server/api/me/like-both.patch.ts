import { eq } from 'drizzle-orm'

/** Включить/выключить «Лайкать в обоих сервисах»: { on: boolean } */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { on } = await readBody<{ on?: unknown }>(event) ?? {}
  await useDb().update(schema.users).set({ likeBoth: on === true }).where(eq(schema.users.id, userId))
  return { on: on === true }
})
