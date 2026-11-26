<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { heroCover, vReveal } from '@/shared/lib'
import PlaylistCover from './PlaylistCover.vue'

defineProps<{ to: string, title: string, subtitle?: string, covers?: string[], row?: boolean }>()
</script>

<template>
  <NuxtLink v-reveal="row ? undefined : 'tilt'" :to="to" class="card" :class="{ 'card--row': row }" @click="heroCover">
    <slot name="cover">
      <PlaylistCover :covers="covers ?? []" :name="title" :size="row ? 36 : 400" class="card__cover" />
    </slot>
    <span class="card__title">{{ title }}</span>
    <span v-if="subtitle" class="card__subtitle">{{ subtitle }}</span>
    <ChevronRight v-if="row" class="card__chevron" aria-hidden="true" />
  </NuxtLink>
</template>

<style lang="scss" scoped>
.card {
  @include focus-ring;
  display: grid;
  gap: 2px;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  transition: background-color var(--dur-fast) var(--ease), transform 0.2s cubic-bezier(0.3, 1.4, 0.5, 1);

  // Нажатие — карточка чуть «вдавливается»
  &:active {
    transform: scale(0.97);
  }

  @include hover {
    background: var(--c-surface);
  }

  &__cover,
  :deep(.card-cover) {
    width: 100% !important;
    margin-bottom: var(--space-2);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  }

  &__title {
    @include truncate;

    font-weight: 600;
  }

  &__subtitle {
    @include truncate;

    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &--row {
    grid-template-columns: 36px minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    column-gap: var(--space-3);
    padding-inline: var(--space-3);

    &:active {
      transform: none;
      background: var(--c-surface-active);
    }

    .card__cover,
    :deep(.card-cover) {
      grid-area: 1 / 1 / span 2;
      align-self: center;
      margin: 0;
      box-shadow: none;
    }

    .card__title {
      grid-area: 1 / 2;
      align-self: end;

      &:not(:has(+ .card__subtitle)) {
        grid-row: span 2;
        align-self: center;
      }
    }

    .card__subtitle {
      grid-area: 2 / 2;
    }
  }

  &__chevron {
    grid-area: 1 / 3 / span 2;
    align-self: center;
    width: 16px;
    height: 16px;
    color: var(--c-text-muted);
  }
}
</style>
