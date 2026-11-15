<script setup lang="ts">
import { UiVinyl } from '@/shared/ui'

/**
 * Обложка с двумя сторонами (тема «Обложки как пластинки»): спереди — обложка (слот), сзади — пластинка.
 *
 * Переворот без backface-visibility: Safari ненадёжно прячет «изнанку», когда внутри стороны свои 3D-эффекты
 * (у обложки карточки — translateZ, наклон, видео) — обложка просвечивала зеркально поверх/под пластинкой.
 * Поэтому показана всегда одна сторона: элемент поворачивается до ребра (90°), в этот момент стороны
 * меняются, и новая доворачивается с другой стороны. Тема выключена — только обложка.
 */
const props = defineProps<{ vinyl: boolean, flipped: boolean, src?: string | null, playing: boolean }>()

const TURN_MS = 640
/** Какая сторона сейчас показана (меняется на середине поворота) */
const back = ref(props.vinyl && props.flipped)
const turning = ref(false)
let timers: ReturnType<typeof setTimeout>[] = []

watch(() => props.vinyl && props.flipped, (to) => {
  timers.forEach(clearTimeout)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    back.value = to
    return
  }
  // Перезапуск анимации, если переворачивают снова посреди поворота
  turning.value = false
  requestAnimationFrame(() => {
    turning.value = true
    timers = [
      setTimeout(() => (back.value = to), TURN_MS / 2),
      setTimeout(() => (turning.value = false), TURN_MS),
    ]
  })
})
onBeforeUnmount(() => timers.forEach(clearTimeout))
</script>

<template>
  <div class="flip" :class="{ 'is-turning': turning, 'is-back': back }" :style="{ '--turn': `${TURN_MS}ms` }">
    <div v-show="!back" class="flip__front">
      <!-- Пластинка выглядывает из-за обложки, как из конверта: видно, что тема включена и обложку можно перевернуть -->
      <div v-if="vinyl" class="flip__peek" :class="{ 'is-out': playing }">
        <UiVinyl :src="src" :playing="playing && !back" />
      </div>
      <slot />
    </div>
    <div v-if="vinyl" v-show="back" class="flip__back">
      <UiVinyl :src="src" :playing="playing && back" />
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

  // Поворот до ребра и обратно; стороны меняются ровно посередине (скрипт), поэтому видна всегда одна
  &.is-turning {
    animation: flip-turn var(--turn) cubic-bezier(0.45, 0, 0.25, 1);
  }

  &__front {
    position: relative;
  }

  // Выглядывающая пластинка: под обложкой, чуть меньше её; пока играет — выезжает сильнее
  &__peek {
    position: absolute;
    inset: 4%;
    transform: translateX(10%);
    transition: transform 0.7s cubic-bezier(0.3, 1.2, 0.4, 1);
    pointer-events: none;

    &.is-out {
      transform: translateX(22%);
    }
  }
}

@keyframes flip-turn {
  0% {
    transform: perspective(1200px) rotateY(0deg);
  }

  50% {
    transform: perspective(1200px) rotateY(90deg);
  }

  50.01% {
    transform: perspective(1200px) rotateY(-90deg);
  }

  100% {
    transform: perspective(1200px) rotateY(0deg);
  }
}
</style>
