<script setup lang="ts">
import { Eye, Pencil, Settings } from 'lucide-vue-next'
import { EditProfileDialog } from '@/features/edit-profile'
import { FriendAvatar } from '@/entities/friend'
import { LikedCover, PlaylistCard } from '@/entities/library'
import { TrackList } from '@/widgets/track-list'
import { formatCount, plural, useCachedFetch } from '@/shared/lib'
import { UiButton, UiCover, UiIconButton, UiSkeleton, UiSkeletonRows } from '@/shared/ui'

/** Свой профиль: как его видят друзья + статистика месяца; «Изменить профиль» — фото, имя, «о себе». */
const { data, status, refresh } = useCachedFetch<MyProfile>('/api/me/profile', { key: 'me:profile', ttl: 60_000 })
const editOpen = ref(false)

const count = (n: number) => `${n} ${plural(n, ['трек', 'трека', 'треков'])}`
// «с ноября 2026» — месяц в родительном падеже (toLocaleDateString без числа даёт «ноябрь»)
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const since = computed(() => {
  if (!data.value) return ''
  const d = new Date(data.value.memberSince)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
})
const stats = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { value: formatCount(d.month.plays), label: plural(d.month.plays, ['прослушивание', 'прослушивания', 'прослушиваний']) + ' за месяц' },
    { value: formatCount(d.month.minutes), label: plural(d.month.minutes, ['минута', 'минуты', 'минут']) + ' музыки' },
    { value: formatCount(d.likedCount), label: 'в любимых' },
    { value: String(d.playlists.length), label: plural(d.playlists.length, ['плейлист', 'плейлиста', 'плейлистов']) },
  ]
})
// Что видят друзья — честно, по настройкам приватности
const visibility = computed(() => {
  const d = data.value
  if (!d) return ''
  const hidden = [d.hideNowPlaying && 'что играет сейчас', d.historyHidden && 'историю и топ'].filter(Boolean)
  return hidden.length ? `Друзья не видят: ${hidden.join(' и ')}` : 'Друзья видят ваш профиль целиком'
})
</script>

<template>
  <div v-if="status === 'pending' && !data" class="profile">
    <div class="profile__header">
      <UiSkeleton width="120px" height="120px" circle />
      <div class="profile__lines">
        <UiSkeleton width="min(280px, 60vw)" height="36px" radius="var(--radius-md)" />
        <UiSkeleton width="160px" height="14px" />
      </div>
    </div>
    <UiSkeletonRows :count="5" />
  </div>

  <div v-else-if="data" class="profile">
    <!-- Настройки — отсюда (в нижнем меню телефона на их месте теперь профиль) -->
    <UiIconButton label="Настройки" variant="filled" class="profile__settings" @click="navigateTo('/settings')">
      <Settings />
    </UiIconButton>
    <header class="profile__header">
      <FriendAvatar :name="data.name" :src="data.avatarUrl" :size="120" :live="!!data.nowPlaying?.isPlaying" />
      <div class="profile__info">
        <h1 class="profile__name">
          {{ data.name }}
        </h1>
        <p v-if="data.bio" class="profile__bio">
          {{ data.bio }}
        </p>
        <p class="profile__since">
          На сайте с {{ since }}
        </p>
        <div class="profile__actions">
          <UiButton variant="primary" @click="editOpen = true">
            <template #icon>
              <Pencil />
            </template>
            Изменить профиль
          </UiButton>
          <UiButton to="/settings#privacy" variant="ghost">
            <template #icon>
              <Eye />
            </template>
            Приватность
          </UiButton>
        </div>
      </div>
    </header>

    <p class="profile__visibility">
      {{ visibility }}
    </p>

    <ul class="profile__stats">
      <li v-for="s in stats" :key="s.label" class="stat">
        <span class="stat__value">{{ s.value }}</span>
        <span class="stat__label">{{ s.label }}</span>
      </li>
    </ul>

    <section v-if="data.nowPlaying" class="profile__now">
      <UiCover :src="data.nowPlaying.track.coverUrl" :size="56" rounded="md" />
      <div class="profile__now-text">
        <span class="profile__now-label">{{ data.nowPlaying.isPlaying ? 'Сейчас играет' : 'На паузе' }}</span>
        <span class="profile__now-title">{{ data.nowPlaying.track.title }} · {{ data.nowPlaying.track.artists.join(', ') }}</span>
      </div>
    </section>

    <section v-if="data.topArtists.length" class="profile__section">
      <h2 class="profile__heading">
        Топ исполнителей за месяц
      </h2>
      <ol class="profile__artists">
        <li v-for="(a, i) in data.topArtists" :key="a.name">
          <NuxtLink :to="a.artistId ? `/artist/${a.source}:${a.artistId}` : `/artist/name:${encodeURIComponent(a.name)}`" class="artist-chip">
            <span class="artist-chip__num">{{ i + 1 }}</span>
            <UiCover :src="a.coverUrl" :size="32" rounded="full" />
            <span class="artist-chip__name">{{ a.name }}</span>
          </NuxtLink>
        </li>
      </ol>
    </section>

    <section class="profile__section">
      <h2 class="profile__heading">
        Плейлисты
      </h2>
      <div class="profile__grid">
        <PlaylistCard to="/liked" title="Любимые треки" :subtitle="count(data.likedCount)">
          <template #cover>
            <LikedCover />
          </template>
        </PlaylistCard>
        <PlaylistCard
          v-for="pl in data.playlists"
          :key="pl.id"
          :to="`/playlist/${pl.id}`"
          :title="pl.name"
          :subtitle="count(pl.count)"
          :covers="pl.covers"
        />
      </div>
    </section>

    <section v-if="data.recent.length" class="profile__section">
      <h2 class="profile__heading">
        Недавно играло
      </h2>
      <div class="profile__panel">
        <TrackList :tracks="data.recent" :numbered="false" :show-album="false" />
      </div>
    </section>

    <EditProfileDialog v-model:open="editOpen" :name="data.name" :bio="data.bio" :avatar-url="data.avatarUrl" @saved="refresh()" />
  </div>
