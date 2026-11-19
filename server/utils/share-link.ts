import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Ссылка на песню в Audio (`/t/<данные>.<подпись>`) — её можно отправить кому угодно, в том числе без аккаунта:
 * страница открывается без входа и показывает обложку, название и кнопки «Открыть в Яндекс Музыке / Spotify».
 * Данные песни лежат в самой ссылке (без базы), подпись HMAC от NUXT_SESSION_PASSWORD — чтобы по ссылке на наш
 * домен нельзя было показать произвольный текст.
 */

interface SharePayload {
  s: Track['source']
  i: string
  t: string
  a: string[]
  c?: string
  d: number
  al?: string
  /** Имя отправителя («Аня делится песней») */
  f?: string
}

function sign(data: string) {
  const secret = useRuntimeConfig().session.password
  if (!secret) throw new Error('NUXT_SESSION_PASSWORD не задан')
  return createHmac('sha256', `share:${secret}`).update(data).digest('base64url').slice(0, 22)
}

export function makeShareToken(t: Track, from?: string) {
  const payload: SharePayload = {
    s: t.source,
    i: t.sourceId,
    t: t.title.slice(0, 200),
    a: t.artists.slice(0, 4).map(a => a.slice(0, 100)),
    c: t.coverUrl,
    d: t.durationMs,
    al: t.albumId,
    f: from?.split(/\s+/)[0]?.slice(0, 40) || undefined,
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function readShareToken(token: string): { track: Track, from?: string } | null {
  const [data, sig] = token.split('.')
  if (!data || !sig || data.length > 4000) return null
  const expected = sign(data)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SharePayload
    if ((p.s !== 'yandex' && p.s !== 'spotify') || typeof p.i !== 'string' || typeof p.t !== 'string' || !Array.isArray(p.a)) return null
    return {
      track: {
        uid: `${p.s}:${p.i}`,
        source: p.s,
        sourceId: p.i,
        title: p.t,
        artists: p.a.map(String),
        coverUrl: typeof p.c === 'string' ? p.c : undefined,
        durationMs: Number(p.d) || 0,
        albumId: typeof p.al === 'string' ? p.al : undefined,
      },
      from: typeof p.f === 'string' ? p.f : undefined,
    }
  }
  catch {
    return null
  }
}
