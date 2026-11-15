<script setup lang="ts">
import { usePlayer } from '@/entities/player'
import { coverAccent, coverOfSize, useLoadedSrc } from '@/shared/lib'

/**
 * Фон всего приложения: сильно размытая обложка текущего трека (или мягкие пятна акцента,
 * если ничего не играет). Цвет берётся самим размытием — без анализа пикселей и CORS.
 */
const props = defineProps<{ cover?: string }>()
const player = usePlayer()
// Размытому фону хватает маленькой картинки: после blur(90px) разницы не видно, а декодировать в разы дешевле
const src = useLoadedSrc(() => coverOfSize(props.cover ?? player.current.value?.coverUrl, 100))

/**
 * Оттенок обложки — на фон страницы (<html>) и в theme-color: iPhone красит этим цветом полоску статус-бара,
 * и она сливается с размытым фоном, а не остаётся чёрной. Ничего не играет — обычный фон темы.
 */
const themeColor = useState('ambient:theme-color', () => '')
if (import.meta.client) {
  watch(() => props.cover ?? player.current.value?.coverUrl, async (url) => {
    const root = document.documentElement
    const a = url ? await coverAccent(url).catch(() => null) : null
    if (!a) {
      root.style.removeProperty('--ambient-tint')
      themeColor.value = ''
      return
    }
    root.style.setProperty('--ambient-tint', a.light)
    // theme-color — готовым цветом (смешивание CSS сюда не годится): тёмная тема — глубокий оттенок, светлая — светлый
    const m = /hsl\((\d+(?:\.\d+)?)\s+(\d+)%/.exec(a.light)
    const dark = root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
    if (m) themeColor.value = dark ? `hsl(${m[1]} ${Math.round(+m[2]! * 0.45)}% 13%)` : `hsl(${m[1]} ${Math.round(+m[2]! * 0.5)}% 91%)`
  }, { immediate: true })
}
useHead({ meta: [{ key: 'theme-color', name: 'theme-color', content: () => themeColor.value || '#0e0e12' }] })
</script>

<template>
  <div class="ambient" aria-hidden="true">
    <div class="ambient__blobs" />
    <Transition name="ambient-fade">
      <img v-if="src" :key="src" :src="src" class="ambient__image" alt="">
    </Transition>
    <div class="ambient__veil" />
  </div>
</template>

<style lang="scss" scoped>
.ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  // Тот же оттенок обложки, что у <html> (за статус-баром) — верх экрана и полоска одного цвета
  background: color-mix(in srgb, var(--c-bg) 74%, var(--ambient-tint, var(--c-bg)));
  transition: background-color 1s var(--ease);
  pointer-events: none;

  &__blobs {
    position: absolute;
    inset: -20%;
    background:
      radial-gradient(40% 35% at 20% 15%, var(--c-accent-soft), transparent 70%),
      radial-gradient(35% 30% at 85% 30%, color-mix(in srgb, var(--c-accent) 10%, transparent), transparent 70%),
      radial-gradient(45% 40% at 60% 95%, var(--c-accent-soft), transparent 70%);
  }

  // Картинка вчетверо меньше с размытием 22px, растянутая ×4 — выглядит как blur(90px) на весь экран,
  // а считается в разы дешевле (заметно на телефонах при смене трека). Отдельный слой — не тормозит прокрутку.
  &__image {
    position: absolute;
    top: -15%;
    left: -15%;
    width: 32.5%;
    height: 32.5%;
    object-fit: cover;
    opacity: var(--ambient-opacity);
    filter: blur(22px) saturate(1.6);
    transform: scale(4);
    transform-origin: 0 0;
  }

  // Плавный переход к фону снизу — текст списков остаётся читаемым.
  &__veil {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--c-bg) 55%, transparent) 55%, var(--c-bg) 100%);
  }
}

.ambient-fade-enter-active,
.ambient-fade-leave-active {
  transition: opacity 1.2s var(--ease);
}

.ambient-fade-enter-from,
.ambient-fade-leave-to {
  opacity: 0;
}
</style>
