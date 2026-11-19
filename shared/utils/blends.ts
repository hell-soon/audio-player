/**
 * «Миксы из двух сервисов»: бесконечный поток случайной музыки сразу из Яндекса и Spotify
 * по десятилетию (и жанру). Список общий для сервера (сборка, blend-mixes.ts) и клиента (плитки).
 *  - Яндекс: станция эпохи / жанра (`yandex` — кандидаты тегов по порядку, `epoch` — поиск станции эпохи
 *    по названию), треки — с годом выпуска в нужных границах;
 *  - Spotify: поиск `year:FROM-TO` (+ `genre:"…"`) со случайных мест выдачи — рекомендаций у Spotify
 *    в Development Mode нет, а поиск с фильтрами есть.
 */
export interface BlendPreset {
  id: string
  title: string
  subtitle: string
  from: number
  to: number
  /** Жанр в поиске Spotify (`genre:"…"`) */
  spotifyGenre?: string
  /** Станции Яндекса — первая существующая в каталоге */
  yandex: string[]
  /** Две цифры десятилетия ("80", "00", "20") — найти станцию эпохи по названию, если тега нет */
  epoch?: string
  /** Цвета плитки (градиент) — данные, как цвет станции у Яндекса */
  colors: [string, string]
}

export const BLEND_PRESETS: BlendPreset[] = [
  { id: '20s', title: 'Микс 20-х', subtitle: 'Хиты 2020-х', from: 2020, to: 2029, yandex: ['epoch:twenties', 'epoch:2020s'], epoch: '20', colors: ['#ff4f8b', '#7b2ff7'] },
  { id: '10s', title: 'Микс 10-х', subtitle: 'Хиты 2010-х', from: 2010, to: 2019, yandex: ['epoch:tens', 'epoch:2010s'], epoch: '10', colors: ['#00c2a8', '#2563eb'] },
  { id: '00s', title: 'Микс нулевых', subtitle: 'Хиты 2000-х', from: 2000, to: 2009, yandex: ['epoch:zeroes', 'epoch:noughties'], epoch: '00', colors: ['#f59e0b', '#db2777'] },
  { id: '90s', title: 'Микс 90-х', subtitle: 'Хиты 1990-х', from: 1990, to: 1999, yandex: ['epoch:nineties'], epoch: '90', colors: ['#8b5cf6', '#0ea5e9'] },
  { id: '80s', title: 'Микс 80-х', subtitle: 'Хиты 1980-х', from: 1980, to: 1989, yandex: ['epoch:eighties'], epoch: '80', colors: ['#ec4899', '#f97316'] },
  { id: 'pop-20s', title: 'Поп 20-х', subtitle: 'Поп 2020-х', from: 2020, to: 2029, spotifyGenre: 'pop', yandex: ['genre:pop', 'genre:ruspop'], colors: ['#f472b6', '#a855f7'] },
  { id: 'rap-20s', title: 'Хип-хоп 20-х', subtitle: 'Рэп 2020-х', from: 2020, to: 2029, spotifyGenre: 'hip-hop', yandex: ['genre:rap', 'genre:foreignrap', 'genre:rusrap'], colors: ['#facc15', '#ef4444'] },
  { id: 'electronic-20s', title: 'Электроника 20-х', subtitle: 'Электроника 2020-х', from: 2020, to: 2029, spotifyGenre: 'electronic', yandex: ['genre:electronics', 'genre:electronic', 'genre:dance'], colors: ['#22d3ee', '#6366f1'] },
  { id: 'rock-00s', title: 'Рок нулевых', subtitle: 'Рок 2000-х', from: 2000, to: 2009, spotifyGenre: 'rock', yandex: ['genre:rock', 'genre:alternative'], colors: ['#64748b', '#dc2626'] },
  { id: 'indie-10s', title: 'Инди 10-х', subtitle: 'Инди 2010-х', from: 2010, to: 2019, spotifyGenre: 'indie', yandex: ['genre:indie', 'genre:alternative'], colors: ['#84cc16', '#0d9488'] },
]

export const findBlend = (id: unknown) => BLEND_PRESETS.find(b => b.id === id) ?? null
