<script setup lang="ts">
import { LikeButton } from '@/features/like-track'
import { PlayerControls, PlayerProgress } from '@/features/player-controls'
import { usePlayer } from '@/entities/player'
import { coverOfSize, useDocumentPip } from '@/shared/lib'

/**
 * Мини-плеер в окне «поверх всех окон» (Document Picture-in-Picture, только компьютер: Chrome, Edge, Яндекс Браузер).
 * Компонент всегда смонтирован в каркасе, а содержимое телепортируется в окно, пока оно открыто.
 * Маленькое окно — обложка и название в строку; окно растянули вверх — большая обложка.
 */
const p = usePlayer()
const pip = useDocumentPip()
const target = computed(() => pip.window.value?.document.body ?? null)
const track = computed(() => p.current.value)
const artists = computed(() => track.value?.artists.join(', ') ?? '')

// Клавиши внутри окна (горячие клавиши вкладки сюда не доходят)
function onKey(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey || !p.current.value) return
  const tag = (e.target as HTMLElement | null)?.tagName
  if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'INPUT') {
    e.preventDefault()
    p.toggle()
  }
  else if (e.key === 'ArrowRight' && tag !== 'INPUT') {
    e.preventDefault()
    if (e.shiftKey) p.next()
    else p.seek(Math.min(p.duration.value, p.position.value + 10_000))
  }
  else if (e.key === 'ArrowLeft' && tag !== 'INPUT') {
    e.preventDefault()
    if (e.shiftKey) p.previous()
    else p.seek(Math.max(0, p.position.value - 10_000))
  }
}
watch(() => pip.window.value, (win, old) => {
  old?.removeEventListener('keydown', onKey)
  win?.addEventListener('keydown', onKey)
})

onMounted(() => {
  // Chrome может открыть мини-плеер сам, когда человек уходит с вкладки, где играет музыка
  // (если это разрешено в настройках сайта). Не поддерживается — молча пропускаем.
  if (!pip.supported || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.setActionHandler('enterpictureinpicture' as MediaSessionAction, () => {
      if (p.current.value) pip.open().catch(() => {})
    })
  }
  catch {
    // действие не поддерживается браузером
  }
})
onBeforeUnmount(() => pip.close())
</script>

<template>
  <Teleport v-if="target" :to="target">
    <div class="pip" :class="{ 'is-empty': !track }">
      <img v-if="track?.coverUrl" class="pip__bg" :src="coverOfSize(track.coverUrl, 100)" alt="" aria-hidden="true">
      <template v-if="track">
        <img v-if="track.coverUrl" :key="track.uid" class="pip__cover" :src="coverOfSize(track.coverUrl, 400)" alt="">
        <span v-else class="pip__cover" />
        <span class="pip__meta">
          <span class="pip__title" :title="track.title">{{ track.title }}</span>
          <span class="pip__artists" :title="artists">{{ artists }}</span>
        </span>
        <LikeButton :track="track" class="pip__like" />
        <PlayerProgress class="pip__progress" stacked />
        <PlayerControls class="pip__controls" />
      </template>
      <p v-else class="pip__empty">
        Ничего не играет
      </p>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.pip {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template:
    'cover meta like' auto
    'progress progress progress' auto
    'controls controls controls' auto
    / auto minmax(0, 1fr) auto;
  align-content: center;
  align-items: center;
  column-gap: var(--space-3);
  row-gap: var(--space-1);
  padding: var(--space-3);
  overflow: hidden;
  background: var(--c-bg);
  color: var(--c-text);

  // Размытая обложка на фоне + затемнение, как у карточки «Сейчас играет»
  &__bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(14px) saturate(160%);
    opacity: 0.55;
    transform: scale(4);
    pointer-events: none;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: color-mix(in srgb, var(--c-bg) 55%, transparent);
    pointer-events: none;
  }

  > :not(.pip__bg) {
    position: relative;
    z-index: 1;
  }

  &__cover {
    grid-area: cover;
    width: 52px;
    height: 52px;
    border-radius: var(--radius-sm);
    background: var(--c-surface);
    object-fit: cover;
    box-shadow: var(--shadow-lg);
  }

  &__meta {
    grid-area: meta;
    display: grid;
    min-width: 0;
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

  &__like {
    grid-area: like;
  }

  &__progress {
    grid-area: progress;
  }

  &__controls {
    grid-area: controls;
  }

  &__empty {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--c-text-muted);
    text-align: center;
  }

  // Окно растянули вверх — большая обложка сверху, по центру
  @media (min-height: 300px) {
    grid-template:
      'cover cover' minmax(0, 1fr)
      'meta like' auto
      'progress progress' auto
      'controls controls' auto
      / minmax(0, 1fr) auto;
    align-content: stretch;
    row-gap: var(--space-2);
    padding: var(--space-4);

    &__cover {
      justify-self: center;
      align-self: center;
      width: auto;
      max-width: 100%;
      height: 100%;
      max-height: 100%;
      aspect-ratio: 1;
      border-radius: var(--radius-md);
    }

    &__title {
      font-size: var(--fs-lg);
    }
  }

  // Совсем узкое окно — без «перемешать» и «повтор»
  @media (max-width: 260px) {
    &__controls :deep(.ui-icon-button--sm) {
      display: none;
    }
  }
}
</style>
