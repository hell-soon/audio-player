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
  <div class="flip" :class="{ 'is-turning': turning, 'is-back': back, 'is-vinyl': vinyl }" :style="{ '--turn': `${TURN_MS}ms` }">
    <div v-show="!back" class="flip__front" :class="{ 'is-vinyl': vinyl }">
      <!-- Пластинка всегда видна из-за обложки, как из конверта; пока играет — выезжает до половины и крутится -->
      <div v-if="vinyl" class="flip__peek" :class="{ 'is-out': playing }">
        <UiVinyl :src="src" :playing="playing && !back" />
      </div>
      <div class="flip__sleeve">
        <slot />
      </div>
    </div>
    <div v-if="vinyl" v-show="back" class="flip__back">
      <UiVinyl :src="src" :playing="playing && back" class="flip__disc" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.flip {
  position: relative;
  display: grid;

  > * {
    grid-area: 1 / 1;
    min-width: 0;
  }

  // Тема включена: обе стороны — один и тот же квадрат на всю ширину. Раньше высоту задавала
  // показанная сторона (конверт — 74 % ширины, пластинка сзади — 100 %), и при перевороте
  // менялась высота: название и кнопки под обложкой прыгали
  &.is-vinyl {
    width: 100%;
    aspect-ratio: 1;
  }

  // Поворот до ребра и обратно; стороны меняются ровно посередине (скрипт), поэтому видна всегда одна
  &.is-turning {
    animation: flip-turn var(--turn) cubic-bezier(0.45, 0, 0.25, 1);
  }

  &__front {
    position: relative;
  }

  &__sleeve {
    position: relative;
  }

  // Тема включена: обложка-«конверт» меньше и слева, справа из-за неё всегда видна пластинка
  // (на паузе — примерно треть, пока играет — выезжает до половины). Вместе — та же ширина, что была у обложки.
  // Ячейка стороны бывает выше конверта (квадрат обложки на всю ширину) — конверт по центру,
  // и пластинка (по центру ячейки) ровно за ним, а не ниже
  &__front.is-vinyl {
    display: grid;
    align-items: center;
  }

  &__front.is-vinyl &__sleeve {
    z-index: 1;
    width: 74%;
  }

  // Обратная сторона — пластинка по центру квадрата, чуть меньше его: тень не упирается в края,
  // а по размеру она совпадает с композицией «конверт + пластинка» спереди
  &__back {
    display: grid;
    place-items: center;
  }

  &__disc {
    width: 90%;
  }

  &__peek {
    position: absolute;
    top: 50%;
    left: 1%;
    width: 70%;
    // Один transform (не translate + transform: минификатор сборки выкидывал свойство translate,
    // если рядом есть transform, — пластинка съезжала вниз на половину своей высоты)
    transform: translate(26%, -50%);
    transition: transform 0.8s cubic-bezier(0.3, 1.15, 0.4, 1);
    pointer-events: none;

    &.is-out {
      transform: translate(41%, -50%);
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
