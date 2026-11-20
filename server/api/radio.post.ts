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
 * «Моя волна» — отдельный состав (см. ниже): Яндекс + Spotify в жанрах пользователя + давно не звучавшее любимое.
 * Всё проходит tasteGuard: скрытые исполнители, «не моя музыка», надоевшее (часто играло / пропускали).
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
  // Скрытые исполнители и «не моя музыка» (taste-filter.ts) — отбор прямо при доборе, чтобы порция не таяла
  const guard = await tasteGuard(userId)

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

  // «Моя волна» без Яндекса: Last.fm Similar-источник по зёрнам Вкуса (#10), без rotor-сессии
  if (body.station === 'wave') {
    const conn = await activeConnections(userId)
    if (!conn.yandex) {
      const excludeAll = new Set([...exclude, ...recent])
      const have = new Set(excludeAll)
      let tracks = (await waveLastfmTracks(event, userId, { issued: exclude.size, exclude: excludeAll, target: continuing ? 15 : 24 }))
        .filter(guard)
      // Нечего новое взять — повтор уже звучавшего в потоке лучше тишины (recent не учитываем)
      if (!tracks.length && recent.size) {
        tracks = (await waveLastfmTracks(event, userId, { issued: exclude.size, exclude, target: 12 })).filter(guard)
      }
      for (const t of tracks) { have.add(t.uid); have.add(songKey(t)) }
      let fromSpotify: Track[] = []
      if (conn.spotify) {
        const genres = shuffleWith(await tasteSpotifyGenres(event, userId).catch(() => [] as string[]), Math.random).slice(0, 2)
        const per = Math.ceil(Math.max(tracks.length, 12) / 3 / Math.max(genres.length, 1))
        fromSpotify = (await Promise.all(genres.map(g => spotifyDiscover(event, [`genre:"${g}"`, g], per, have).catch(() => [] as Track[])))).flat().filter(guard)
      }
      // Любимое: каждый пятый; если Last.fm пуст — явная деградация на любимое
      const [liked, played3d] = await Promise.all([getLikedTracks(userId).catch(() => [] as Track[]), recentlyPlayed(userId, 72)])
      const favPool = interleaveSources(shuffleWith(liked.filter(t => !played3d.has(t.uid) && !have.has(t.uid)), Math.random)).filter(guard)
      const favorites = favPool.slice(0, tracks.length ? Math.ceil(tracks.length / 5) : 20)
      if (!tracks.length) return [...favorites, ...fromSpotify].filter(guard)
      return sprinkle(sprinkle(tracks, fromSpotify, 2), favorites, 4).filter(guard)
    }
  }

  // «Похожее на…» без Яндекса: Last.fm Similar от исполнителя seed-трека (#9), без станции track:
  if (body.station === 'similar' && seed) {
    const conn = await activeConnections(userId)
    if (!conn.yandex) {
      const target = continuing ? 15 : 20
      const excludeAll = new Set([...exclude, ...recent])
      const pick = async (ex: Set<string>) => {
        let list = (await similarRadioTracks(event, seed, { exclude: ex, target })).filter(guard)
        // Исполнитель выдохся — запасной ход: тот же Similar-источник по зёрнам Вкуса, а не user:onyourwave
        if (list.length < 5 && continuing) {
          const have = new Set([...ex, ...list.map(t => t.uid), ...list.map(songKey)])
          const more = await waveLastfmTracks(event, userId, { issued: exclude.size, exclude: have, target: target - list.length }).catch(() => [] as Track[])
          list = [...list, ...more.filter(guard)]
        }
        return list
      }
      let tracks = await pick(excludeAll)
      // Всё уже звучало сегодня — лучше повтор, чем тишина
      if (!tracks.length && recent.size) tracks = await pick(exclude)
      return tracks
    }
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

  // «Моя волна» стартует с большой порции — сразу видно, что дальше; продолжение подгружается заранее
  const target = continuing ? 15 : body.station === 'wave' ? 24 : 20
  const excludeAll = new Set([...exclude, ...recent])
  // Первая порция — без лишних запросов (быстрый старт), продолжение — набираем побольше
  let tracks = await stationFill(event, station, {
    target,
    maxCalls: continuing || body.station === 'wave' ? 6 : 3,
    concurrency: continuing ? 3 : 1,
    exclude: excludeAll,
    accept: guard,
    seeds: continuing ? [await resolveSeed()] : [],
    // Живой поток продолжает свою сессию радио: Яндекс помнит, что уже выдал
    continueSession: continuing,
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
      const more = await stationFill(event, st, { target: target - tracks.length, maxCalls: 3, concurrency: 3, exclude: have, accept: guard, seeds: [id] }).catch(() => [] as Track[])
      tracks = [...tracks, ...more]
      if (tracks.length >= 10) break
    }
  }
  // Всё уже звучало сегодня — лучше повтор, чем тишина
  if (!tracks.length && continuing) {
    tracks = await stationFill(event, station, { target: 10, maxCalls: 3, exclude, accept: guard, seeds: [seedId] }).catch(() => [] as Track[])
  }

  // «Моя волна» — на весь день: новое из Яндекса + новое из Spotify в ваших жанрах (каждый третий)
  // + любимое из обоих сервисов, что не звучало 3 дня (каждый пятый). Надоевшее отсекает guard.
  if (body.station === 'wave' && tracks.length) {
    const conn = await activeConnections(userId)
    const have = new Set([...excludeAll, ...tracks.map(t => t.uid), ...tracks.map(songKey)])
    let fromSpotify: Track[] = []
    if (conn.spotify) {
      const genres = shuffleWith(await tasteSpotifyGenres(event, userId).catch(() => [] as string[]), Math.random).slice(0, 2)
      const per = Math.ceil(tracks.length / 3 / Math.max(genres.length, 1))
      fromSpotify = (await Promise.all(genres.map(g => spotifyDiscover(event, [`genre:"${g}"`, g], per, have).catch(() => [] as Track[])))).flat().filter(guard)
    }
    const [liked, played3d] = await Promise.all([getLikedTracks(userId).catch(() => [] as Track[]), recentlyPlayed(userId, 72)])
    const favorites = interleaveSources(shuffleWith(liked.filter(t => !played3d.has(t.uid) && !have.has(t.uid)), Math.random))
      .filter(guard)
      .slice(0, Math.ceil(tracks.length / 5))
    return sprinkle(sprinkle(tracks, fromSpotify, 2), favorites, 4).filter(guard)
  }

  // Знакомое из библиотеки (оба сервиса) — примерно каждый пятый трек, только в продолжении станций
  if (continuing && tracks.length >= 4 && body.station !== 'artist') {
    const liked = await getLikedTracks(userId).catch(() => [] as Track[])
    const known = familiarFor(liked, tracks, excludeAll, Math.floor(tracks.length / 4))
    tracks = sprinkle(tracks, known, 4)
  }
  return tracks.filter(guard)
})
