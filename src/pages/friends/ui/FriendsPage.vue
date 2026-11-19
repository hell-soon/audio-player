<script setup lang="ts">
import { Heart, Link2, ListMusic, Sparkles, Users } from 'lucide-vue-next'
import { ListenTogetherButton } from '@/features/listen-together'
import { PushPrompt } from '@/features/push-notifications'
import { IncomingShares } from '@/features/share-with-friend'
import { FriendAvatar, lastSeenLabel, useFriends } from '@/entities/friend'
import { coverOfSize, plural, useCachedFetch } from '@/shared/lib'
import { UiButton, UiCover, UiEmptyState, UiPageHeader, UiSkeletonRows, useToast } from '@/shared/ui'

/**
 * Друзья.
 *  - «Сейчас слушают» — крупные карточки с обложкой играющего трека и «Слушать вместе»;
 *  - «Все друзья» — карточки: «о себе», что слушал недавно, любимые и плейлисты, совпадение вкусов
 *    и общие исполнители (FriendInfo.card, сервер считает с кэшем);
 *  - справа (компьютер) — «Вам прислали», «Вы отправили», «Позовите друзей». На телефоне колонки
 *    «растворяются» (display: contents), порядок блоков — order: присланное сверху.
 */
const { data: friends, status, refresh } = useFriends()
const toast = useToast()

// Обновляем «сейчас играет», пока страница открыта и видна
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (!document.hidden) refresh()
  }, 15_000)
})
onBeforeUnmount(() => clearInterval(timer))

const listening = computed(() => friends.value.filter(f => f.nowPlaying?.isPlaying))
const bestMatch = computed(() => [...friends.value].filter(f => f.card?.match).sort((a, b) => b.card!.match!.percent - a.card!.match!.percent)[0])

const { data: invite } = useCachedFetch<{ owner: boolean, code?: string | null }>('/api/me/invite', { key: 'me:invite', ttl: 30 * 60_000 })
async function copyInvite() {
  if (!invite.value?.code) return
  await navigator.clipboard?.writeText(`${location.origin}/login?invite=${encodeURIComponent(invite.value.code)}`).catch(() => {})
  toast.show('Ссылка-приглашение скопирована')
}

const subtitle = computed(() => {
  if (!friends.value.length) return 'Что слушают друзья — и можно слушать вместе'
  const parts = [`${friends.value.length} ${plural(friends.value.length, ['друг', 'друга', 'друзей'])}`]
  if (listening.value.length) parts.push(`${listening.value.length} ${plural(listening.value.length, ['слушает', 'слушают', 'слушают'])} сейчас`)
  return parts.join(' · ')
})
</script>

