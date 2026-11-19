/** Скрытые исполнители («Не предлагать исполнителя») — для настроек */
export default defineEventHandler(async (event) => {
  const list = await listBlockedArtists(await requireUserId(event))
  return list.map(({ name, createdAt }) => ({ name, createdAt }))
})
