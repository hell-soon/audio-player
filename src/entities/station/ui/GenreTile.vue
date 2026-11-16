<script setup lang="ts">
import { stationLink } from '../model/genres'

/**
 * Плитка станции (жанр, настроение, эпоха, занятие): цвет станции, название, значок наискосок в углу.
 * Ведёт на плейлист станции на сегодня.
 */
const props = defineProps<{ station: StationInfo }>()
const bg = computed(() => props.station.color || 'var(--c-accent)')
const broken = ref(false)
</script>

<template>
  <NuxtLink :to="stationLink(station)" class="genre-tile" :style="{ '--tile': bg }">
    <span class="genre-tile__name">{{ station.name }}</span>
    <!-- Значок не загрузился — без «битой» картинки, плитка остаётся цветной с названием -->
    <img v-if="station.iconUrl && !broken" :src="station.iconUrl" class="genre-tile__icon" alt="" loading="lazy" decoding="async" @error="broken = true">
  </NuxtLink>
</template>

<style lang="scss" scoped>
.genre-tile {
  @include focus-ring;

  position: relative;
  display: block;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  // Цвет — из данных станции (Яндекс задаёт свой у каждой); внизу чуть темнее, чтобы название читалось
  background: linear-gradient(150deg, var(--tile), color-mix(in srgb, var(--tile) 70%, #000));
  color: #fff;
  isolation: isolate;
  transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);

  @include hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  &:active {
    transform: scale(0.97);
  }

  &__name {
    position: relative;
    z-index: 1;
    display: -webkit-box;
    overflow: hidden;
    max-width: 80%;
    font-size: var(--fs-md);
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.15;
    text-shadow: 0 1px 8px rgb(0 0 0 / 0.25);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  // Значок станции — крупно и наискосок в углу, как обложки в каталоге Spotify
  &__icon {
    position: absolute;
    right: -8%;
    bottom: -10%;
    width: 52%;
    aspect-ratio: 1;
    object-fit: contain;
    opacity: 0.9;
    transform: rotate(18deg);
    filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.25));
  }
}
</style>
