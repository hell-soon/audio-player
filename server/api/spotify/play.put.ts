/** Запуск треков на устройстве (нашем браузерном плеере из Web Playback SDK). */
export default defineEventHandler(async (event) => {
  const { deviceId, trackIds, offset = 0, positionMs = 0 } = await readBody<{ deviceId: string, trackIds: string[], offset?: number, positionMs?: number }>(event)
  if (!deviceId || !trackIds?.length) throw createError({ statusCode: 400, message: 'deviceId и trackIds обязательны' })

  const body = { uris: trackIds.map(id => `spotify:track:${id}`), offset: { position: offset }, position_ms: Math.max(0, Math.floor(positionMs)) }
  const play = () => spotifyFetch(event, '/me/player/play', { method: 'PUT', query: { device_id: deviceId }, body })

  try {
    await play()
  }
  catch (err: any) {
    // Сразу после `ready` устройство иногда ещё не зарегистрировано у Spotify (404) — повторяем.
    if (err?.statusCode !== 404) throw err
    await new Promise(r => setTimeout(r, 1000))
    try {
      await play()
    }
    catch (again: any) {
      // Spotify «забыл» браузерный плеер (сон компьютера, долгая фоновая вкладка, обрыв связи SDK):
      // понятная ошибка вместо необработанной — клиент переподключит плеер и повторит (или сыграет через Яндекс)
      if (again?.statusCode === 404) throw createError({ statusCode: 404, message: 'Плеер Spotify отключился', data: { code: 'device-gone' } })
      throw again
    }
  }
  return { ok: true }
})
