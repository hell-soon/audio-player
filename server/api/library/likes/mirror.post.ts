/**
 * «В любимые и в Spotify / Яндекс»: лайк на сайте (и в сервисе трека) + поиск копии во втором сервисе и лайк там.
 * { track } → { found, service }: found=false — во втором сервисе такого трека не нашлось.
 */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const track = await readTrackBody(event)
  // Сначала — подключён ли второй сервис: иначе лайк на сайте встал бы, а ответ был бы ошибкой
  const other = track.source === 'yandex' ? 'spotify' : 'yandex'
  if (!await getAccount(userId, other)) throw createError({ statusCode: 409, message: `${other === 'spotify' ? 'Spotify' : 'Яндекс Музыка'} не подключён` })
  await likeTrack(userId, track)
  event.waitUntil(syncLikeToService(event, userId, track, true))
  return mirrorLike(event, userId, track)
})
