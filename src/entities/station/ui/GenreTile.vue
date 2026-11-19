<script setup lang="ts">
import { stationLink } from '../model/genres'

/**
 * Плитка станции (жанр, настроение, эпоха, занятие): «стекло» с мягким свечением цвета станции (@include color-tile),
 * название, значок наискосок в углу. Ведёт на плейлист станции на сегодня.
 *
 * Значки Яндекса — белые линии: на светлой теме их не видно. Поэтому значок — маска (`mask-image`), окрашенная
 * в цвет плитки. Маске нужна картинка с нашего домена (иначе CORS) — берём её через прокси обложек /api/cover;
 * невидимый <img> с тем же адресом узнаёт, загрузилась ли она (не загрузилась — буква контуром).
 */
const props = defineProps<{ station: StationInfo }>()
const broken = ref(false)
const letter = computed(() => props.station.name.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase())
const iconSrc = computed(() => (props.station.iconUrl ? `/api/cover?size=100&url=${encodeURIComponent(props.station.iconUrl)}` : null))
const style = computed(() => ({
  ...(props.station.color ? { '--tile': props.station.color } : {}),
  ...(iconSrc.value ? { '--icon': `url("${iconSrc.value}")` } : {}),
}))
</script>

<template>
  <NuxtLink :to="stationLink(station)" class="genre-tile" :style="style">
    <span class="genre-tile__name">{{ station.name }}</span>
    <template v-if="iconSrc && !broken">
      <span class="genre-tile__icon" aria-hidden="true" />
      <img :src="iconSrc" alt="" hidden @error="broken = true">
    </template>
    <!-- Без значка (или он повторяется у соседей — сервер его убрал): крупная буква контуром на его месте -->
    <span v-else class="genre-tile__letter" aria-hidden="true">{{ letter }}</span>
  </NuxtLink>
</template>

<style lang="scss" scoped>
.genre-tile {
  @include focus-ring;
  @include color-tile;

  &__name {
    @include color-tile-name;
  }

  // Значок станции — крупно и наискосок в углу, цветом плитки
  &__icon {
    position: absolute;
    right: -6%;
    bottom: -12%;
    width: 50%;
    aspect-ratio: 1;
    background: var(--ink);
    opacity: 0.75;
    mask: var(--icon) center / contain no-repeat;
    transform: rotate(18deg);
    pointer-events: none;
  }

  &__letter {
    @include color-tile-glyph;

    right: 2%;
    bottom: -24%;
    font-size: clamp(72px, 9vw, 112px);
    transform: rotate(18deg);
  }
}
</style>