<template>
  <div class="friends">
    <UiPageHeader title="Друзья" :subtitle="subtitle" />

    <PushPrompt class="friends__prompt" />

    <UiSkeletonRows v-if="status === 'pending' && !friends.length" :count="6" />

    <UiEmptyState v-else-if="!friends.length" title="Пока никого" text="Пригласите друзей — здесь будет видно, что они слушают, их плейлисты и любимые треки.">
      <template #icon>
        <Users />
      </template>
      <UiButton v-if="invite?.code" variant="primary" @click="copyInvite">
        <template #icon>
          <Link2 />
        </template>
        Скопировать приглашение
      </UiButton>
    </UiEmptyState>

    <div v-else class="friends__layout">
      <div class="friends__main">
        <!-- Сейчас слушают: обложка трека крупно, фон — её размытая копия -->
        <section v-if="listening.length" class="friends__block" style="--o: 2">
          <h2 class="friends__heading">
            Сейчас слушают
          </h2>
          <div class="live-grid">
            <article v-for="f in listening" :key="f.id" class="live">
              <span class="live__bg" :style="f.nowPlaying!.track.coverUrl ? { backgroundImage: `url(${coverOfSize(f.nowPlaying!.track.coverUrl, 100)})` } : undefined" aria-hidden="true" />
              <UiCover :src="f.nowPlaying!.track.coverUrl" :size="88" rounded="md" class="live__cover" />
              <div class="live__info">
                <NuxtLink :to="`/friends/${f.id}`" class="live__who">
                  <FriendAvatar :name="f.name" :src="f.avatarUrl" :size="22" live />
                  <span>{{ f.name }}</span>
                </NuxtLink>
                <span class="live__title">{{ f.nowPlaying!.track.title }}</span>
                <span class="live__artists">{{ f.nowPlaying!.track.artists.join(', ') }}</span>
                <ListenTogetherButton class="live__btn" :friend="f" :now-playing="f.nowPlaying" size="sm" />
              </div>
            </article>
          </div>
        </section>

        <section class="friends__block" style="--o: 3">
          <h2 class="friends__heading">
            Все друзья
          </h2>
          <ul class="cards">
            <li v-for="f in friends" :key="f.id">
              <NuxtLink :to="`/friends/${f.id}`" class="card">
                <div class="card__head">
                  <FriendAvatar :name="f.name" :src="f.avatarUrl" :size="52" :live="!!f.nowPlaying?.isPlaying" />
                  <div class="card__who">
                    <span class="card__name">{{ f.name }}</span>
                    <span class="card__status" :class="{ 'is-live': f.nowPlaying?.isPlaying }">{{ lastSeenLabel(f) }}</span>
                  </div>
                  <span v-if="f.card?.match" class="card__match" :title="`Вкусы совпадают на ${f.card.match.percent}%`">
                    {{ f.card.match.percent }}%
                  </span>
                </div>

                <p v-if="f.card?.bio" class="card__bio">
                  {{ f.card.bio }}
                </p>

                <!-- Что играет сейчас или что звучало последним -->
                <div v-if="f.nowPlaying || f.card?.lastTrack" class="card__track">
                  <UiCover :src="(f.nowPlaying?.track ?? f.card?.lastTrack)!.coverUrl" :size="36" />
                  <span class="card__track-text">
                    <span class="card__track-label">{{ f.nowPlaying?.isPlaying ? 'Сейчас' : f.nowPlaying ? 'На паузе' : 'Недавно' }}</span>
                    <span class="card__track-title">{{ (f.nowPlaying?.track ?? f.card?.lastTrack)!.title }} — {{ (f.nowPlaying?.track ?? f.card?.lastTrack)!.artists.join(', ') }}</span>
                  </span>
                </div>

                <div class="card__facts">
                  <span v-if="f.card" class="card__fact"><Heart /> {{ f.card.likedCount }}</span>
                  <span v-if="f.card?.playlistCount" class="card__fact"><ListMusic /> {{ f.card.playlistCount }} {{ plural(f.card.playlistCount, ['плейлист', 'плейлиста', 'плейлистов']) }}</span>
                  <span v-if="f.card?.match?.commonArtists.length" class="card__fact card__common">
                    <Sparkles /><span class="card__common-text">Общее: {{ f.card.match.commonArtists.join(', ') }}</span>
                  </span>
                </div>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>

      <aside class="friends__aside">
        <IncomingShares mark-seen removable :limit="10" class="friends__block" style="--o: 1">
          <template #title>
            <h2 class="friends__heading">
              Вам прислали
            </h2>
          </template>
        </IncomingShares>

        <!-- С кем вкусы совпадают больше всего — повод зайти в «Общее у нас» -->
        <NuxtLink v-if="bestMatch" :to="`/collection/taste:${bestMatch.id}`" class="tip" style="--o: 4">
          <Sparkles class="tip__icon" />
          <span>
            <!-- Без «с кем»: имя в творительном падеже не просклонять -->
            <strong>{{ bestMatch.name }}: вкусы совпадают на {{ bestMatch.card!.match!.percent }}%</strong>
            <span>Послушайте «Общее у нас» — песни, которые любите оба</span>
          </span>
        </NuxtLink>

        <!-- Что вы отправили: видно, открыл ли друг; крестик — отменить отправку -->
        <IncomingShares sent removable :limit="10" class="friends__block" style="--o: 5">
          <template #title>
            <h2 class="friends__heading">
              Вы отправили
            </h2>
          </template>
        </IncomingShares>

        <div v-if="invite?.code" class="tip tip--invite" style="--o: 6">
          <Users class="tip__icon" />
          <span>
            <strong>Позовите друзей</strong>
            <span>По ссылке-приглашению — и здесь будет видно, что они слушают</span>
          </span>
          <UiButton size="sm" @click="copyInvite">
            <template #icon>
              <Link2 />
            </template>
            Ссылка
          </UiButton>
        </div>
      </aside>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.friends {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);

  &__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
    align-items: start;
    gap: var(--space-6);
  }

  &__main,
  &__aside {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: var(--space-6);
  }

  // Правая колонка прилипает, пока листаются друзья
  &__aside {
    position: sticky;
    top: var(--space-4);
  }

  &__block {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  &__heading {
    font-size: var(--fs-xl);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  // Телефон и узкое окно: одна колонка; присланное — сверху, потом «Сейчас слушают», друзья, остальное
  @include down(lg) {
    &__layout {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-6);
    }

    &__main,
    &__aside {
      display: contents;
    }

    &__aside {
      position: static;
    }

    &__block,
    .tip {
      order: var(--o, 0);
    }
  }
}

