import type { DeviceCommand, DeviceQueue, DeviceState } from '../../shared/types/connect'
import type { Track } from '../../shared/types/track'
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Несколько пользователей: у каждого своя библиотека и свои подключённые сервисы.
 * Треки — общий кэш метаданных (снимок), чтобы библиотека открывалась без запросов к Spotify/Яндексу.
 * Время везде — unix ms, проставляется кодом. В Postgres это bigint: в обычный integer миллисекунды не помещаются.
 */

/** unix ms */
const ms = (name: string) => bigint(name, { mode: 'number' })

export const users = pgTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  avatarUrl: text('avatar_url'),
  /** «О себе» — короткая строка в профиле (видят друзья) */
  bio: text(),
  /** «Любимые треки»: своя обложка (null — коллаж) и описание */
  likedCoverUrl: text('liked_cover_url'),
  likedDescription: text('liked_description'),
  /** Лайк трека ставится и во втором сервисе (если трек там нашёлся) */
  likeBoth: boolean('like_both').notNull().default(false),
  role: text({ enum: ['owner', 'user'] }).notNull().default('user'),
  /** Какими сервисами пользуется: интерфейс прячет лишнее. null — оба (пользователи до появления настройки) */
  services: text({ enum: ['yandex', 'spotify', 'both'] }),
  /** Прошёл приветствие «Чем вы пользуетесь?» (у существующих пользователей — да) */
  onboarded: boolean().notNull().default(true),
  /** Приватность для друзей: не показывать, что сейчас играет */
  hideNowPlaying: boolean('hide_now_playing').notNull().default(false),
  /** Приватность для друзей: не показывать историю и топ исполнителей */
  privateHistory: boolean('private_history').notNull().default(false),
  /**
   * «Эпоха» сессий: «Выйти на других устройствах» повышает её — сессии (cookie) со старой эпохой
   * перестают действовать (cookie нельзя отозвать с сервера иначе). 0 — у всех старых сессий.
   */
  sessionEpoch: ms('session_epoch').notNull().default(0),
  createdAt: ms('created_at').notNull(),
})

/** Подключённые сервисы. Токены хранятся зашифрованными (AES-GCM, ключ из NUXT_SESSION_PASSWORD). */
export const accounts = pgTable('accounts', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text({ enum: ['spotify', 'yandex', 'lastfm'] }).notNull(),
  providerUserId: text('provider_user_id').notNull(),
  displayName: text('display_name'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: ms('expires_at'),
  /** Premium у Spotify / Плюс у Яндекса */
  premium: boolean().notNull().default(false),
  /** Выданные разрешения (Spotify) — чтобы знать, нужно ли переподключение */
  scope: text(),
  /** Последняя синхронизация лайков с сервисом (для двусторонней синхронизации) */
  likesSyncedAt: ms('likes_synced_at'),
  updatedAt: ms('updated_at').notNull(),
}, t => [
  uniqueIndex('accounts_provider_uid').on(t.provider, t.providerUserId),
  uniqueIndex('accounts_user_provider').on(t.userId, t.provider),
])

export const tracks = pgTable('tracks', {
  uid: text().primaryKey(), // "spotify:ID" | "yandex:ID:ALBUM"
  source: text({ enum: ['spotify', 'yandex'] }).notNull(),
  sourceId: text('source_id').notNull(),
  title: text().notNull(),
  artists: jsonb().$type<string[]>().notNull(),
  artistIds: jsonb('artist_ids').$type<string[]>(),
  album: text(),
  albumId: text('album_id'),
  coverUrl: text('cover_url'),
  durationMs: integer('duration_ms').notNull(),
  explicit: boolean().notNull().default(false),
  updatedAt: ms('updated_at').notNull(),
})

export const likes = pgTable('likes', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  trackUid: text('track_uid').notNull().references(() => tracks.uid, { onDelete: 'cascade' }),
  likedAt: ms('liked_at').notNull(),
}, t => [primaryKey({ columns: [t.userId, t.trackUid] })])

export const playlists = pgTable('playlists', {
  id: text().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  description: text(),
  /** Своя обложка: загруженная (/api/images/ID) или обложка одного из треков. null — коллаж из треков */
  coverUrl: text('cover_url'),
  createdAt: ms('created_at').notNull(),
  updatedAt: ms('updated_at').notNull(),
}, t => [index('playlists_user_idx').on(t.userId)])

export const playlistTracks = pgTable('playlist_tracks', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  playlistId: text('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  trackUid: text('track_uid').notNull().references(() => tracks.uid, { onDelete: 'cascade' }),
  position: integer().notNull(),
  addedAt: ms('added_at').notNull(),
}, t => [index('playlist_tracks_playlist_idx').on(t.playlistId, t.position)])

export const history = pgTable('history', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  trackUid: text('track_uid').notNull().references(() => tracks.uid, { onDelete: 'cascade' }),
  playedAt: ms('played_at').notNull(),
}, t => [index('history_user_played_idx').on(t.userId, t.playedAt)])

/** Устройства пользователя (каждый браузер/PWA) для «Подключения устройств»: кто онлайн и что играет. */
export const devices = pgTable('devices', {
  id: text().primaryKey(), // случайный id браузера (localStorage)
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  kind: text({ enum: ['computer', 'phone', 'tablet', 'speaker', 'tv'] }).notNull(),
  lastSeen: ms('last_seen').notNull(),
  state: jsonb().$type<DeviceState>(),
  /** Очередь на момент последней синхронизации — чтобы продолжить с того же места (в т.ч. на другом устройстве) */
  queue: jsonb().$type<DeviceQueue>(),
}, t => [index('devices_user_idx').on(t.userId, t.lastSeen)])

