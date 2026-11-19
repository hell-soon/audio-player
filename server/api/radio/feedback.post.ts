/**
 * Сигнал от плеера: трек пропущен (переключили раньше 30 с) или дослушан.
 *  - Пропуск копится в таблице skips — подбор учитывает его («чтобы не надоедало», taste-filter.ts).
 *  - Если играет «Моя волна» или станция и трек из Яндекса — та же обратная связь уходит в радио Яндекса
 *    (`/rotor/station/{id}/feedback`: skip / trackFinished), чтобы волна училась. Ошибки Яндекса не мешают.
 */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const body = await readBody<{ type?: unknown, playedMs?: unknown, station?: unknown }>(event)
  const track = await readTrackBody(event)
  const type = body.type === 'skip' ? 'skip' : body.type === 'finish' ? 'finish' : null
  if (!type) throw createError({ statusCode: 400, message: 'Неизвестный сигнал' })
  const playedMs = typeof body.playedMs === 'number' && Number.isFinite(body.playedMs) ? body.playedMs : 0

  if (type === 'skip') await recordSkip(userId, track, playedMs).catch(() => {})

  const station = body.station === 'wave' ? 'user:onyourwave' : typeof body.station === 'string' && /^[\w-]+:[\w-]+$/.test(body.station) ? body.station : null
  if (station && track.source === 'yandex') {
    await ymPost(event, `/rotor/station/${station}/feedback`, {
      type: type === 'skip' ? 'skip' : 'trackFinished',
      trackId: track.sourceId,
      totalPlayedSeconds: Math.round(playedMs / 1000),
      timestamp: Date.now() / 1000,
    }).catch(() => null)
  }
  return { ok: true }
})
