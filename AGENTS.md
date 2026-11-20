# Audio — руководство для ИИ-агентов

Веб-плеер музыки из **Яндекс Музыки** и **Spotify** в одном месте: общая библиотека, единый поиск, радио, синхронизация между устройствами, PWA. Несколько пользователей (личный сайт + друзья по коду приглашения).

Язык проекта — **русский**: интерфейс, комментарии в коде, сообщения об ошибках (`createError({ message })`). Идентификаторы — на английском.

## Стек

- **Nuxt 4** (Vue 3, Nitro), TypeScript. Деплой — **Vercel**.
- **SCSS** + свои компоненты. UI-библиотек и Tailwind **нет** — не добавлять.
- **Feature-Sliced Design** в `src/`.
- **Drizzle ORM + Postgres**: прод — **Neon** (`DATABASE_URL`), локально — **PGlite** в `.data/pglite` (ничего ставить не нужно).
- `nuxt-auth-utils` — сессии в зашифрованной cookie.
- Иконки — `lucide-vue-next` (явный импорт), шрифт Inter (`@fontsource-variable/inter`).

## Команды

```bash
npm run dev          # сначала создаёт/обновляет таблицы локальной PGlite, потом nuxt dev (http://127.0.0.1:3000)
npm run build        # прод-сборка (.output/)
npx nuxt typecheck   # проверка типов — через Golar (TypeScript 7; vue-tsc с ним НЕ работает)
npm run db:push      # применить схему: в Neon, если задан DATABASE_URL, иначе в локальную PGlite
npm run db:studio    # Drizzle Studio
```

После любых изменений: `npx nuxt typecheck`, `npm run check:autoimport` и `npm run build` должны проходить без ошибок; изменённые серверные маршруты — дёрнуть настоящим запросом на собранном сервере.

## Структура

```
src/                      # srcDir Nuxt, слои FSD
  app.vue                 # точка входа (тонкая): тема + NuxtLayout/NuxtPage
  app/                    # слой app: routes/ (файловые маршруты Nuxt), layouts/, middleware/, plugins/, styles/
  pages/                  # FSD-страницы (home, search, library, liked, playlist, album, artist, remote-playlist, stats, settings, login)
  widgets/                # player-bar, now-playing, track-list, collection-view, track-shelf, app-navigation, ambient-backdrop
  features/               # like-track, add-to-playlist, track-actions, search-tracks, start-wave, device-picker,
                          # player-controls, sleep-timer, hotkeys, import-likes, import-playlists, manage-playlist, switch-theme,
                          # auth-by-yandex, auth-by-spotify, auth-by-code, auth-by-passkey, track-info, connect-lastfm
  entities/               # player (очередь, движки, подключение устройств), track, library, album, artist,
                          # spotify-account, preferences
  shared/                 # ui/ (Ui*-компоненты), lib/ (format, device, cached-fetch, tilt), styles/ (токены, темы, абстракции)
server/
  api/                    # маршруты Nitro (см. ниже)
  utils/                  # вся логика сервера (автоимпорт в Nitro)
  middleware/             # auth.ts — закрывает /api/*, 0.dev-host.ts — localhost → 127.0.0.1 в dev
  db/schema.ts            # схема Drizzle (pg-core)
shared/types/             # типы, общие для сервера и клиента (автоимпорт): Track, Collection, HomeFeed, DeviceState…
scripts/db-push.mjs       # обёртка над drizzle-kit push (используется в dev и db:push)
public/                   # manifest.webmanifest, sw.js (service worker), icons/
```

### Правила FSD (соблюдать)

- Слои импортируют только **нижележащие**: `app → pages → widgets → features → entities → shared`.
- **Соседние слайсы одного слоя не импортируют друг друга** (feature ↛ feature, widget ↛ widget). Если нужно составить — делать это уровнем выше или через слот (пример: `CollectionView` принимает список треков слотом, а не импортирует `TrackList`).
- Импорт слайса — только через его `index.ts` (public API): `import { TrackRow } from '@/entities/track'`.
- **Автоимпорт компонентов выключен** (`components: { dirs: [] }`): компоненты импортируются явно. Vue/Nuxt API (`ref`, `useFetch`…) автоимпортируются как обычно.
- Маршрут в `src/app/routes/*.vue` только подключает страницу из `src/pages` и задаёт `useHead`/`definePageMeta`.
- Внутренние компоненты слайса могут импортировать друг друга относительными путями (`./ArtistLinks.vue`).

