<script setup lang="ts">
/**
 * Смена содержимого «перелистыванием»: старое уезжает вверх и гаснет, новое въезжает снизу
 * (dir="prev" — наоборот). Оба лежат в одной ячейке сетки и едут одновременно — без пустого промежутка
 * и без прыжка высоты. Меняется по `swapKey` (например, uid трека).
 */
withDefaults(defineProps<{
  swapKey: string | number
  dir?: 'next' | 'prev'
  tag?: string
}>(), { dir: 'next', tag: 'span' })
</script>

<template>
  <component :is="tag" class="swap">
    <Transition :name="`swap-${dir}`">
      <component :is="tag" :key="swapKey" class="swap__item">
        <slot />
      </component>
    </Transition>
  </component>
</template>

<style lang="scss" scoped>
.swap {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}

.swap__item {
  display: grid;
  grid-area: 1 / 1;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}

.swap-next-enter-active,
.swap-next-leave-active,
.swap-prev-enter-active,
.swap-prev-leave-active {
  transition: opacity 0.32s var(--ease), transform 0.32s var(--ease);
}

// Уходящий — чуть быстрее: новый не наезжает на ещё видимый текст
.swap-next-leave-active,
.swap-prev-leave-active {
  transition-duration: 0.2s;
}

.swap-next-enter-from,
.swap-prev-leave-to {
  opacity: 0;
  transform: translateY(0.6em);
}

.swap-next-leave-to,
.swap-prev-enter-from {
  opacity: 0;
  transform: translateY(-0.6em);
}
</style>
