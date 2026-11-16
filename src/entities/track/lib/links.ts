/** Ссылка на исполнителя: по id источника, а если id нет — по имени (страница найдёт его в Яндексе). */
export function artistHref(track: Track, index: number) {
  const id = track.artistIds?.[index]
  const name = track.artists[index] ?? ''
  return id ? `/artist/${track.source}:${id}` : `/artist/name:${encodeURIComponent(name)}`
}

/** Название трека ведёт на его альбом (отдельной страницы трека нет). */
export function albumHref(track: Track) {
  return track.albumId ? `/album/${track.source}:${track.albumId}` : undefined
}

/**
 * Ссылка на песню в самом сервисе (Яндекс Музыка / Spotify) — для внешних мессенджеров:
 * сайт открывается только после входа, а эта ссылка — у кого угодно.
 */
export function serviceHref(track: Track) {
  if (track.source === 'spotify') return `https://open.spotify.com/track/${track.sourceId}`
  const [trackId, albumId = track.albumId] = track.sourceId.split(':')
  return albumId ? `https://music.yandex.ru/album/${albumId}/track/${trackId}` : `https://music.yandex.ru/track/${trackId}`
}

/** Та же песня «для любого сервиса»: song.link сам предложит Яндекс, Spotify, Apple Music и т.д. */
export function universalHref(track: Track) {
  return `https://song.link/${serviceHref(track)}`
}