</template>

<style lang="scss" scoped>
.profile {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);

  // Шестерёнка — в правом верхнем углу страницы
  &__settings {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 1;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: var(--space-5);

    @include down(md) {
      flex-direction: column;
      text-align: center;
    }
  }

  &__lines {
    display: grid;
    gap: var(--space-2);
  }

  &__info {
    display: grid;
    justify-items: start;
    gap: var(--space-1);
    min-width: 0;

    @include down(md) {
      justify-items: center;
    }
  }

  &__name {
    font-size: clamp(1.75rem, 4vw, 3rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  &__bio {
    max-width: 52ch;
    font-size: var(--fs-md);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  &__since,
  &__visibility {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &__visibility {
    @include down(md) {
      text-align: center;
    }
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);

    @include down(md) {
      justify-content: center;
    }
  }

  // Четыре цифры: на телефоне — 2×2
  &__stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-2);

    @include down(md) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  &__now {
    @include glass;

    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
  }

  &__now-text {
    display: grid;
    min-width: 0;
  }

  &__now-label {
    color: var(--c-accent);
    font-size: var(--fs-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  &__now-title {
    @include truncate;

    font-weight: 600;
  }

  &__section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  &__heading {
    font-size: var(--fs-xl);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  &__artists {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-1);
    margin: 0 calc(var(--space-2) * -1);

    @include down(sm) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  &__panel {
    @include glass;

    padding: var(--space-2);
    border-radius: var(--radius-lg);
  }
}

.stat {
  @include glass;

  display: grid;
  gap: 2px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);

  &__value {
    font-size: var(--fs-xl);
    font-weight: 800;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  &__label {
    color: var(--c-text-muted);
    font-size: var(--fs-xs);
  }
}

.artist-chip {
  @include glass;

  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px var(--space-3) 4px 6px;
  border-radius: var(--radius-full);
  color: var(--c-text);
  text-decoration: none;

  &__num {
    width: 16px;
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
    font-weight: 700;
    text-align: center;
  }

  &__name {
    max-width: 180px;
    font-size: var(--fs-sm);
    font-weight: 600;

    @include truncate;
  }
}
</style>
