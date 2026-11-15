<script setup lang="ts">
import { Heart } from 'lucide-vue-next'
import PlaylistCover from './PlaylistCover.vue'

/**
 * Обложка «Любимые треки»: коллаж из обложек последних любимых песен со значком сердца в углу.
 * Без обложек (ещё ничего не лайкнуто) — прежний квадрат цвета акцента с сердцем.
 */
const props = withDefaults(defineProps<{ covers?: string[], size?: number }>(), { size: 400 })
const has = computed(() => !!props.covers?.length)
</script>

<template>
  <div class="liked-cover card-cover" :class="{ 'has-covers': has }">
    <template v-if="has">
      <PlaylistCover :covers="covers!" :size="size" class="liked-cover__collage" />
      <span class="liked-cover__badge" aria-hidden="true"><Heart fill="currentColor" /></span>
    </template>
    <Heart v-else fill="currentColor" class="liked-cover__heart" />
  </div>
</template>

<style lang="scss" scoped>
.liked-cover {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: linear-gradient(140deg, var(--c-accent), color-mix(in oklab, var(--c-accent) 45%, #1d1a35));
  color: var(--c-on-accent);

  &__heart {
    width: 34%;
    height: 34%;
  }

  &__collage {
    position: absolute;
    inset: 0;
    width: 100% !important;
    height: 100% !important;
  }

  // Сердце в углу — сразу видно, что это «Любимые»
  &__badge {
    position: absolute;
    right: 8%;
    bottom: 8%;
    display: grid;
    place-items: center;
    width: 26%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--c-accent);
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.35);

    svg {
      width: 52%;
      height: 52%;
    }
  }
}
</style>
