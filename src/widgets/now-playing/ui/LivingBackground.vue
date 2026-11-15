<script setup lang="ts">
import { usePlayer } from '@/entities/player'
import { coverPalette } from '@/shared/lib'

/**
 * «Живой» фон полноэкранного режима: четыре больших цветовых пятна из палитры обложки медленно плавают
 * и перетекают в цвета новой песни (цвета — зарегистрированные @property, поэтому переход плавный).
 * Компьютер + трек Яндекса: пятна чуть «дышат» от басов (анализатор звука, как у визуализатора).
 * Без filter: blur — радиальные градиенты, двигается только transform: дёшево и на телефоне.
 */
const p = usePlayer()
const root = ref<HTMLElement | null>(null)

watch(() => p.current.value?.coverUrl, async (url) => {
  const cols = url ? await coverPalette(url).catch(() => []) : []
  const el = root.value
  if (!el || url !== p.current.value?.coverUrl) return
  // Нет цветов (ч/б обложка) — оттенки акцента темы
  const fallback = ['var(--c-accent)', 'color-mix(in srgb, var(--c-accent) 60%, #000)', 'color-mix(in srgb, var(--c-accent) 70%, #fff)', 'var(--c-accent)']
  const apply = () => {
    for (let i = 0; i < 4; i++) el.style.setProperty(`--lb-c${i + 1}`, cols.length ? cols[i % cols.length]! : fallback[i]!)
  }
  // Телефон: цвета не «перетекают» (дорого), а меняются, пока пятна на миг притушены — переход прозрачностью,
  // она считается на видеокарте. Первый показ — сразу.
  if (!el.dataset.ready || matchMedia('(pointer: fine)').matches) {
    el.dataset.ready = '1'
    apply()
    return
  }
  el.classList.add('is-swapping')
  setTimeout(() => {
    apply()
    requestAnimationFrame(() => el.classList.remove('is-swapping'))
  }, 260)
}, { immediate: true, flush: 'post' })

// «Дыхание» от басов: только компьютер, только когда анализатор работает (трек Яндекса с CORS)
let frame = 0
let beat = 0
const bins = new Uint8Array(64)
function tick() {
  const node = p.analyserNode()
  if (node && p.isPlaying.value) {
    node.getByteFrequencyData(bins)
    // Нижние полосы спектра — бас
    let sum = 0
    for (let i = 1; i < 7; i++) sum += bins[i]!
    const target = Math.max(0, sum / 6 / 255 - 0.35) / 0.65
    // Быстро вверх, медленно вниз — пульс, а не дрожание
    beat = target > beat ? beat + (target - beat) * 0.5 : beat * 0.92
  }
  else beat *= 0.9
  root.value?.style.setProperty('--lb-beat', beat.toFixed(3))
  frame = requestAnimationFrame(tick)
}
onMounted(() => {
  if (matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) frame = requestAnimationFrame(tick)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div ref="root" class="living" :class="{ 'is-paused': !p.isPlaying.value }" aria-hidden="true">
    <span class="living__blob is-1" />
    <span class="living__blob is-2" />
    <span class="living__blob is-3" />
    <span class="living__blob is-4" />
    <span class="living__veil" />
  </div>
</template>

<style lang="scss" scoped>
@property --lb-c1 { syntax: '<color>'; inherits: true; initial-value: #6b5bd6; }
@property --lb-c2 { syntax: '<color>'; inherits: true; initial-value: #3a3a6e; }
@property --lb-c3 { syntax: '<color>'; inherits: true; initial-value: #9b8cff; }
@property --lb-c4 { syntax: '<color>'; inherits: true; initial-value: #2b2b45; }

.living {
  --lb-beat: 0;

  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--c-bg);
  // Цвета новой песни перетекают плавно — только на компьютере. На iPhone такой переход перерисовывал
  // четыре огромных пятна каждый кадр (и Safari сбоил с цветами): там цвета сменяются, пока пятна на миг притушены
  @media (pointer: fine) {
    transition: --lb-c1 1.6s var(--ease), --lb-c2 1.6s var(--ease), --lb-c3 1.6s var(--ease), --lb-c4 1.6s var(--ease);
  }

  &__blob {
    position: absolute;
    width: 75vmax;
    height: 75vmax;
    border-radius: 50%;
    opacity: 0.75;
    will-change: transform;
    // «Дыхание» от басов — отдельным свойством scale, чтобы не мешать движению (transform)
    scale: calc(1 + var(--lb-beat) * 0.14);

    &.is-1 {
      top: -25vmax;
      left: -20vmax;
      background: radial-gradient(closest-side, var(--lb-c1), transparent);
      animation: lb-a 23s ease-in-out infinite alternate;
    }

    &.is-2 {
      right: -25vmax;
      top: -10vmax;
      background: radial-gradient(closest-side, var(--lb-c2), transparent);
      animation: lb-b 29s ease-in-out infinite alternate;
    }

    &.is-3 {
      bottom: -30vmax;
      left: -5vmax;
      background: radial-gradient(closest-side, var(--lb-c3), transparent);
      animation: lb-c 26s ease-in-out infinite alternate;
    }

    &.is-4 {
      right: -20vmax;
      bottom: -25vmax;
      background: radial-gradient(closest-side, var(--lb-c4), transparent);
      animation: lb-d 33s ease-in-out infinite alternate;
    }
  }

  &__blob {
    transition: scale 0.12s linear, opacity 0.26s var(--ease);
  }

  &.is-swapping &__blob {
    opacity: 0.2;
  }

  // На паузе — движение замирает
  &.is-paused &__blob {
    animation-play-state: paused;
  }

  // Затемнение для читаемости текста (в светлой теме — высветление)
  &__veil {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(120% 90% at 50% 40%, transparent, color-mix(in srgb, var(--c-bg) 55%, transparent)),
      color-mix(in srgb, var(--c-bg) 32%, transparent);
  }
}

@keyframes lb-a {
  to { transform: translate(30vmax, 22vmax) rotate(40deg); }
}

@keyframes lb-b {
  to { transform: translate(-26vmax, 30vmax) rotate(-30deg); }
}

@keyframes lb-c {
  to { transform: translate(28vmax, -24vmax) rotate(25deg); }
}

@keyframes lb-d {
  to { transform: translate(-30vmax, -20vmax) rotate(-45deg); }
}
</style>
