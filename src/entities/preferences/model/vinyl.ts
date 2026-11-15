/**
 * «Обложки как пластинки» (Оформление): у крупной обложки (карточка «Сейчас играет», полноэкранный режим)
 * две стороны — спереди обложка, сзади виниловая пластинка; касание/клик переворачивает.
 *
 * Одно значение на всё приложение (useState), cookie — только хранилище, чтобы сервер сразу отрисовал как надо.
 * Отдельные useCookie в разных компонентах не знают друг о друге: карточка собирается заранее и не видела,
 * что тему включили в настройках, — до перезагрузки ничего не менялось.
 * Значение cookie — boolean: useCookie сам разбирает содержимое (строка '1' стала бы числом 1).
 */
export function useVinylCovers() {
  const cookie = useCookie<boolean>('vinyl', { default: () => false, maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  const state = useState('pref:vinyl', () => cookie.value === true)
  return computed({
    get: () => state.value,
    set: (on: boolean) => {
      state.value = on
      cookie.value = on
    },
  })
}