## Стили и UI

- SCSS-абстракции (`src/shared/styles/abstracts/_index.scss`) **автоматически** подключаются в каждый `<style lang="scss">`: миксины `up(bp)`, `down(bp)`, `hover` (только для мыши), `focus-ring`, `truncate`, `visually-hidden`, `reset-button`, `glass($strong)`, `when-light`; карта `$accents`.
- Цвета — только через CSS-переменные (`--c-bg`, `--c-text`, `--c-text-muted`, `--c-surface*`, `--c-accent`, `--c-accent-soft`, `--c-panel`, `--c-glass-border`…), размеры — `--space-*`, `--radius-*`, `--fs-*`. Сырые цвета в компонентах не писать.
- Темы: `<html data-theme="system|dark|light" data-accent="lavender|sage|peach|sky">`, хранятся в cookie (SSR без мигания). Новые цвета добавлять в оба миксина `dark`/`light` в `_themes.scss`.
- Визуальный стиль: размытый «эмбиент» из обложки текущего трека на фоне + полупрозрачные стеклянные панели (`@include glass`).
- Ключи Sass-карт — в кавычках (`'lavender'`), иначе Sass считает их цветами.
- В scoped-стилях `:global(...)` не нужен для предков: Vue добавляет `data-v` только к последнему селектору (`:root[data-theme='light'] .x` работает).
- Мобильная версия — обязательна (пользуются с телефона). **Любой** `display: grid` с колонкой, где есть обрезаемый текст или горизонтальная лента, — `grid-template-columns: minmax(0, 1fr)` (не `1fr` и не без шаблона): иначе колонка растягивается по содержимому и страница листается вбок (особенно заметно в PWA на iPhone). У `.shell__main` стоит `overflow-x: hidden` как страховка — она прячет симптом, а не причину; при проверке смотреть `main.scrollWidth - main.clientWidth`. **Порядок правил важен:** `@include down(md) { display: none }` должен стоять ПОСЛЕ блока, где задан `display` того же элемента (одинаковая специфичность — побеждает последнее правило). Мобильные переопределения удобно собирать в один `@include down(md) { … }` в конце стилей компонента.
- На тач-экранах ссылки внутри строк/карточек треков отключены (`pointer-events: none` при `pointer: coarse`): тап всегда запускает трек. Брейкпоинты: sm 480, md 768, lg 1024, xl 1280. Учитывать `env(safe-area-inset-*)`.
- Иконочные кнопки — `UiIconButton` с обязательным `label` (доступность). Цели нажатия на тач-экранах — не меньше 32×32 (`@media (pointer: coarse)`).
- Обложки — через `UiCover` / `coverOfSize(url, cssPx)` из `@/shared/lib`: у Яндекса размер в адресе (`…/600x600`), в списках грузим маленькие; размытым фонам хватает 100 px.
- `UiInput autofocus` фокусирует поле и при переходе внутри сайта (только `pointer: fine`): иначе набранный текст уходит на страницу, а пробел — горячая клавиша паузы.

## Модель данных

- `Track` (`shared/types/track.ts`) — единый формат трека из любого источника. `uid = "<source>:<sourceId>"`; для Яндекса `sourceId = "trackId:albumId"`. Есть `artistIds` (параллельно `artists`) для ссылок.
- Таблицы (`server/db/schema.ts`): `users`, `accounts` (подключённые сервисы, токены **зашифрованы** AES-GCM ключом из `NUXT_SESSION_PASSWORD`), `tracks` (общий кэш метаданных), `likes`, `playlists`, `playlist_tracks`, `history`, `devices`, `device_commands`, `mixes`, `shares`, `push_subscriptions`, `login_codes`, `passkeys`, `webauthn_challenges`, `images`, `like_mirrors`, `blocked_artists`, `skips`.
- **Время везде — unix-миллисекунды**, проставляется кодом (`Date.now()`), в Postgres — `bigint` (`mode: 'number'`). Не использовать `integer` для времени — переполнится.
- `count(...)` в сыром SQL приводить к `::int`, иначе Postgres вернёт строку.
- Схема меняется в `server/db/schema.ts`; локально применится сама при `npm run dev`, в Neon — `npm run db:push`.

