<script setup lang="ts">
import { stationLink } from '../model/genres'

/**
 * Плитка станции (жанр, настроение, эпоха, занятие): «стекло» с мягким свечением цвета станции (@include color-tile),
 * название и (если есть) значок в углу. Ведёт на плейлист станции на сегодня.
 *
 * Значки Яндекса — белые линии: на светлой теме их не видно. Поэтому значок — маска (`mask-image`), окрашенная
 * в цвет плитки. Маске нужна картинка с нашего домена (иначе CORS) — берём её через прокси обложек /api/cover.
 * Загрузилась ли картинка — проверяем `new Image()` (не элементом на странице: глобальный стиль `img` перебивал
 * атрибут hidden, и белый значок вставал поверх названия). Нет значка — просто название и свечение.
 */
const props = defineProps<{ station: StationInfo }>()
const iconSrc = computed(() => (props.station.iconUrl ? `/api/cover?size=100&url=${encodeURIComponent(props.station.iconUrl)}` : null))
const iconOk = ref(false)

watch(iconSrc, (src) => {
  iconOk.value = false
  if (!src || !import.meta.client) return
  const img = new Image()
  img.onload = () => {
    if (iconSrc.value === src) iconOk.value = true
  }
  img.src = src
}, { immediate: true })

const style = computed(() => ({
  ...(props.station.color ? { '--tile': props.station.color } : {}),
  ...(iconOk.value && iconSrc.value ? { '--icon': `url("${iconSrc.value}")` } : {}),
}))
</script>

<template>
  <NuxtLink :to="stationLink(station)" class="genre-tile" :style="style">
    <span class="genre-tile__name">{{ station.name }}</span>
    <span v-if="iconOk" class="genre-tile__icon" aria-hidden="true" />
  </NuxtLink>
</template>

<style lang="scss" scoped>
.genre-tile {
  @include focus-ring;
  @include color-tile;

  &__name {
    @include color-tile-name;
  }

  // Значок станции — в углу наискосок, цветом плитки, не спорит с названием
  &__icon {
    position: absolute;
    right: -4%;
    bottom: -8%;
    width: 42%;
    aspect-ratio: 1;
    background: var(--ink);
    opacity: 0.55;
    mask: var(--icon) center / contain no-repeat;
    transform: rotate(14deg);
    pointer-events: none;
  }
}
</style>
