/** Умный поиск (⌘K): открыт ли. Общее состояние — открыть может кто угодно (клавиши, кнопка). */
export function useSpotlight() {
  const open = useState('spotlight:open', () => false)
  return { open, show: () => (open.value = true), hide: () => (open.value = false) }
}
