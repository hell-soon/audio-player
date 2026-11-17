/**
 * Запуск треков на устройстве (нашем браузерном плеере из Web Playback SDK).
 * Сбои Spotify превращаются в понятные ошибки с `data.code` — плеер тогда играет трек через Яндекс:
 *  - 404 `device-gone` — Spotify «забыл» браузерный плеер (сон компьютера, долгая фоновая вкладка, обрыв SDK);
 *  - 409 `spotify-restricted` — 403 «Restriction violated»: Spotify не дал включить на этом устройстве
 *    (устройство ещё не активно, ограничения аккаунта/региона);
 *  - 503 `spotify-unavailable` — 5xx у Spotify («Bad gateway» и т. п.).
 * Каждый из сбоев сначала повторяется один раз: чаще всего это мгновение.
 */
export default defineEventHandler(async (event) => {
  const { deviceId, trackIds, offset = 0, positionMs = 0 } = await readBody<{ deviceId: string, trackIds: string[], offset?: number, positionMs?: number }>(event)
  if (!deviceId || !trackIds?.length) throw createError({ statusCode: 400, message: 'deviceId и trackIds обязательны' })

  const body = { uris: trackIds.map(id => `spotify:track:${id}`), offset: { position: offset }, position_ms: Math.max(0, Math.floor(positionMs)) }
  const play = () => spotifyFetch(event, '/me/player/play', { method: 'PUT', query: { device_id: deviceId }, body })
  const status = (err: any): number => err?.statusCode ?? err?.response?.status ?? 0
  // Повторяем: 404 (устройство ещё не зарегистрировано сразу после `ready`), 403 и 5xx; без ответа вовсе — тоже
  const retriable = (err: any) => [0, 403, 404].includes(status(err)) || status(err) >= 500

  try {
    await play()
    return { ok: true }
  }
  catch (err: any) {
    if (!retriable(err)) throw err
  }
  await new Promise(r => setTimeout(r, 1000))
  try {
    await play()
    return { ok: true }
  }
  catch (again: any) {
    const code = status(again)
    const reason = again?.data?.error?.message
    if (code === 404) throw createError({ statusCode: 404, message: 'Плеер Spotify отключился', data: { code: 'device-gone' } })
    if (code === 403) {
      console.warn('[spotify] play 403:', reason)
      throw createError({ statusCode: 409, message: 'Spotify не дал включить трек на этом плеере', data: { code: 'spotify-restricted' } })
    }
    if (code === 0 || code >= 500) {
      console.warn('[spotify] play: сбой Spotify', code || again?.message)
      throw createError({ statusCode: 503, message: 'Spotify сейчас не отвечает', data: { code: 'spotify-unavailable' } })
    }
    throw again
  }
})
