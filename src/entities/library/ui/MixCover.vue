<script setup lang="ts">
import { coverAccent, coverOfSize } from '@/shared/lib'

/**
 * Обложка подборки «как микс дня в Spotify»: одна картинка из подборки во весь квадрат,
 * снизу — полупрозрачная полоса её же цвета с названием. Цвет считается в браузере (до этого — акцент темы).
 */
const props = withDefaults(defineProps<{ src?: string, title: string, size?: number }>(), { size: 400 })
const tint = ref<string | null>(null)
const failed = ref(false)

watch(() => props.src, async (src) => {
  failed.value = false
  tint.value = null
  if (!src || import.meta.server) return
  const a = await coverAccent(src).catch(() => null)
  // Насыщенный тёмный вариант цвета — белый текст на нём читается
  if (props.src === src && a) tint.value = a.light
}, { immediate: true })
</script>

<template>
  <div class="mix-cover" :style="tint ? { '--tint': tint } : undefined">
    <img v-if="src && !failed" :src="coverOfSize(src, size)" alt="" loading="lazy" @error="failed = true">
    <span class="mix-cover__corner" aria-hidden="true" />
    <span class="mix-cover__band">
      <span class="mix-cover__title">{{ title }}</span>
    </span>
  </div>
</template>

<style lang="scss" scoped>
.mix-cover {
  --tint: var(--c-accent);

  position: relative;
  display: block;
  overflow: hidden;
  aspect-ratio: 1;
  // Размер шрифта названия — от ширины обложки (cqi), а не экрана
  container-type: inline-size;
  border-radius: var(--radius-md);
  // Пока нет картинки — цвет подборки
  background: linear-gradient(160deg, var(--tint), color-mix(in srgb, var(--tint) 40%, #000));

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  // Цветной уголок сверху слева — «метка» подборки, как у миксов Spotify
  &__corner {
    position: absolute;
    top: 0;
    left: 0;
    width: 22%;
    height: 8%;
    border-bottom-right-radius: var(--radius-sm);
    background: var(--tint);
    transition: background-color 0.4s var(--ease);
  }

  &__band {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: flex-end;
    min-height: 26%;
    padding: 6% 7%;
    background: color-mix(in srgb, var(--tint) 88%, transparent);
    transition: background-color 0.4s var(--ease);
  }

  &__title {
    color: #fff;
    font-size: clamp(0.95rem, 4.2cqi, 1.6rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.05;
    text-shadow: 0 1px 8px rgb(0 0 0 / 0.25);
  }
}
</style>