## Сервер (Nitro)

- Все `/api/*` требуют входа (`server/middleware/auth.ts`), кроме маршрутов входа. id пользователя — `await requireUserId(event)`.
- **Сессия** — только через `startSession(event, user)` (`server/utils/session.ts`): кладёт в cookie `user` и `epoch` (= `users.session_epoch`). «Выйти на других устройствах» (`/api/me/logout-others`) повышает эпоху; middleware сверяет её (кэш 60 с) и сразу отвечает 401 / редиректом на `/login` — **не** просто `clearUserSession` (дальше в том же запросе сессия заново читается из cookie запроса и «оживает»). Если схема не применена — эпоха 0, сайт работает.
- Данные пользователя всегда фильтровать по `userId` (чужие плейлисты → 404).
- Ошибка «сервис не подключён» — **409**, не 401 (401 на клиенте значит «сессия сайта истекла»).
- Трек из тела запроса — только через `readTrackBody(event)` (валидация).
- Внешние API ходят только через утилиты: `ymFetch/ymGet/ymPost/ymPostForm` (Яндекс), `spotifyFetch` (Spotify) — они сами берут токен пользователя из БД и обновляют его.
- Кэш в памяти инстанса: `cached(key, ttlMs, fn)`; ключи пользователя — с префиксом `u:<userId>:`, сброс — `invalidateUserCache(userId)` (вызывается при подключении/отключении сервисов).

### Источники музыки

- **Яндекс Музыка — неофициальный API** (`server/utils/yandex.ts`, `yandex-feed.ts`): константы, подписи (`get-file-info` HMAC, `download-info` md5, тексты) и OAuth-данные официального Android-клиента сверены с `github.com/MarshalX/yandex-music-api`. Вход — device flow по коду (`ya.ru/device`), он же даёт токен Музыки. Ответы разбирать «мягко» (формат может меняться): если блок не распознан — не показывать, а не падать.
- Поток Яндекса: сервер отдаёт **302 на подписанный URL CDN**, звук идёт из браузера напрямую, не через Vercel. Кодеки — только поддерживаемые `<audio>` везде (aac/mp3), без flac.
- **Spotify — Web API + Web Playback SDK** (Development Mode, правила с февраля 2026): поиск `limit ≤ 10`; `/playlists/{id}/items` (не `/tracks`) и только свои плейлисты; библиотека — `PUT/DELETE /me/library?uris=…`; рекомендации, похожие, топ-треки исполнителя — **недоступны**. Не более 5 пользователей, каждого добавлять в Dashboard → User Management. Воспроизведение — только Premium и только в десктопных браузерах.
- Подбор музыки (радио, «Моя волна», станции, «похожее») — **только Яндекс** (`/rotor/...`).
- Трек Spotify там, где SDK недоступен (телефон, блокировки), играет через совпадение в Яндексе: `findYandexMatch` / `/api/yandex/match-stream`.
- Тексты: Яндекс → LRCLIB. Last.fm — скробблинг (`server/utils/lastfm.ts`).
- **«Чем я пользуюсь»** (`users.services`: yandex | spotify | both, в сессии `user.services`; null/нет — both): новый пользователь получает сервис, через который вошёл; подключил второй — `both`. Сервер берёт сервисы для подборок/поиска через `activeConnections()` (подключённые ∩ выбранные). Клиент — `useMusicServices()` из `@/entities/preferences`: прячет лишнее (`hasYandex` / `hasSpotify`), при `yandex` плеер играет всё через Яндекс (`setMusicServices`). Новые места, где упоминается сервис, проверять по этим флагам — друзья могут пользоваться без Spotify.
- **Выделение текста выключено** во всём приложении (`body { user-select: none; -webkit-touch-callout: none }`), кроме полей ввода и `.selectable` (ссылка-приглашение, код входа).
- **Окна (`UiDialog`) на телефоне** смахиваются вниз; касания внутри окна не уходят наружу (`.stop`) — иначе жест ловила карточка «Сейчас играет» и сворачивалась, оставляя невидимое модальное окно (страница «умирала»). Карточка при сворачивании сама закрывает свои окна; `UiDialog` закрывается при размонтировании.
- Поля ввода на тач-экранах — шрифт ≥ 16 px (`_base.scss`), иначе iPhone приближает страницу при фокусе. Масштабирование не запрещаем.

