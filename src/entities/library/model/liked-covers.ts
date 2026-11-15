import { useCachedFetch } from '@/shared/lib'

/** Обложки последних любимых — для коллажа «Любимые треки» (обновляется вместе с лайками) */
export function useLikedCovers() {
  return useCachedFetch<string[]>('/api/library/likes/covers', { key: 'library:liked-covers', default: () => [] })
}
