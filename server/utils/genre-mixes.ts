import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Плейлисты по жанрам, настроениям, эпохам и занятиям — из радиостанций Яндекса.
 *  - Каталог станций: `/rotor/stations/list` (разбор мягкий: что не распознали — не показываем).
 *  - «Жанры дня» на главной — 8 случайных станций, одни и те же весь день (зерно `userId:день`).
 *  - Плейлист станции собирается из нескольких порций треков станции (продолжение — по последнему треку),
 *    «мягко по вкусу»: радио Яндекса и так подбирает с оглядкой на аккаунт, а уже лайкнутые отбрасываем — только новое.
 *    Хранится в таблице mixes (kind = "station:genre:rock") до конца дня по Москве; «Пересобрать» — fresh.
 */

const TYPES: { type: string, title: string, daily: number }[] = [
  { type: 'genre', title: 'Жанры', daily: 4 },
  { type: 'mood', title: 'Настроение', daily: 2 },
  { type: 'epoch', title: 'Эпохи', daily: 1 },
  { type: 'activity', title: 'Занятия', daily: 1 },
]
const TARGET = 30
const MAX_CALLS = 8
const TZ_SHIFT = 3 * 3600_000

const today = () => new Date(Date.now() + TZ_SHIFT).toISOString().slice(0, 10)
export const isStationId = (id: string) => /^(genre|mood|activity|epoch):[\w-]+$/.test(id)

function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/** Все станции по группам (кэш 12 ч — список меняется редко) */
export function stationGroups(event: H3Event, userId: string): Promise<StationGroup[]> {
  return cached(`u:${userId}:stations:list`, 12 * 3600_000, async () => {
    const res = await ymGet<{ result: any }>(event, '/rotor/stations/list', { language: 'ru' })
    const list: any[] = Array.isArray(res.result) ? res.result : []
    const byType = new Map<string, StationInfo[]>()
    const seen = new Set<string>()
    for (const item of list) {
      const st = item?.station ?? item
      const type = st?.id?.type
      const tag = st?.id?.tag
      if (typeof type !== 'string' || typeof tag !== 'string' || typeof st?.name !== 'string') continue
      const id = `${type}:${tag}`
      if (!isStationId(id) || seen.has(id)) continue
      seen.add(id)
      const arr = byType.get(type) ?? []
      arr.push({
        id,
        name: st.name,
        color: typeof st.icon?.backgroundColor === 'string' ? st.icon.backgroundColor : undefined,
        iconUrl: typeof st.icon?.imageUrl === 'string' ? coverUrl(st.icon.imageUrl, '100x100') : undefined,
      })
      byType.set(type, arr)
    }
    return TYPES.flatMap(t => (byType.get(t.type)?.length ? [{ type: t.type, title: t.title, stations: byType.get(t.type)! }] : []))
  })
}

/** Каталог: «Жанры дня» + все группы */
export async function genreCatalog(event: H3Event, userId: string): Promise<GenreCatalog> {
  const groups = await stationGroups(event, userId)
  const rnd = seeded(`${userId}:genres:${today()}`)
  const daily = TYPES.flatMap((t) => {
    const pool = [...(groups.find(g => g.type === t.type)?.stations ?? [])]
    const out: StationInfo[] = []
    while (out.length < t.daily && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!)
    return out
  })
  return { daily, groups }
}

/** Плейлист станции на сегодня: из базы или собирается заново (fresh — пересобрать) */
export async function stationMix(event: H3Event, userId: string, stationId: string, fresh = false): Promise<Collection> {
  if (!isStationId(stationId)) throw createError({ statusCode: 404, message: 'Нет такой подборки' })
  const kind = `station:${stationId}` as const
  const period = today()
  const db = useDb()
  const [row] = await db.select().from(schema.mixes).where(and(eq(schema.mixes.userId, userId), eq(schema.mixes.kind, kind))).limit(1)

  let list = row && row.period === period && !fresh ? row.tracks : null
  if (!list) {
    const liked = new Set((await getLikedTracks(userId)).map(t => t.uid))
    const out: Track[] = []
    const seen = new Set<string>()
    let queue: string | undefined
    for (let i = 0; i < MAX_CALLS && out.length < TARGET; i++) {
      // Ошибка первой порции (Яндекс не подключён — 409) уходит наверх; дальше — просто останавливаемся
      const batch = i === 0
        ? await yandexStationTracks(event, stationId, queue)
        : await yandexStationTracks(event, stationId, queue).catch(() => [] as Track[])
      if (!batch.length) break
      for (const t of batch) {
        if (seen.has(t.uid) || liked.has(t.uid)) continue
        seen.add(t.uid)
        out.push(t)
      }
      queue = batch.at(-1)!.sourceId.split(':')[0]
    }
    list = out
    if (list.length) {
      const values = { userId, kind, period, tracks: list, createdAt: Date.now() }
      await db.insert(schema.mixes).values(values).onConflictDoUpdate({
        target: [schema.mixes.userId, schema.mixes.kind],
        set: { period, tracks: list, createdAt: values.createdAt },
      })
    }
  }

  const station = (await stationGroups(event, userId).catch(() => [])).flatMap(g => g.stations).find(s => s.id === stationId)
  return {
    kind: 'playlist',
    id: `station:${stationId}`,
    title: station?.name ?? 'Подборка',
    subtitle: 'Новое для вас в этом жанре. Каждый день — своя подборка',
    tracks: list,
  }
}