## Клиент

- `src/entities/player/model/player.ts` — модульный синглтон (состояние меняется только на клиенте). Внешний API — `usePlayer()`.
- Два движка: `lib/yandex-engine.ts` (два `<audio>`: предзагрузка следующего трека, кроссфейд) и `lib/spotify-engine.ts` (Web Playback SDK). Выбор — `pickEngine()`.
- **iOS:** звук стартует только синхронно в обработчике жеста. Не ставить `await` перед `play()`; если сначала нужен запрос — вызвать `unlock()` в клике (пример: `startRadio`).
- Media Session (экран блокировки) — `lib/media-session.ts`.
- Недоступный трек (ошибка загрузки, `onError(msg, skippable=true)`) пропускается автоматически, не больше 3 подряд.
- **Центрирование фиксированных плашек** (тосты и т.п.): `left/right` с отступами + `justify-items: center`, **не** `left: 50%; transform: translateX(-50%)` — иначе ширина ограничена половиной экрана и текст ломается по слову в строку (так было с «Играет альбом «…»»).
- «Сведения о треке» — `features/track-info` (`/api/tracks/info`). Жанры Яндекса приходят кодами — `genreLabel` из `@/shared/lib`.
- `player.unlock()` — вызвать в клике, если перед `playQueue` нужен запрос («Перемешать всё», «Случайный альбом» в библиотеке), иначе iOS не даст звук.
- **Без «прыжков» (CLS)** — проверено замером `layout-shift` по всем страницам: у `content-visibility: auto` `contain-intrinsic-size` — размер **без отступов** (у `TrackRow` 48, а не 56); данные, без которых раскладка меняется (ключи входа в настройках), — `await useCachedFetch(..., { lazy: false })` (просто `lazy: false` без `await` переход не задерживает); скелетон — той же высоты, что содержимое; шрифт — предзагрузка `woff2` + `Inter Fallback` с метриками Inter.
- `initPlayer` запускается в хуке `app:suspense:resolve` (после гидрации): восстановленный трек и громкость меняют разметку — раньше гидрации будет mismatch.
- Данные страниц — `useCachedFetch(url, { key, ttl })` из `@/shared/lib` (на `useAsyncData`): **lazy** — переход на страницу не ждёт данных (страница со скелетом сразу); кэш между переходами; один запрос на ключ (`inflight`) — его подхватывает и предзагрузка. На SSR — `useRequestFetch` (иначе нет cookie сессии → 401). После изменения — `refreshNuxtData(key)`; смена реактивного адреса тоже грузит заново.
- **После изменения данных — `invalidateData(keys)`** из `@/shared/lib`, не голый `refreshNuxtData`: тот обновляет только то, что на экране, а закрытые страницы оставались «свежими» по ttl (новая обложка плейлиста появлялась только после перезагрузки). `invalidateData` сбрасывает отметку свежести и обновляет открытое.
- **`backdrop-filter` — писать только стандартное свойство** (`-webkit-` добавит сборщик). Если писать оба, минификатор склеивал их в один `-webkit-backdrop-filter`, и в Chrome/Firefox стекло было без размытия. Своё полупрозрачное стекло (не `glass`) — с `@include solid-without-blur` после `background`: без поддержки размытия фон становится плотным.
- **Сбои внешних сервисов не должны давать 500.** `oauth.yandex.ru` из Vercel иногда не отвечает: `oauthPost` повторяет один раз при обрыве/5xx (`isNetworkFailure`), `/api/auth/yandex/device` → 503 с понятным текстом, опрос входа при сбое — «ещё ждём». `/api/spotify/play`: 404/403/5xx повторяются один раз, дальше `data.code` — `device-gone` (404), `spotify-restricted` (403 «Restriction violated» → 409), `spotify-unavailable` (5xx → 503); клиент на всех трёх играет трек через Яндекс.
- Двойное касание не приближает страницу: `html { touch-action: manipulation }` (масштаб двумя пальцами работает).
- **Минификатор CSS (сборка) склеивает «родственные» свойства**: `translate` рядом с `transform` в одном правиле выкидывается (пластинка съезжала вниз), из `backdrop-filter` + `-webkit-backdrop-filter` оставался только `-webkit-`. Сдвиг вместе с другим преобразованием — одним `transform: translate(x, y) …`; после правок стилей смотреть итоговый CSS в `.output/public/_nuxt/*.css`.