/** Команды для устройств (пауза, перенос воспроизведения…) — забираются при следующей синхронизации. */
export const deviceCommands = pgTable('device_commands', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  payload: jsonb().$type<DeviceCommand>().notNull(),
  createdAt: ms('created_at').notNull(),
}, t => [index('device_commands_device_idx').on(t.deviceId, t.id)])

/**
 * Собранные подборки («Микс дня», «Открытия недели»). Хранятся в базе, а не в памяти инстанса,
 * чтобы на всех устройствах был один и тот же набор до следующего периода.
 */
export const mixes = pgTable('mixes', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** daily | discover | station:genre:rock (плейлист по станции Яндекса, genre-mixes.ts). В базе — просто text */
  kind: text().$type<'daily' | 'discover' | `station:${string}`>().notNull(),
  /** Период, на который собран микс: "2026-11-13" (день) или "2026-W46" (неделя) */
  period: text().notNull(),
  tracks: jsonb().$type<Track[]>().notNull(),
  createdAt: ms('created_at').notNull(),
}, t => [primaryKey({ columns: [t.userId, t.kind] })])

/** «Вам прислали»: трек, отправленный другом прямо на сайте. */
export const shares = pgTable('shares', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  fromUserId: text('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUserId: text('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  track: jsonb().$type<Track>().notNull(),
  note: text(),
  createdAt: ms('created_at').notNull(),
  seenAt: ms('seen_at'),
}, t => [index('shares_to_idx').on(t.toUserId, t.createdAt), index('shares_from_idx').on(t.fromUserId, t.createdAt)])

/**
 * Подписки на системные уведомления (Web Push) — по одной на устройство/браузер.
 * endpoint — адрес push-сервиса браузера (уникален), p256dh/auth — ключи шифрования содержимого.
 * Подписку, которую push-сервис отверг (404/410), удаляем при отправке.
 */
export const pushSubscriptions = pgTable('push_subscriptions', {
  endpoint: text().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  p256dh: text().notNull(),
  auth: text().notNull(),
  /** «iPhone · Safari» — видно в настройках */
  device: text(),
  createdAt: ms('created_at').notNull(),
}, t => [index('push_user_idx').on(t.userId)])

/**
 * Вход с другого устройства: новое устройство показывает код (и QR), вошедшее — подтверждает.
 * token — секрет нового устройства для опроса (храним sha-256), code — 6 цифр для человека.
 */
export const loginCodes = pgTable('login_codes', {
  tokenHash: text('token_hash').primaryKey(),
  code: text().notNull(),
  /** «iPhone · Safari» — чтобы подтверждающий видел, что за устройство */
  device: text(),
  createdAt: ms('created_at').notNull(),
  expiresAt: ms('expires_at').notNull(),
  approvedBy: text('approved_by').references(() => users.id, { onDelete: 'cascade' }),
  usedAt: ms('used_at'),
}, t => [index('login_codes_code_idx').on(t.code)])

/** Ключи входа (passkeys, Face ID / Touch ID): публичная часть, сам ключ — на устройстве / в iCloud Keychain. */
export const passkeys = pgTable('passkeys', {
  /** credential id (base64url) */
  id: text().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  counter: bigint({ mode: 'number' }).notNull().default(0),
  backedUp: boolean('backed_up').notNull().default(false),
  transports: jsonb().$type<string[]>(),
  /** «iPhone · Safari» — где создан */
  name: text(),
  createdAt: ms('created_at').notNull(),
  lastUsedAt: ms('last_used_at'),
}, t => [index('passkeys_user_idx').on(t.userId)])

/** Одноразовые «вызовы» WebAuthn (между двумя запросами церемонии; в памяти нельзя — на Vercel разные инстансы) */
export const webauthnChallenges = pgTable('webauthn_challenges', {
  attemptId: text('attempt_id').primaryKey(),
  challenge: text().notNull(),
  expiresAt: ms('expires_at').notNull(),
})

/**
 * Загруженные картинки (аватары, обложки плейлистов). Отдельного файлового хранилища нет — храним в базе:
 * браузер сам уменьшает фото до ~600 px JPEG (десятки КБ). Отдаются /api/images/:id с долгим кэшем
 * (у новой картинки — новый id, поэтому кэш не мешает).
 */
export const images = pgTable('images', {
  id: text().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mime: text().notNull(),
  /** base64 без префикса data: */
  data: text().notNull(),
  createdAt: ms('created_at').notNull(),
}, t => [index('images_user_idx').on(t.userId)])

/**
 * «Зеркальные» лайки: трек лайкнут на сайте из одного сервиса, а его копия — во втором.
 * Нужна, чтобы сверка лайков не притащила копию на сайт вторым экземпляром и чтобы снятие лайка снимало обе.
 * mirrorKey — как ключ сверки (id трека Яндекса без альбома / id Spotify), mirrorId — полный sourceId.
 */
export const likeMirrors = pgTable('like_mirrors', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  trackUid: text('track_uid').notNull(),
  mirrorSource: text('mirror_source', { enum: ['yandex', 'spotify'] }).notNull(),
  mirrorKey: text('mirror_key').notNull(),
  mirrorId: text('mirror_id').notNull(),
  createdAt: ms('created_at').notNull(),
}, t => [primaryKey({ columns: [t.userId, t.mirrorSource, t.mirrorKey] }), index('like_mirrors_track_idx').on(t.userId, t.trackUid)])
