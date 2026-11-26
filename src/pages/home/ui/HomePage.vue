<script setup lang="ts">
import { RefreshCw, Settings } from 'lucide-vue-next'
import { IncomingShares } from '@/features/share-with-friend'
import { ArtistRadioRow, BlendTiles, StationChips, WaveCard } from '@/features/start-wave'
import { FriendAvatar, useFriends } from '@/entities/friend'
import { usePlayer } from '@/entities/player'
import { PlaylistCard, useLikedCovers, useLikes, usePlaylists } from '@/entities/library'
import { useMusicServices } from '@/entities/preferences'
import { AlbumCard } from '@/entities/album'
import { TrackList } from '@/widgets/track-list'
import { GenreTile, useGenres } from '@/entities/station'
import { TrackShelf } from '@/widgets/track-shelf'
import { plural, useCachedFetch } from '@/shared/lib'
import { UiButton, UiIconButton } from '@/shared/ui'

const { user } = useUserSession()
const { data: playlists } = usePlaylists()
const likes = useLikes()
// «Только Spotify»: подбор музыки (волна, станции) работает через Яндекс — такие блоки не показываем
const music = useMusicServices()

// Подборки кэшируются (на сервере 10 мин, на клиенте 10 мин) — переходы по вкладкам мгновенные.
const { data: feed, status } = useCachedFetch<HomeFeed>('/api/home', { key: 'home:feed', ttl: 10 * 60_000 })
const f = computed(() => feed.value)

const refreshing = ref(false)
async function refreshFeed() {
  refreshing.value = true
  try {
    feed.value = await $fetch<HomeFeed>('/api/home', { query: { fresh: 1 } })
  }
  finally {
    refreshing.value = false
  }
}