## Подробности по разделам

**Перед работой с разделом прочитай его файл** — там устройство, решения и грабли, на которые уже наступали. Нашёл новое — дописывай туда, а не сюда (здесь — только общие правила).

- [`docs/features/recommendations.md`](docs/features/recommendations.md) — **Подборки и радио**: Миксы дня/недели, умные плейлисты, жанры, станции, «Моя волна», миксы по годам, фильтр вкуса, пропуски.
- [`docs/features/now-playing.md`](docs/features/now-playing.md) — **Карточка «Сейчас играет»**: Карточка и мини-плеер, переходы View Transitions, текст и караоке, полноэкранный режим, пластинки, визуализатор, видео, PiP, очередь «Далее».
- [`docs/features/playback.md`](docs/features/playback.md) — **Воспроизведение и устройства**: Качество, кроссфейд, кэш треков в SW, быстрое листание, Spotify «Device not found», подключение устройств, «продолжить с того же места», скорость.
- [`docs/features/library.md`](docs/features/library.md) — **Библиотека, лайки, плейлисты, поиск**: Лайки (синхронизация, зеркала), обложки и описание плейлистов, импорт/экспорт, поиск (по тексту, ⌘K, недавние), выбор нескольких, «Отменить».
- [`docs/features/social.md`](docs/features/social.md) — **Друзья и «Поделиться»**: Друзья, профиль, push-уведомления, «Слушать вместе», ссылки на песню /t/…, «Поделиться».
- [`docs/features/auth.md`](docs/features/auth.md) — **Вход и приветствие**: Вход с другого устройства, passkeys, /welcome, страница входа-лендинг.
- [`docs/features/ui.md`](docs/features/ui.md) — **Каркас, навигация и анимации**: Нижнее меню, «парящий» плеер, загрузочный экран, анимации страниц и списков, v-reveal, шапка коллекции, предзагрузка по намерению, горячие клавиши, настройки.

## Окружение

```
NUXT_SESSION_PASSWORD   обязательно; 32+ символов; НЕ менять после запуска (им зашифрованы токены в БД)
NUXT_INVITE_CODE        код приглашения (первый пользователь — владелец, без кода)
DATABASE_URL            Neon; пусто → локальная PGlite (.data/pglite)
NUXT_SPOTIFY_CLIENT_ID / NUXT_SPOTIFY_CLIENT_SECRET   по желанию
NUXT_LASTFM_API_KEY / NUXT_LASTFM_SECRET               по желанию
NUXT_GENIUS_TOKEN       по желанию: Client Access Token с genius.com/api-clients — точнее «Поиск по тексту»
NUXT_PUBLIC_VAPID_PUBLIC_KEY / NUXT_VAPID_PRIVATE_KEY   по желанию: уведомления (npx web-push generate-vapid-keys); НЕ менять — старые подписки перестанут работать
NUXT_VAPID_SUBJECT      по желанию: mailto:… или https://… — контакт для push-сервисов
```

## Подводные камни

