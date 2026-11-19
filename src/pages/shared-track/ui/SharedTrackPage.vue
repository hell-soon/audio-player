<script setup lang="ts">
import { ExternalLink, Play } from 'lucide-vue-next'
import { usePlayer } from '@/entities/player'
import { serviceHref, universalHref } from '@/entities/track'
import { coverOfSize } from '@/shared/lib'
import { UiButton, UiCover, UiLogo } from '@/shared/ui'

/**
 * Песня по ссылке «Поделиться → Audio» (/t/<данные>.<подпись>). Открывается без аккаунта:
 *  - вошедший — «Слушать в Audio» (играет здесь же и переходит на главную, плеер общий);
 *  - гость — «Открыть в Яндекс Музыке / Spotify», «В любом сервисе» (song.link) и коротко, что такое Audio.
 * Превью для Telegram / ВКонтакте — og:* на сервере (обложка, «Исполнитель — Песня»).
 */
const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))
const { data, error } = await useFetch<{ track: Track, from?: string }>('/api/public/track', { query: { t: token } })
const { loggedIn } = useUserSession()

const track = computed(() => data.value?.track ?? null)
const caption = computed(() => (track.value ? `${track.value.artists.join(', ')} — ${track.value.title}` : 'Песня'))
const serviceName = computed(() => (track.value?.source === 'spotify' ? 'Spotify' : 'Яндекс Музыке'))

useSeoMeta({
  title: () => caption.value,
  description: () => (data.value?.from ? `${data.value.from} делится песней в Audio` : 'Песня в Audio — один плеер для Яндекс Музыки и Spotify'),
  ogTitle: () => caption.value,
  ogDescription: () => (data.value?.from ? `${data.value.from} делится песней` : 'Слушать в Яндекс Музыке, Spotify или Audio'),
  ogImage: () => (track.value?.coverUrl ? coverOfSize(track.value.coverUrl, 400) : undefined),
  ogType: 'music.song',
  twitterCard: 'summary',
})

const player = usePlayer()
function listen() {
  if (!track.value) return
  // Синхронно в клике (iOS даёт звук только так), потом — на главную: там мини-плеер
  player.playQueue([track.value], 0)
  navigateTo('/')
}
</script>

<template>
  <main class="shared">
    <!-- Фон — размытая обложка, как «эмбиент» в самом плеере -->
    <div v-if="track?.coverUrl" class="shared__ambient" :style="{ backgroundImage: `url(${coverOfSize(track.coverUrl, 100)})` }" aria-hidden="true" />

    <NuxtLink to="/login" class="shared__brand">
      <UiLogo :size="28" :animated="false" />
      Audio
    </NuxtLink>

    <section v-if="track" class="shared__card">
      <UiCover :src="track.coverUrl" :size="320" rounded="md" class="shared__cover" />
      <p v-if="data?.from" class="shared__from">
        {{ data.from }} делится песней
      </p>
      <h1 class="shared__title">
        {{ track.title }}
      </h1>
      <p class="shared__artists">
        {{ track.artists.join(', ') }}
      </p>

      <div class="shared__actions">
        <UiButton v-if="loggedIn" size="lg" @click="listen">
          <template #icon>
            <Play fill="currentColor" />
          </template>
          Слушать в Audio
        </UiButton>
        <UiButton :variant="loggedIn ? 'secondary' : 'primary'" size="lg" :to="serviceHref(track)" external>
          <template #icon>
            <ExternalLink />
          </template>
          Открыть в {{ serviceName }}
        </UiButton>
        <UiButton variant="ghost" :to="universalHref(track)" external>
          В другом сервисе
        </UiButton>
      </div>
    </section>

    <section v-else class="shared__card">
      <h1 class="shared__title">
        Ссылка не работает
      </h1>
      <p class="shared__artists">
        {{ error ? 'Похоже, её скопировали не целиком.' : '' }}
      </p>
    </section>

    <aside v-if="!loggedIn" class="shared__about">
      <strong>Что такое Audio?</strong>
      Один плеер для Яндекс Музыки и Spotify: общая библиотека и поиск, «Моя волна», тексты песен, музыка с друзьями.
      Вход — по приглашению.
      <NuxtLink to="/login" class="shared__more">Подробнее →</NuxtLink>
    </aside>
  </main>
</template>

<style lang="scss" scoped>
.shared {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
  align-content: center;
  gap: var(--space-5);
  // Во весь экран (у родителя-раскладки нет своей высоты — 100% давало высоту содержимого, ниже был пустой фон)
  min-height: 100vh;
  min-height: 100dvh;
  padding: calc(var(--space-6) + env(safe-area-inset-top)) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom));
  overflow: hidden;
  background: var(--c-bg);
  isolation: isolate;

  // Маленькая картинка + небольшой blur, растянутая scale — так же на вид, в разы дешевле
  // fixed — фон на весь экран при любой высоте страницы
  &__ambient {
    position: fixed;
    inset: 0;
    z-index: -1;
    background-position: center;
    background-size: cover;
    filter: blur(24px) saturate(1.3);
    opacity: 0.45;
    transform: scale(1.4);
  }

  &__brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--c-text);
    font-size: var(--fs-md);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  &__card {
    @include glass(true);

    display: grid;
    justify-items: center;
    gap: var(--space-2);
    width: min(100%, 420px);
    padding: var(--space-6) var(--space-5);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    text-align: center;
  }

  &__cover {
    width: min(100%, 280px) !important;
    height: auto !important;
    aspect-ratio: 1;
    margin-bottom: var(--space-3);
    box-shadow: var(--shadow-lg);
  }

  &__from {
    color: var(--c-accent);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  &__title {
    font-size: var(--fs-2xl);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  &__artists {
    color: var(--c-text-muted);
    overflow-wrap: anywhere;
  }

  &__actions {
    display: grid;
    gap: var(--space-2);
    width: 100%;
    margin-top: var(--space-4);
  }

  &__about {
    width: min(100%, 420px);
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
    text-align: center;

    strong {
      display: block;
      color: var(--c-text);
    }
  }

  &__more {
    display: inline-block;
    margin-left: var(--space-1);
    color: var(--c-accent);
    font-weight: 600;
  }
}
</style>
