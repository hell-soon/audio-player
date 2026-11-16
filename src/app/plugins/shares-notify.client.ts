import { usePushNotifications } from '@/features/push-notifications'
import { usePlayer } from '@/entities/player'
import { invalidateData } from '@/shared/lib'
import { useToast } from '@/shared/ui'

/**
 * «Друг прислал песню», пока сайт открыт:
 *  - раз в минуту (и при возврате на вкладку) смотрим число непросмотренных; выросло — плашка «Имя: песня · Слушать»
 *    (если на этом устройстве включены системные уведомления — плашку не показываем, уведомление уже пришло);
 *  - сообщения service worker: пришёл push — обновить «Вам прислали» и значок; нажали на уведомление — перейти.
 * Скрытая вкладка не опрашивает (бережём лимиты Neon).
 */
export default defineNuxtPlugin(() => {
  const { loggedIn } = useUserSession()
  const toast = useToast()
  const push = usePushNotifications()
  let lastCount: number | null = null
  let lastSeenAt = Date.now()

  async function check() {
    if (!loggedIn.value || document.visibilityState !== 'visible') return
    const r = await $fetch<{ count: number }>('/api/shares/unseen').catch(() => null)
    if (!r) return
    const grew = lastCount !== null && r.count > lastCount
    lastCount = r.count
    if (!grew) return
    invalidateData(['shares:unseen', 'shares:list'])
    if (push.state.value === 'on') return
    const list = await $fetch<ShareInfo[]>('/api/shares').catch(() => [] as ShareInfo[])
    const fresh = list.filter(s => !s.seen && s.createdAt > lastSeenAt)
    lastSeenAt = Date.now()
    const s = fresh[0]
    if (!s) return
    const more = fresh.length > 1 ? ` и ещё ${fresh.length - 1}` : ''
    // Нажатие «Слушать» — жест пользователя: iOS разрешит звук
    toast.show(`${s.from.name}: «${s.track.title}»${more}`, 'default', 9000, {
      label: 'Слушать',
      run: () => usePlayer().playQueue(fresh.map(x => x.track), 0),
    })
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      const msg = e.data
      if (msg?.type === 'push') {
        lastCount = (lastCount ?? 0) + 1
        lastSeenAt = Date.now()
        invalidateData(['shares:unseen', 'shares:list'])
      }
      if (msg?.type === 'open' && typeof msg.url === 'string' && msg.url.startsWith('/')) navigateTo(msg.url)
    })
  }

  setTimeout(check, 5000)
  setInterval(check, 60_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
})
