import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import webpush from 'web-push'

/**
 * Системные уведомления (Web Push): «друг прислал песню».
 * Ключи VAPID — NUXT_PUBLIC_VAPID_PUBLIC_KEY / NUXT_VAPID_PRIVATE_KEY (создать: `npx web-push generate-vapid-keys`).
 * Ключей нет — уведомления тихо выключены (на клиенте переключатель не показывается).
 * На iPhone push работает только в установленном на экран «Домой» приложении (iOS 16.4+).
 */

export interface PushPayload {
  title: string
  body: string
  /** Куда перейти по нажатию */
  url: string
  /** Обложка */
  icon?: string
  /** Одинаковый tag заменяет прежнее уведомление, а не копит их */
  tag?: string
}

let configured: boolean | null = null
function ready() {
  if (configured !== null) return configured
  const cfg = useRuntimeConfig()
  const pub = String(cfg.public.vapidPublicKey || '')
  const priv = String(cfg.vapidPrivateKey || '')
  configured = !!(pub && priv)
  if (configured) webpush.setVapidDetails(String(cfg.vapidSubject || 'mailto:noreply@example.com'), pub, priv)
  return configured
}

export function pushEnabled() {
  return ready()
}

export async function savePushSubscription(event: H3Event, userId: string, sub: { endpoint: string, keys: { p256dh: string, auth: string } }) {
  const { pushSubscriptions } = schema
  const row = { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: deviceLabel(event), createdAt: Date.now() }
  await useDb().insert(pushSubscriptions).values({ endpoint: sub.endpoint, ...row })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: row })
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  const { pushSubscriptions } = schema
  const db = useDb()
  // Только свою: чужой endpoint не трогаем
  const [row] = await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  if (row?.userId === userId) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
}

/**
 * Отправить уведомление на все устройства пользователя. Ошибки не пробрасываются:
 * уведомление — дополнение, из-за него действие (отправка песни) не должно падать.
 * Отвергнутые подписки (404/410 — пользователь отписался или переустановил приложение) удаляются.
 */
export async function sendPush(userId: string, payload: PushPayload) {
  if (!ready()) return
  const { pushSubscriptions } = schema
  const db = useDb()
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).catch(() => [])
  const body = JSON.stringify(payload)
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 24 * 3600, timeout: 5000, urgency: 'normal' })
    }
    catch (e: any) {
      const code = e?.statusCode
      if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint)).catch(() => {})
      else console.warn('[push] не удалось отправить:', code ?? e?.message)
    }
  }))
}
