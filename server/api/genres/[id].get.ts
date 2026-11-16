/** Плейлист станции на сегодня ("genre:rock"). ?fresh — пересобрать. */
export default defineEventHandler(async (event): Promise<Collection> => {
  const id = decodeURIComponent(getRouterParam(event, 'id') ?? '')
  return stationMix(event, await requireUserId(event), id, getQuery(event).fresh !== undefined)
})
