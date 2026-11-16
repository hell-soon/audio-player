import { useCachedFetch } from '@/shared/lib'

/**
 * Каталог станций Яндекса для плейлистов по жанрам: «Жанры дня» и все группы.
 * enabled — только для тех, кто пользуется Яндексом (иначе запрос впустую: 409 «не подключён»).
 */
export function useGenres(enabled = true) {
  return useCachedFetch<GenreCatalog>('/api/genres', { key: 'genres', ttl: 30 * 60_000, immediate: enabled })
}

/** Страница плейлиста станции */
export const stationLink = (s: StationInfo) => `/collection/station:${s.id}`
