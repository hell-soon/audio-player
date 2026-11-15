<script setup lang="ts">
import { coverOfSize } from '../../lib/cover-size'

/**
 * Виниловая пластинка: чёрный диск с бороздками, в центре — обложка круглой «наклейкой» (яблоком).
 * Крутится, пока играет (33⅓ оборота в минуту — 1,8 с на оборот), на паузе замирает на месте.
 * Блики на виниле не крутятся вместе с ним — как у настоящей пластинки под лампой.
 */
defineProps<{ src?: string | null, playing?: boolean }>()
</script>

<template>
  <div class="vinyl" :class="{ 'is-playing': playing }" aria-hidden="true">
    <div class="vinyl__disc">
      <span class="vinyl__label" :style="src ? { backgroundImage: `url(${coverOfSize(src, 300)})` } : undefined" />
    </div>
    <span class="vinyl__sheen" />
    <span class="vinyl__hole" />
  </div>
</template>

<style lang="scss" scoped>
.vinyl {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  box-shadow:
    0 30px 60px rgb(0 0 0 / 0.4),
    0 0 0 1px rgb(255 255 255 / 0.06);

  &__disc {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    // Бороздки — частые тонкие кольца; ровная кромка и гладкое поле у наклейки
    background:
      radial-gradient(circle, transparent 0 34.5%, #0c0c0e 35% 37.5%, transparent 38% 96.5%, #19191c 97% 100%),
      repeating-radial-gradient(circle, #101012 0 1.1px, #1c1c20 1.4px 2.4px, #121214 2.7px 3.4px);
    animation: vinyl-spin 1.8s linear infinite;
    animation-play-state: paused;
  }

  &.is-playing &__disc {
    animation-play-state: running;
  }

  // Обложка-«наклейка» в центре (вращается вместе с диском — видно, что пластинка крутится)
  &__label {
    position: absolute;
    inset: 32%;
    border-radius: 50%;
    background: var(--c-accent) center / cover;
    box-shadow: inset 0 0 0 2px rgb(0 0 0 / 0.25);
  }

  // Блики от лампы: неподвижные светлые «лучи» по винилу
  &__sheen {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background:
      conic-gradient(
        from 20deg,
        transparent 0deg,
        rgb(255 255 255 / 0.13) 25deg,
        transparent 55deg,
        transparent 180deg,
        rgb(255 255 255 / 0.1) 205deg,
        transparent 235deg
      );
    mask-image: radial-gradient(circle, transparent 0 38%, #000 39%);
    pointer-events: none;
  }

  // Отверстие под шпиндель
  &__hole {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 3.2%;
    height: 3.2%;
    border-radius: 50%;
    background: #0a0a0c;
    box-shadow: 0 0 0 2px rgb(255 255 255 / 0.15);
    translate: -50% -50%;
  }
}

@keyframes vinyl-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .vinyl__disc {
    animation: none;
  }
}
</style>
