/** Ссылка на песню в Audio для «Поделиться» (страница /t/… открывается и без входа) */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const track = await readTrackBody(event)
  return { path: `/t/${makeShareToken(track, user.name)}` }
})