// «Вышло новое» у любимых исполнителей — отдельным запросом (несколько обращений к Яндексу), не тормозит главную
const { data: releases } = useAsyncData(
  'home:releases',
  () => (f.value?.connections.yandex ? $fetch<ReleaseInfo[]>('/api/releases') : Promise.resolve([] as ReleaseInfo[])),
  { default: () => [] as ReleaseInfo[], watch: [() => f.value?.connections.yandex], lazy: true, server: false },
)
function releaseLabel(r: ReleaseInfo) {
  const days = Math.floor((Date.now() - Date.parse(r.releaseDate)) / 86_400_000)
  const when = days <= 0 ? 'сегодня' : days === 1 ? 'вчера' : days < 7 ? `${days} ${plural(days, ['день', 'дня', 'дней'])} назад` : new Date(r.releaseDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return `${r.kindLabel} · ${r.artists[0] ?? ''} · ${when}`
}

// «Похоже на …» — от последнего трека.
const seed = computed(() => f.value?.recent[0])
const { data: similar } = useAsyncData(
  'home:similar',
  () => (f.value?.connections.yandex && seed.value
    ? $fetch<Track[]>('/api/radio', { method: 'POST', body: { station: 'similar', seed: seed.value } })
    : Promise.resolve([] as Track[])),
  { default: () => [] as Track[], watch: [() => seed.value?.uid], lazy: true, server: false },
)

const greeting = computed(() => {
  const h = new Date().getHours()
  const g = h < 6 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'
  const name = user.value?.name?.split(' ')[0]
  return name ? `${g}, ${name}` : g
})

const count = (n: number) => `${n} ${plural(n, ['трек', 'трека', 'треков'])}`
const spotifyOwn = computed(() => f.value?.spotifyPlaylists.filter(p => p.owned) ?? [])
const loading = computed(() => status.value === 'pending' && !f.value)

// «Открытия недели» подбираются и без Яндекса (Last.fm Similar от Spotify) — показываем все миксы.
const mixes = computed(() => f.value?.mixes ?? [])
// «Жанры дня»: 8 станций Яндекса (каждый день другие) — плитка открывает плейлист станции
const { data: genres } = useGenres(music.hasYandex.value)
const showOwn = computed(() => !(f.value?.personal.length || mixes.value.length))
const showMore = ref(false)

// Быстрое действие с иконки приложения: /?start=wave — сразу «Моя волна».
// Браузер может не дать запустить звук без нажатия — тогда плеер подскажет «нажмите Играть».
const route = useRoute()
const router = useRouter()
onMounted(() => {
  if (route.query.start !== 'wave') return
  router.replace({ query: {} })
  usePlayer().startWave()
})

// «Друзья слушают» — только те, у кого играет прямо сейчас
const { data: friends } = useFriends()
const listening = computed(() => friends.value.filter(f => f.nowPlaying?.isPlaying))
// Обложка «Любимые треки» — коллаж из последних любимых песен
const { data: likedCovers } = useLikedCovers()
</script>

<template>
  <div class="home">
    <header class="home__head">
      <h1 class="home__greeting">
        {{ greeting }}
      </h1>
      <UiIconButton label="Обновить подборки" variant="filled" size="sm" :disabled="refreshing" @click="refreshFeed">
        <RefreshCw :class="{ spin: refreshing }" />
      </UiIconButton>
    </header>

    <!-- Без Яндекса волны нет — вместо неактивной карточки ниже один понятный блок «Подключите» -->
    <WaveCard v-if="!f || f.connections.yandex || f.connections.spotify" :disabled="!f" />
    <!-- Станции — та же «волна», только по жанру/настроению: сразу под ней, без отдельного заголовка -->
    <StationChips v-if="f?.stations.length" :stations="f.stations" class="home__stations" />

    <section v-if="listening.length" class="home__section">
      <h2 class="home__heading">
        Друзья слушают
        <NuxtLink to="/friends" class="home__more-link">Все →</NuxtLink>
      </h2>
      <div class="home__friends">
        <NuxtLink v-for="fr in listening" :key="fr.id" :to="`/friends/${fr.id}`" class="friend-now">
          <FriendAvatar :name="fr.name" :src="fr.avatarUrl" :size="44" live />
          <span class="friend-now__text">
            <span class="friend-now__name">{{ fr.name }}</span>
            <span class="friend-now__track">{{ fr.nowPlaying!.track.title }} — {{ fr.nowPlaying!.track.artists[0] }}</span>
          </span>
        </NuxtLink>
      </div>
    </section>

    <!-- Новое от друзей — сразу видно; прочитанным помечается на странице «Друзья» -->
    <IncomingShares only-unseen :limit="3">
      <template #title>
        <h2 class="home__heading">
          Вам прислали
          <NuxtLink to="/friends" class="home__more-link">Все →</NuxtLink>
        </h2>
      </template>
    </IncomingShares>

    <div class="home__collections" :class="{ 'has-blends': f?.connections.yandex || f?.connections.spotify }">
      <section class="home__section">
        <h2 class="home__heading">
          Собрано для вас
          <NuxtLink to="/library" class="home__more-link">Библиотека →</NuxtLink>
        </h2>
        <div class="home__collection-list">
          <PlaylistCard
            v-for="m in mixes"
            :key="m.kind"
            row
            :to="`/collection/mix:${m.kind}`"
            :title="m.title"
            :subtitle="m.count ? `${count(m.count)} · ${m.description}` : m.description"
            :covers="m.covers.slice(0, 1)"
          />
          <PlaylistCard
            v-for="p in f?.personal ?? []"
            :key="p.id"
            row
            :to="`/collection/${p.id}`"
            :title="p.title"
            :subtitle="p.description"
            :covers="p.coverUrl ? [p.coverUrl] : []"
          />
          <div v-for="i in loading ? 4 : 0" :key="i" class="home__collection-placeholder" aria-hidden="true" />
          <PlaylistCard row to="/liked" title="Любимые треки" :subtitle="count(likes.ids.value.length)" :covers="likedCovers" />
          <PlaylistCard v-if="f?.connections.spotify" row to="/collection/spotify:saved" title="Любимое в Spotify" subtitle="Сохранённые треки" :covers="likedCovers" />
          <!-- Свои плейлисты живут в библиотеке; на главной — только если подборок нет (например, только Spotify) -->
          <PlaylistCard
            v-for="p in showOwn ? playlists : []"
            :key="p.id"
            row
            :to="`/playlist/${p.id}`"
            :title="p.name"
            :subtitle="count(p.count)"
            :covers="p.covers"
          />
          <PlaylistCard
            v-for="p in showOwn ? spotifyOwn : []"
            :key="p.id"
            row
            :to="`/collection/${p.id}`"
            :title="p.title"
            :subtitle="p.count !== undefined ? `Spotify · ${count(p.count)}` : 'Spotify'"
            :covers="p.coverUrl ? [p.coverUrl] : []"
          />
        </div>
      </section>

      <section v-if="f && (f.connections.yandex || f.connections.spotify)" class="home__section">
        <h2 class="home__heading">Миксы по годам</h2>
        <BlendTiles :limit="8" compact />
      </section>
    </div>

    <section v-if="music.hasYandex.value && f?.connections.yandex && genres?.daily.length" class="home__section">
      <h2 class="home__heading">
        Жанры дня
        <NuxtLink to="/genres" class="home__more-link">Все жанры →</NuxtLink>
      </h2>
      <div class="home__genres">
        <GenreTile v-for="s in genres.daily" :key="s.id" :station="s" />
      </div>
    </section>

    <section v-if="f && !f.connections.yandex && music.hasYandex.value" class="home__hint">
      <div>
        <h2>Подключите Яндекс Музыку</h2>
        <p>Откроет «Мою волну», «Плейлист дня», станции и подборки «Похоже на…».</p>
      </div>
      <UiButton to="/settings" variant="primary">
        <template #icon>
          <Settings />
        </template>
        Подключить
      </UiButton>
    </section>

    <section v-if="f?.spotifyNeedsReconnect" class="home__hint">
      <div>
        <h2>Переподключите Spotify</h2>
        <p>Нужны разрешения на топ, исполнителей и недавнее.</p>
      </div>
      <UiButton to="/api/auth/spotify/login" external variant="primary">
        Переподключить
      </UiButton>
    </section>

    <div v-if="f?.recent.length || f?.spotifyTop.length" class="home__pair" :class="{ 'is-single': !(f.recent.length && f.spotifyTop.length) }">
      <section v-if="f.recent.length" class="home__section">
        <h2 class="home__heading">
          Недавно слушали
        </h2>
        <div class="home__panel">
          <TrackList :tracks="f.recent.slice(0, 6)" :numbered="false" :show-album="false" :columns="f.spotifyTop.length ? undefined : 2" />
        </div>
      </section>
      <section v-if="f.spotifyTop.length" class="home__section">
        <h2 class="home__heading">
          Ваш топ за месяц
        </h2>
        <div class="home__panel">
          <TrackList :tracks="f.spotifyTop.slice(0, 6)" :show-album="false" :columns="f.recent.length ? undefined : 2" />
        </div>
      </section>
    </div>

    <section v-if="releases.length" class="home__section">
      <h2 class="home__heading">
        Вышло новое
        <small>у ваших исполнителей</small>
      </h2>
      <div class="home__cards">
        <AlbumCard v-for="r in releases" :key="r.id" :album="r" :subtitle="releaseLabel(r)" />
      </div>
    </section>

    <TrackShelf
      v-if="similar.length && seed"
      :title="`Похоже на «${seed.title}»`"
      :subtitle="seed.artists.join(', ')"
      :tracks="similar"
    />

    <!-- Остальное — по запросу: главная не превращается в бесконечную ленту -->
    <template v-if="showMore">
      <section v-if="f?.spotifyArtists.length" class="home__section">
        <h2 class="home__heading">
          Ваши исполнители
          <small>нажмите — включится радио</small>
        </h2>
        <ArtistRadioRow :artists="f.spotifyArtists" />
      </section>

      <section v-if="f?.chart.length" class="home__section">
        <h2 class="home__heading">
          Чарт
        </h2>
        <div class="home__panel">
          <TrackList :tracks="f.chart.slice(0, 15)" :show-album="false" :columns="3" />
        </div>
      </section>
    </template>
    <UiButton v-else-if="f?.spotifyArtists.length || f?.chart.length" variant="ghost" class="home__show-more" @click="showMore = true">
      Показать ещё: {{ [f?.spotifyArtists.length && 'ваши исполнители', f?.chart.length && 'чарт'].filter(Boolean).join(' и ') }}
    </UiButton>
  </div>
</template>

<style lang="scss" scoped>
.home {
  display: grid;
  // minmax(0, …): иначе горизонтальная лента карточек растягивает колонку, и на iPhone вся главная листается вбок
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-6);

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: calc(var(--space-2) * -1);
  }

  &__greeting {
    font-size: var(--fs-2xl);
    font-weight: 800;
    letter-spacing: -0.02em;

    @include down(md) {
      font-size: var(--fs-xl);
    }
  }

  &__section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: var(--space-3);
    min-width: 0;
  }

  &__more-link {
    margin-left: auto;
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    font-weight: 600;
    letter-spacing: 0;

    @include hover {
      color: var(--c-text);
    }
  }

  // Жанры дня: сетка плиток на компьютере, горизонтальная лента на телефоне
  &__genres {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-3);

    @include down(md) {
      grid-template-columns: none;
      grid-auto-columns: 42%;
      grid-auto-flow: column;
      overflow-x: auto;
      margin: 0 calc(var(--space-4) * -1);
      padding: 0 var(--space-4) var(--space-1);
      scroll-snap-type: x mandatory;
      scroll-padding-inline: var(--space-4);
      scrollbar-width: none;

      > * {
        scroll-snap-align: start;
      }
    }
  }

  &__stations {
    margin-top: calc(var(--space-3) - var(--space-6));
    --station-tint: var(--c-surface-active);
    --station-icon-color: var(--c-text);
  }

  &__show-more {
    justify-self: center;
  }

  // Подсказка — рядом с заголовком на широком экране, отдельной строкой под ним на телефоне
  // (иначе заголовок ломался на две строки, а подсказка висела справа в два ряда)
  &__heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px var(--space-2);
    font-size: var(--fs-xl);
    font-weight: 700;
    letter-spacing: -0.02em;

    small {
      color: var(--c-text-subtle);
      font-size: var(--fs-sm);
      font-weight: 500;
      letter-spacing: 0;

      @include down(md) {
        flex-basis: 100%;
      }
    }
  }

  &__collections {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);

    @include up(lg) {
      &.has-blends {
        grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
      }
    }
  }

  &__collection-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    border: 1px solid var(--c-glass-border);
    border-radius: var(--radius-lg);
    background: var(--c-bg-elevated);

    > * + * {
      border-top: 1px solid var(--c-glass-border);
    }
  }

  &__collection-placeholder {
    min-height: calc(36px + 2 * var(--space-2));
    background: var(--c-surface);
  }

  // Одна строка карточек на широком экране; на телефоне — горизонтальная прокрутка.
  &__cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
    gap: var(--space-1);
    margin: 0 calc(var(--space-2) * -1);

    @include down(md) {
      grid-template-columns: none;
      grid-auto-flow: column;
      grid-auto-columns: 42%;
      margin: 0 calc(var(--space-4) * -1);
      padding: 0 var(--space-2);
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;

      > * {
        scroll-snap-align: start;
      }
    }
  }

  &__hint {
    @include glass;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-lg);

    h2 {
      font-size: var(--fs-lg);
    }

    p {
      color: var(--c-text-muted);
      font-size: var(--fs-sm);
    }

    @include down(sm) {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  &__pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);

    &.is-single {
      grid-template-columns: minmax(0, 1fr);
    }

    @include down(lg) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  &__panel {
    @include glass;

    padding: var(--space-2);
    border-radius: var(--radius-lg);
  }
}

.home__friends {
  display: flex;
  gap: var(--space-2);
  margin: 0 calc(var(--space-2) * -1);
  padding: 0 var(--space-2);
  overflow-x: auto;
  scrollbar-width: none;
}

.friend-now {
  @include glass;
  @include focus-ring;

  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
  max-width: 300px;
  padding: var(--space-2) var(--space-4) var(--space-2) var(--space-2);
  border-radius: var(--radius-full);

  &__text {
    display: grid;
    min-width: 0;
  }

  &__name {
    @include truncate;

    font-weight: 600;
  }

  &__track {
    @include truncate;

    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }
}
</style>
