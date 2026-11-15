import { and, eq } from 'drizzle-orm'

/** Загруженная картинка — data URL (браузер уже уменьшил её). Предел — ~400 КБ после base64 */
const MAX_BASE64 = 550_000
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/

export const IMAGE_PREFIX = '/api/images/'

/** Сохранить картинку пользователя, вернуть её адрес /api/images/ID */
export async function saveImage(userId: string, dataUrl: unknown) {
  const m = typeof dataUrl === 'string' ? DATA_URL.exec(dataUrl) : null
  if (!m) throw createError({ statusCode: 400, message: 'Нужна картинка JPEG, PNG или WebP' })
  if (m[2]!.length > MAX_BASE64) throw createError({ statusCode: 413, message: 'Картинка слишком большая' })
  const id = crypto.randomUUID()
  await useDb().insert(schema.images).values({ id, userId, mime: m[1]!, data: m[2]!, createdAt: Date.now() })
  return `${IMAGE_PREFIX}${id}`
}

/** Удалить свою загруженную картинку по адресу (если адрес — наша картинка этого пользователя) */
export async function deleteOwnImage(userId: string, url: string | null | undefined) {
  if (!url?.startsWith(IMAGE_PREFIX)) return
  const id = url.slice(IMAGE_PREFIX.length).split('?')[0]!
  await useDb().delete(schema.images).where(and(eq(schema.images.id, id), eq(schema.images.userId, userId)))
}

/** Обложка, которую можно поставить без загрузки: наша картинка или обложка трека из сервисов */
export function isAllowedCoverUrl(url: string) {
  if (url.startsWith(IMAGE_PREFIX)) return true
  try {
    const host = new URL(url).hostname
    return url.startsWith('https://') && (host.endsWith('avatars.yandex.net') || host.endsWith('scdn.co') || host.endsWith('spotifycdn.com'))
  }
  catch {
    return false
  }
}
