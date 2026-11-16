export default defineEventHandler(async (event) => {
  const id = String(getQuery(event).id ?? '')
  if (!id) throw createError({ statusCode: 400, message: 'id обязателен' })
  const res = await spotifyFetch<{ devices: { id: string | null }[] }>(event, '/me/player/devices')
  return { alive: res.devices.some(d => d.id === id) }
})
