/**
 * Подбор музыки (радио Яндекса).
 *  { station: 'wave' }                 — «Моя волна»;
 *  { station: 'similar', seed: Track } — похожее на трек (трек Spotify сначала ищем в Яндексе);
 *  { station: 'id', id: 'genre:rock' } — станция из «Станций для вас»;
 *  { station: 'artist', name }         — по исполнителю (например, из топа Spotify);
 *  { station: 'blend', id: '20s' }     — «Микс из двух сервисов»: Яндекс и Spotify вперемешку (blend-mixes.ts).
 * seed — последний трек очереди: от него станция продолжает (без него Яндекс отдаёт ту же первую порцию,
 * она целиком в exclude — и поток «заканчивался»).
 * exclude — uid уже стоящих в очереди треков.
 *
 * Если станция ничего нового не дала — запасные: похожее на последний трек → его исполнитель → «Моя волна».
 * В поток изредка подмешиваются любимые песни (Яндекс и Spotify) тех же исполнителей.
 */
export default defineEventHandler(async (event): Promise<Track[]> => {
  const userId = await requireUserId(event)
  const body = await readBody<{ station: 'wave' | 'similar' | 'id' | 'artist' | 'blend', seed?: Track, id?: string, name?: string, exclude?: string[] }>(event)
  const seed = body.seed && typeof body.seed.uid === 'string' && Array.isArray(body.seed.artists) ? body.seed : undefined
  const continuing = !!body.exclude?.length

  const exclude = new Set<string>()
  for (const uid of body.exclude ?? []) exclude.add(uid)
  // Недавно звучавшее не повторяем (но если иначе пусто — разрешим, см. ниже)
  const recent = await recentlyPlayed(userId, 12)

  if (body.station === 'blend') {
    const preset = findBlend(body.id)
    if (!preset) throw createError({ statusCode: 404, message: 'Нет такого микса' })
    // Точка продолжения для Яндекса — последний трек Яндекса в очереди (последним может быть трек Spotify)
    const lastYandex = [...(body.exclude ?? []), seed?.uid].filter((u): u is string => !!u && u.startsWith('yandex:')).at(-1)
    const seedId = lastYandex ? lastYandex.split(':')[1]! : null
    let tracks = await blendTracks(event, userId, preset, { n: continuing ? 16 : 20, exclude: new Set([...exclude, ...recent]), seedId })
    // Всё уже звучало сегодня — лучше повтор, чем тишина
    if (!tracks.length) tracks = await blendTracks(event, userId, preset, { n: 12, exclude, seedId })
    return tracks
  }

  // id последнего трека в Яндексе — точка продолжения
  let seedId: string | null = yandexTrackId(seed)
  const resolveSeed = async () => {
    if (seedId || !seed) return seedId
    const m = await findYandexMatch(event, { title: seed.title, artists: seed.artists, durationMs: seed.durationMs }).catch(() => null)
    return (seedId = m ? m.split(':')[0]! : null)
  }

  // Основная станция
  let station = 'user:onyourwave'
  if (body.station === 'similar') {
    const id = await resolveSeed()
    if (id) station = `track:${id}`
  }
  else if (body.station === 'id' && body.id && /^[\w-]+:[\w-]+$/.test(body.id)) {
    station = body.id
  }
  else if (body.station === 'artist' && body.name) {
    const artistId = await yandexFindArtistId(event, body.name)
    if (!artistId) throw createError({ statusCode: 404, message: 'Исполнитель не найден в Яндекс Музыке' })
    station = `artist:${artistId}`
  }

  const target = continuing ? 15 : 20
  const excludeAll = new Set([...exclude, ...recent])
  // Первая порция — без лишних запросов (быстрый старт), продолжение — набираем побольше
  let tracks = await stationFill(event, station, {
    target,
    maxCalls: continuing ? 5 : 3,
    concurrency: continuing ? 3 : 1,
    exclude: excludeAll,
    seeds: continuing ? [await resolveSeed()] : [],
  })

  // Запасные станции, если основная выдохлась
  if (tracks.length < 5 && continuing) {
    const fallbacks: string[] = []
    const id = await resolveSeed()
    if (id && station !== `track:${id}`) fallbacks.push(`track:${id}`)
    const artistId = seed?.source === 'yandex' ? seed.artistIds?.[0] : null
    if (artistId) fallbacks.push(`artist:${artistId}`)
    if (station !== 'user:onyourwave') fallbacks.push('user:onyourwave')
    for (const st of fallbacks) {
      const have = new Set([...excludeAll, ...tracks.map(t => t.uid), ...tracks.map(songKey)])
      const more = await stationFill(event, st, { target: target - tracks.length, maxCalls: 3, concurrency: 3, exclude: have, seeds: [id] }).catch(() => [] as Track[])
      tracks = [...tracks, ...more]
      if (tracks.length >= 10) break
    }
  }
  // Всё уже звучало сегодня — лучше повтор, чем тишина
  if (!tracks.length && continuing) {
    tracks = await stationFill(event, station, { target: 10, maxCalls: 3, exclude, seeds: [seedId] }).catch(() => [] as Track[])
  }

  // Знакомое из библиотеки (оба сервиса) — примерно каждый пятый трек, только в продолжении «Моей волны» / станций
  if (continuing && tracks.length >= 4 && body.station !== 'artist') {
    const liked = await getLikedTracks(userId).catch(() => [] as Track[])
    const known = familiarFor(liked, tracks, excludeAll, Math.floor(tracks.length / 4))
    tracks = sprinkle(tracks, known, 4)
  }
  return tracks
})