- Dev-сервер слушает **127.0.0.1** (Spotify не принимает `localhost` в Redirect URI; cookie у localhost и 127.0.0.1 разные). Redirect URI Spotify: `<origin>/api/auth/spotify/callback`.
- Nuxt превращает числовые env-значения в числа — приводить к строке (`String(...)`).
- PGlite — один процесс на папку: не запускать `db:push` и dev-сервер одновременно на одной `.data/pglite`.
- Service worker (`public/sw.js`) регистрируется только в прод-сборке; при изменении стратегии кэширования повышать `VERSION`. `/_nuxt/builds/` он **не кэширует** — иначе автообновление не узнает о новой сборке.
- **iPhone PWA и статус-бар:** `apple-mobile-web-app-status-bar-style` — только `default` (непрозрачный). С `black-translucent` iOS 26 даёт установленному приложению окно на высоту статус-бара короче экрана, снизу остаётся полоса, которую не закрасить ни CSS, ни JS (WebKit bug 301108; проверено — `100dvh`, `fixed inset: 0`, растягивание по `screen.height` не помогают, низ обрезается). Мета-теги `apple-mobile-web-app-*` фиксируются при установке — после изменения приложение нужно удалить с экрана «Домой» и добавить заново. `theme-color` на статус-бар в iOS 26 не влияет. Каркас `.shell` — `position: fixed; inset: 0`, полноэкранные слои — `inset: 0`/`height: 100%`, не `100dvh`.
- **Версия и автообновление** (`plugins/update.client.ts`): версия — `package.json` + коммит Vercel (`runtimeConfig.public.appVersion/commit/builtAt`, видно в настройках). Новая сборка проверяется каждые 5 мин (`experimental.checkOutdatedBuildInterval`) и при возврате на вкладку; применяется: в фоне без музыки — тихая перезагрузка, на сайте без музыки — при следующем переходе, при играющей музыке — уведомление «Обновить» (музыку не прерываем). При заметных изменениях повышать `version` в package.json.
- Файлы `.env*` агентам недоступны — список переменных сообщать пользователю текстом.
- Не трогать `.data/` пользователя в тестах (первый созданный пользователь станет владельцем) — тестовые базы держать во временной папке.
- **Ловушка автоимпорта (unimport):** имя, за которым сразу идёт приведение типа — `(NAME as Type)` — автоимпорт **не распознаёт**: в рантайме `ReferenceError: NAME is not defined`, typecheck молчит. Так дважды ломался сервер (`YANDEX_QUALITIES` → воспроизведение, `SMART_KINDS`). Вместо приведения — функция-проверка (`isSmartKind`, `parseYandexQuality`) или явный `import`. Проверка: `npm run check:autoimport`.
- **Заголовки ответа — только ASCII.** Кириллица в `setHeader` (даже в `Server-Timing` desc) — `Invalid character in header content`, маршрут падает (так ломалось воспроизведение). Тестовая база без Яндекса до таких строк не доходит (409 раньше) — проверять глазами.
- **Диагностика:** `/api/debug/status` (для вошедших) — применена ли схема базы (`db:push`), отвечают ли Яндекс и Spotify. Ошибки потоков пишутся в лог с понятной причиной (`withExplainedErrors`).

## Проверка изменений

- Типы и сборка: `npx nuxt typecheck`, `npm run build`.
- UI проверялся через Playwright (WebKit ≈ Safari, в т.ч. `devices['iPhone 15']`) на собранном сервере `node .output/server/index.mjs` с временной базой: Playwright ставить во временную папку, не в проект. Сессию для теста можно создать через `h3.useSession` с `name: 'nuxt-session'` и тем же `NUXT_SESSION_PASSWORD`.
- Перезапуск тестового сервера — `lsof -ti tcp:PORT -sTCP:LISTEN | xargs kill` (без `-sTCP:LISTEN` убьётся и браузер/клиент с соединением к порту — «слетают» сессии и т.п.).
- Заглушки `page.route('**/api/yandex/stream/**')` подменяют серверный обработчик — после изменений в нём обязательно дёрнуть реальный маршрут (`curl` на собранный сервер: без Яндекса ожидается 409, не 500).
- Сгенерированные звуки WAV + `page.route('**/api/yandex/stream/**')` позволяют проверить переходы/кроссфейд без реального Яндекса.

## Agent skills

### Issue tracker

Задачи — в GitHub Issues репозитория `hell-soon/autio-player` (через `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Стандартные пять меток: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` в корне (создаются по мере надобности). See `docs/agents/domain.md`.
