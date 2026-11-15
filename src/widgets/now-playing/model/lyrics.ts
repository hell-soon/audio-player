import type { EffectScope } from 'vue'
import { usePlayer } from '@/entities/player'

/**
 * Текст текущей песни — одно хранилище на всё приложение (карточка, панель текста, полноэкранный режим):
 * один запрос на песню, сколько бы компонентов его ни показывали.
 *
 * Раньше каждый компонент заводил свой useAsyncData с общим ключом: появление панели само запускало
 * загрузку, полноэкранный режим на время загрузки снова показывал панель, а у песни без текста убирал —
 * и так по кругу (приложение «падало» именно на песнях без текста). Теперь компоненты только читают состояние.
 *
 * Ответ проверяется: строки без времени и пустой текст отбрасываются — «странный» формат = «текста нет», а не ошибка.
 */
export type LyricsStatus = 'idle' | 'pending' | 'success' | 'error'

function clean(raw: unknown): Lyrics | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<Lyrics>
  const synced = Array.isArray(r.synced)
    ? r.synced
        .filter((l): l is LyricsLine => !!l && typeof l.t === 'number' && Number.isFinite(l.t) && typeof l.text === 'string')
        .map(l => ({
          t: l.t,
          text: l.text,
          ...(Array.isArray(l.words) && l.words.every(w => w && typeof w.t === 'number' && typeof w.text === 'string' && w.text)
            ? { words: l.words }
            : {}),
        }))
        .sort((a, b) => a.t - b.t)
    : []
  const hasSynced = synced.some(l => l.text.trim())
  const plain = typeof r.plain === 'string' && r.plain.trim() ? r.plain : null
  if (!hasSynced && !plain) return null
  return { synced: hasSynced ? synced : null, plain, source: typeof r.source === 'string' ? r.source : '' }
}

function create() {
  const p = usePlayer()
  const lyrics = shallowRef<Lyrics | null>(null)
  const status = ref<LyricsStatus>('idle')
  // Уже загруженные тексты (вернулись к песне — без запроса)
  const cache = new Map<string, Lyrics | null>()
  let seq = 0

  watch(() => p.current.value?.uid, async (uid) => {
    const my = ++seq
    const t = p.current.value
    if (!uid || !t) {
      lyrics.value = null
      status.value = 'idle'
      return
    }
    if (cache.has(uid)) {
      lyrics.value = cache.get(uid)!
      status.value = 'success'
      return
    }
    status.value = 'pending'
    try {
      const res = clean(await $fetch<unknown>('/api/lyrics', { method: 'POST', body: { track: t } }))
      if (cache.size > 40) cache.delete(cache.keys().next().value!)
      cache.set(uid, res)
      if (my !== seq) return
      lyrics.value = res
      status.value = 'success'
    }
    catch {
      if (my !== seq) return
      lyrics.value = null
      status.value = 'error'
    }
  }, { immediate: true })

  // Чуть раньше реального времени — строка успевает подсветиться к моменту, когда её поют.
  const activeIndex = computed(() => {
    const lines = lyrics.value?.synced
    if (!lines) return -1
    const pos = p.position.value + 250
    let i = -1
    for (let k = 0; k < lines.length; k++) {
      if (lines[k]!.t <= pos) i = k
      else break
    }
    return i
  })

  /** Текст есть (синхронный или обычный) */
  const hasLyrics = computed(() => !!(lyrics.value?.synced || lyrics.value?.plain))

  return { lyrics, status, activeIndex, hasLyrics }
}

let shared: ReturnType<typeof create> | null = null
let scope: EffectScope | null = null

export function useCurrentLyrics() {
  if (import.meta.server) {
    return { lyrics: shallowRef<Lyrics | null>(null), status: ref<LyricsStatus>('idle'), activeIndex: computed(() => -1), hasLyrics: computed(() => false) }
  }
  if (!shared) {
    // Отдельная область: хранилище живёт дольше любого компонента, который его открыл
    scope = effectScope(true)
    shared = scope.run(create)!
  }
  return shared
}
