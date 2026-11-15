<script setup lang="ts">
import { UiVinyl } from '@/shared/ui'

/**
 * Обложка с двумя сторонами (тема «Обложки как пластинки»): спереди — обложка (слот), сзади — пластинка.
 * Переворот — по оси Y, как настоящий конверт в руках. Тема выключена — только обложка, без 3D.
 */
defineProps<{ vinyl: boolean, flipped: boolean, src?: string | null, playing: boolean }>()
</script>

<template>
  <div class="flip" :class="{ 'is-vinyl': vinyl, 'is-flipped': vinyl && flipped }">
    <div class="flip__front">
      <slot />
    </div>
    <div v-if="vinyl" class="flip__back">
      <UiVinyl :src="src" :playing="playing && flipped" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.flip {
  position: relative;
  display: grid;

  > * {
    grid-area: 1 / 1;
  }

  &.is-vinyl {
    transform-style: preserve-3d;
    transition: transform 0.75s cubic-bezier(0.3, 1.15, 0.4, 1);
  }

  &.is-flipped {
    transform: rotateY(180deg);
  }

  &__front {
    position: relative;
  }

  // Стороны — без «изнанки»: повёрнутая спиной сторона не видна
  &.is-vinyl &__front,
  &__back {
    backface-visibility: hidden;
  }

  &__back {
    transform: rotateY(180deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flip.is-vinyl {
    transition: none;
  }
}
</style>
