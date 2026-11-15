<script setup lang="ts">
/** Модальное окно на нативном <dialog>: фокус-ловушка и Esc «из коробки». На телефоне — шторка снизу. */
const open = defineModel<boolean>('open', { required: true })
defineProps<{ title: string }>()

const el = ref<HTMLDialogElement | null>(null)

watch(open, (o) => {
  if (!el.value) return
  if (o && !el.value.open) el.value.showModal()
  if (!o && el.value.open) el.value.close()
}, { flush: 'post' })

onMounted(() => {
  if (open.value) el.value?.showModal()
})

function onBackdrop(e: MouseEvent) {
  if (e.target === el.value) open.value = false
}

// Окно убрали со страницы (например, свернули карточку, внутри которой оно) — закрываем модальность,
// иначе невидимое модальное окно делает всю страницу «мёртвой»
onBeforeUnmount(() => {
  if (el.value?.open) el.value.close()
})

/**
 * Телефон: шторку можно смахнуть вниз (тянем за любое место, когда её содержимое прокручено в самый верх).
 * Касания не уходят дальше (.stop): иначе жест ловила, например, карточка «Сейчас играет» под окном
 * и сворачивалась сама, оставляя окно открытым.
 */
const dragY = ref(0)
let start: { y: number, t: number, scrollTop: number } | null = null
function onTouchStart(e: TouchEvent) {
  const body = el.value?.querySelector('.ui-dialog__body')
  start = { y: e.touches[0]!.clientY, t: performance.now(), scrollTop: (el.value?.scrollTop ?? 0) + (body?.scrollTop ?? 0) }
}
function onTouchMove(e: TouchEvent) {
  if (!start || start.scrollTop > 0 || !matchMedia('(max-width: 767.98px)').matches) return
  dragY.value = Math.max(0, e.touches[0]!.clientY - start.y)
}
function onTouchEnd() {
  if (!start) return
  const v = dragY.value / Math.max(1, performance.now() - start.t)
  if (dragY.value > 100 || (dragY.value > 40 && v > 0.6)) open.value = false
  dragY.value = 0
  start = null
}
</script>

<template>
  <dialog
    ref="el"
    class="ui-dialog"
    :class="{ 'is-dragging': dragY > 0 }"
    :style="dragY ? { translate: `0 ${dragY}px` } : undefined"
    :aria-label="title"
    @close="open = false"
    @click="onBackdrop"
    @touchstart.stop.passive="onTouchStart"
    @touchmove.stop.passive="onTouchMove"
    @touchend.stop="onTouchEnd"
    @touchcancel.stop="onTouchEnd"
  >
    <span class="ui-dialog__grabber" aria-hidden="true" />
    <div class="ui-dialog__body">
      <h2 class="ui-dialog__title">
        {{ title }}
      </h2>
      <slot />
    </div>
  </dialog>
</template>

<style lang="scss" scoped>
.ui-dialog {
  width: min(420px, calc(100vw - 32px));
  max-height: min(70dvh, 560px);
  margin: auto;
  padding: 0;
  border: 1px solid var(--c-glass-border);
  border-radius: var(--radius-lg);
  background: var(--c-bg-elevated);
  color: var(--c-text);
  box-shadow: var(--shadow-lg);
  // Фокус при открытии получает само окно — рамка вокруг всего окна не нужна (у полей и кнопок своя)
  outline: none;

  // Появление и закрытие: @starting-style + allow-discrete (Safari 18+, Chrome 117+).
  // Где не поддерживается — окно просто открывается без анимации.
  --closed: translateY(12px) scale(0.96);

  opacity: 0;
  transform: var(--closed);
  transition:
    opacity 0.2s var(--ease),
    transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1),
    translate 0.28s cubic-bezier(0.32, 0.72, 0, 1),
    overlay 0.32s allow-discrete,
    display 0.32s allow-discrete;

  // Шторку ведёт палец — без задержки
  &.is-dragging {
    transition: none;
  }

  &[open] {
    opacity: 1;
    transform: none;

    @starting-style {
      opacity: 0;
      transform: var(--closed);
    }
  }

  &::backdrop {
    background: var(--c-overlay);
    backdrop-filter: blur(6px);
    opacity: 0;
    transition: opacity 0.25s var(--ease), overlay 0.32s allow-discrete, display 0.32s allow-discrete;
  }

  &[open]::backdrop {
    opacity: 1;

    @starting-style {
      opacity: 0;
    }
  }

  @include down(md) {
    // Шторка снизу — выезжает из-за края экрана
    --closed: translateY(100%);

    width: 100vw;
    max-width: 100vw;
    margin: auto 0 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: env(safe-area-inset-bottom);

    &[open] {
      transition-duration: 0.2s, 0.38s, 0.38s, 0.38s;
    }
  }

  // «Ручка» сверху шторки на телефоне — видно, что её можно смахнуть вниз
  &__grabber {
    display: none;

    @include down(md) {
      display: block;
      width: 40px;
      height: 5px;
      margin: var(--space-2) auto 0;
      border-radius: var(--radius-full);
      background: var(--c-surface-active);
    }
  }

  &__body {
    display: grid;
    // minmax(0, …): иначе колонка растягивается по содержимому и поля/кнопки уезжают за край (iPhone SE)
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    padding: var(--space-5);
  }

  &__title {
    font-size: var(--fs-lg);
  }
}
</style>
