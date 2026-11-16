import { genreLabel, plural } from '@/shared/lib'

/**
 * Сведения о треке и его другие версии — для окна «Сведения о треке» и вкладки «О треке» в карточке.
 * Грузятся, только пока они нужны (`enabled`); кэш по uid на время сессии — при листании туда-обратно
 * повторных запросов нет (сведения — 5 мин: в них ваша статистика). Ответ применяется, только если трек всё ещё тот же (счётчик `seq`).
 */
const detailsCache = new Map<string, { at: number, value: TrackDetails }>()
/** Сведения содержат вашу статистику («слушали N раз») — держим недолго */
const DETAILS_TTL = 5 * 60_000
const versionsCache = new Map<string, TrackVersion[]>()

export function useTrackDetails(track: () => Track | null | undefined, enabled: () => boolean) {
  const info = ref<TrackDetails | null>(null)
  const failed = ref(false)
  let seq = 0
  watch([() => track()?.uid, enabled], async ([uid, on]) => {
    const t = track()
    if (!on || !t || !uid) return
    const id = ++seq
    failed.value = false
    const hit = detailsCache.get(uid)
    info.value = hit && Date.now() - hit.at < DETAILS_TTL ? hit.value : null
    if (info.value) return
    try {
      const r = await $fetch<TrackDetails>('/api/tracks/info', { method: 'POST', body: { track: t } })
      detailsCache.set(uid, { at: Date.now(), value: r })
      if (id === seq) info.value = r
    }
    catch {
      if (id === seq) failed.value = true
    }
  }, { immediate: true })
  return { info, failed }
}

export function useTrackVersions(track: () => Track | null | undefined, enabled: () => boolean) {
  const versions = ref<TrackVersion[] | null>(null)
  let seq = 0
  watch([() => track()?.uid, enabled], async ([uid, on]) => {
    const t = track()
    if (!on || !t || !uid) return
    const id = ++seq
    versions.value = versionsCache.get(uid) ?? null
    if (versions.value) return
    const r = await $fetch<TrackVersion[]>('/api/tracks/versions', { method: 'POST', body: { track: t } }).catch(() => [] as TrackVersion[])
    versionsCache.set(uid, r)
    if (id === seq) versions.value = r
  }, { immediate: true })
  return { versions }
}

/** Подписи видов версий */
export const VERSION_LABEL: Record<TrackVersionKind, string> = {
  original: 'Оригинал',
  remix: 'Ремикс',
  live: 'Концерт',
  acoustic: 'Акустика',
  cover: 'Кавер',
  slowed: 'Slowed',
  sped: 'Sped up',
  instrumental: 'Инструментал',
  remaster: 'Ремастер',
  other: 'Другая запись',
}

const ALBUM_TYPE: Record<string, string> = { single: 'Сингл', compilation: 'Сборник' }

const date = (iso?: string | number) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** Строки «название — значение» о самой песне (без исполнителя и статистики) */
export function songFacts(t: Track, i: TrackDetails | null) {
  const pos = i?.position
  return [
    { label: 'Альбом', value: [t.album, i?.albumType ? ALBUM_TYPE[i.albumType] : ''].filter(Boolean).join(' · ') },
    { label: 'Вышел', value: i?.releaseDate ? date(i.releaseDate) : i?.year ? String(i.year) : '' },
    { label: 'В альбоме', value: pos && (pos.total ?? 0) > 1 ? `трек ${pos.index} из ${pos.total}${pos.volume && pos.volume > 1 ? ` · диск ${pos.volume}` : ''}` : '' },
    { label: 'Жанр', value: genreLabel(i?.genre) },
    { label: i?.writers && i.writers.length > 1 ? 'Авторы' : 'Автор', value: i?.writers?.join(', ') ?? '' },
    { label: 'Лейбл', value: i?.label ?? '' },
  ].filter(r => r.value)
}

/** Ваша статистика по треку */
export function yourFacts(i: TrackDetails | null) {
  if (!i) return []
  return [
    { label: 'Вы слушали', value: i.plays ? `${i.plays} ${plural(i.plays, ['раз', 'раза', 'раз'])}` : 'ещё не слушали' },
    { label: 'Впервые', value: date(i.firstPlayedAt) },
    { label: 'В любимых с', value: date(i.likedAt) },
  ].filter(r => r.value)
}
