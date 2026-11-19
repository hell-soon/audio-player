import { usePlayer } from '@/entities/player'
import { invalidateData } from '@/shared/lib'
import { useToast } from '@/shared/ui'

/**
 * «Больше не предлагать»: трек убирается из очереди (играл — переключаемся дальше),
 * радио его больше не ставит, в Яндекс уходит дизлайк. В уведомлении — «Отменить».
 */
export function useDislike() {
  const player = usePlayer()
  const toast = useToast()

  function dislike(t: Track) {
    const undoLocal = player.dislike(t)
    $fetch('/api/yandex/dislike', { method: 'POST', body: { track: t } }).catch(() => {})
    toast.show('Больше не предложим', 'default', 5000, {
      label: 'Отменить',
      run: () => {
        undoLocal()
        $fetch('/api/yandex/dislike', { method: 'POST', body: { track: t, undo: true } }).catch(() => {})
      },
    })
  }
  /**
   * «Не предлагать исполнителя»: на сервере — в список скрытых (радио и подборки его больше не берут, на всех
   * устройствах), здесь — убираем его песни из оставшейся очереди. В уведомлении — «Отменить».
   */
  async function hideArtist(name: string) {
    try {
      await $fetch('/api/library/blocked-artists', { method: 'POST', body: { name } })
    }
    catch (e: any) {
      toast.error(e?.data?.message || 'Не получилось скрыть исполнителя')
      return
    }
    const undoLocal = player.blockArtist(name)
    invalidateData('blocked-artists')
    toast.show(`«${name}» больше не предложим`, 'default', 5000, {
      label: 'Отменить',
      run: async () => {
        undoLocal()
        await $fetch('/api/library/blocked-artists', { method: 'DELETE', query: { name } }).catch(() => {})
        invalidateData('blocked-artists')
      },
    })
  }

  return { dislike, hideArtist }
}
