/**
 * Помощники для анимации списков через `<TransitionGroup>`.
 *
 * Уходящая строка снимается с потока (`position: absolute`), чтобы остальные сразу начали плавно
 * съезжать на её место (класс `*-move`). В grid/flex-контейнере у абсолютного элемента без координат
 * «статичное» место — верхний левый угол контейнера, поэтому координаты фиксируем явно.
 * Контейнеру нужен `position: relative`.
 */
export function pinLeaving(el: Element) {
  if (!(el instanceof HTMLElement)) return
  const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = el
  Object.assign(el.style, {
    position: 'absolute',
    top: `${offsetTop}px`,
    left: `${offsetLeft}px`,
    width: `${offsetWidth}px`,
    height: `${offsetHeight}px`,
    margin: '0',
    pointerEvents: 'none',
  })
}

/**
 * Ключи строк списка, устойчивые к вставке и удалению: uid, а для повторов — uid#номер повтора.
 * Ключ по месту (`uid-index`) менялся у всех строк ниже изменения — они пересоздавались, а не сдвигались.
 */
export function stableKeys(items: readonly { uid: string }[]): string[] {
  const seen = new Map<string, number>()
  return items.map((t) => {
    const n = seen.get(t.uid) ?? 0
    seen.set(t.uid, n + 1)
    return n ? `${t.uid}#${n}` : t.uid
  })
}
