import { formatTotalDuration, plural } from '@/shared/lib'

/**
 * Описание плейлиста из него самого (без внешних сервисов): главные исполнители, сколько треков и времени.
 * variant — номер нажатия «Придумать»: каждый раз другая формулировка.
 */
export function describePlaylist(tracks: Track[], variant = 0): string {
  if (!tracks.length) return ''
  // Исполнители по числу треков (первый в списке — главный)
  const counts = new Map<string, number>()
  for (const t of tracks) {
    const a = t.artists[0]
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  const lead = top.slice(0, 3)
  const rest = top.length - lead.length
  const join = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} и ${l.at(-1)}` : l[0] ?? '')
  const n = tracks.length
  const size = `${n} ${plural(n, ['трек', 'трека', 'треков'])}`
  const time = formatTotalDuration(tracks.reduce((s, t) => s + t.durationMs, 0))
  const more = rest > 0 ? ` и ещё ${rest} ${plural(rest, ['исполнитель', 'исполнителя', 'исполнителей'])}` : ''
  const solo = top.length === 1

  const variants = solo
    ? [
        `Только ${lead[0]}: ${size}, ${time}.`,
        `${size} ${lead[0]} — ${time} без перерыва.`,
        `Всё лучшее у ${lead[0]} в одном месте. ${size}, ${time}.`,
      ]
    : [
        `${join(lead)}${more}. ${size}, ${time}.`,
        `Здесь звучат ${join(lead)}${more} — ${size} на ${time}.`,
        `${time} музыки: ${join(lead.slice(0, 2))}${top.length > 2 ? ' и не только' : ''}. ${size}.`,
        `Подборка, где встречаются ${join(lead)}${more}. Включайте с любого трека — ${time}.`,
      ]
  return variants[variant % variants.length]!
}