// ---------- Сейчас слушают ----------
.live-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: var(--space-3);
}

.live {
  @include glass;

  position: relative;
  display: flex;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-3);
  overflow: hidden;
  border-radius: var(--radius-lg);
  isolation: isolate;

  // Размытая обложка под карточкой — маленькая картинка, растянутая scale (дёшево)
  &__bg {
    position: absolute;
    inset: 0;
    z-index: -1;
    background-position: center;
    background-size: cover;
    filter: blur(18px) saturate(1.3);
    opacity: 0.35;
    transform: scale(1.6);
  }

  &__cover {
    flex: none;
    box-shadow: var(--shadow-lg);
  }

  &__info {
    display: grid;
    align-content: start;
    gap: 2px;
    min-width: 0;
  }

  &__who {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin-bottom: 4px;
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    font-weight: 600;

    @include hover {
      color: var(--c-text);
    }
  }

  &__title {
    @include truncate;

    font-weight: 700;
  }

  &__artists {
    @include truncate;

    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &__btn {
    justify-self: start;
    margin-top: var(--space-2);
  }
}

// ---------- Все друзья ----------
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  @include glass;
  @include focus-ring;

  display: grid;
  // minmax(0, …): длинное название трека обрезается, а не растягивает карточку за край экрана
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: var(--space-3);
  height: 100%;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  transition: border-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);

  @include hover {
    border-color: color-mix(in srgb, var(--c-accent) 35%, transparent);
    transform: translateY(-2px);
  }

  &__head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  &__who {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  &__name {
    @include truncate;

    font-size: var(--fs-md);
    font-weight: 700;
  }

  &__status {
    color: var(--c-text-subtle);
    font-size: var(--fs-sm);

    &.is-live {
      color: var(--c-accent);
      font-weight: 600;
    }
  }

  // Совпадение вкусов — «значок» в углу
  &__match {
    flex: none;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--c-accent-soft);
    color: var(--c-accent);
    font-size: var(--fs-sm);
    font-weight: 800;
  }

  &__bio {
    display: -webkit-box;
    overflow: hidden;
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  &__track {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: var(--c-surface);
  }

  &__track-text {
    display: grid;
    min-width: 0;
  }

  &__track-label {
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
  }

  &__track-title {
    @include truncate;

    font-size: var(--fs-sm);
  }

  &__facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    color: var(--c-text-muted);
    font-size: var(--fs-xs);
  }

  &__fact {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;

    svg {
      flex: none;
      width: 14px;
      height: 14px;
    }
  }

  &__common {
    flex-basis: 100%;
  }

  &__common-text {
    @include truncate;
  }
}

// ---------- Подсказки справа ----------
.tip {
  @include glass;
  @include focus-ring;

  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-lg);

  > span {
    display: grid;
    flex: 1;
    gap: 2px;
    min-width: 0;

    strong {
      font-size: var(--fs-sm);
    }

    span {
      color: var(--c-text-muted);
      font-size: var(--fs-xs);
      line-height: 1.4;
    }
  }

  &__icon {
    flex: none;
    width: 22px;
    height: 22px;
    color: var(--c-accent);
  }
}

a.tip {
  @include hover {
    border-color: color-mix(in srgb, var(--c-accent) 35%, transparent);
  }
}
</style>
