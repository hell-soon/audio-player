<script setup lang="ts">
import { AudioLines, Play } from 'lucide-vue-next'
import { usePlayer } from '@/entities/player'

/**
 * «Миксы из двух сервисов» — плитки десятилетий и жанров. Нажатие запускает бесконечный поток случайной
 * музыки сразу из Яндекса и Spotify (/api/radio, station: 'blend'). Звук — из клика (startRadio сам
 * разблокирует его до запроса, iOS).
 */
defineProps<{ /** Лента в одну строку с прокруткой вбок (главная) вместо сетки */ row?: boolean }>()
const p = usePlayer()
const activeId = computed(() => (p.radioSource.value?.station === 'blend' ? p.radioSource.value.id : null))

function start(b: BlendPreset) {
  if (activeId.value === b.id) return p.toggle()
  p.startRadio({ station: 'blend', id: b.id, name: b.title })
}
</script>

<template>
  <div class="blends" :class="{ 'is-row': row }">
    <button
      v-for="b in BLEND_PRESETS"
      :key="b.id"
      type="button"
      class="blend"
      :class="{ 'is-active': activeId === b.id }"
      :style="{ '--b1': b.colors[0], '--b2': b.colors[1] }"
      :aria-label="`${b.title}: включить поток`"
      @click="start(b)"
    >
      <span class="blend__title">{{ b.title }}</span>
      <span class="blend__sub">{{ b.subtitle }}</span>
      <span class="blend__icon" aria-hidden="true">
        <AudioLines v-if="activeId === b.id && p.isPlaying.value" />
        <Play v-else fill="currentColor" />
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.blends {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(160px, 45%), 1fr));
  gap: var(--space-3);

  &.is-row {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: clamp(150px, 16%, 200px);
    margin: 0 calc(var(--space-2) * -1);
    padding: 2px var(--space-2);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    > .blend {
      scroll-snap-align: start;
    }

    @include down(md) {
      grid-auto-columns: 42%;
      margin: 0 calc(var(--space-4) * -1);
      padding: 2px var(--space-4);
      scroll-padding-inline: var(--space-4);
    }
  }
}

.blend {
  @include reset-button;
  @include focus-ring;

  position: relative;
  display: grid;
  align-content: end;
  gap: 2px;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  // Цвета — из данных микса; «пятно» второго цвета в углу — чтобы плитки не были плоскими
  background:
    radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--b2) 85%, transparent), transparent 60%),
    linear-gradient(150deg, var(--b1), color-mix(in srgb, var(--b2) 70%, #000));
  color: #fff;
  text-align: left;
  isolation: isolate;
  transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);

  @include hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);

    .blend__icon {
      opacity: 1;
      transform: none;
    }
  }

  &:active {
    transform: scale(0.97);
  }

  &.is-active {
    box-shadow: 0 0 0 2px var(--c-text), var(--shadow-lg);

    .blend__icon {
      opacity: 1;
      transform: none;
    }
  }

  &__title {
    font-size: var(--fs-md);
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.15;
    text-shadow: 0 1px 8px rgb(0 0 0 / 0.25);
  }

  &__sub {
    @include truncate;

    font-size: var(--fs-xs);
    opacity: 0.85;
  }

  // Кнопка «играть» в углу: на компьютере появляется при наведении, на телефоне видна всегда
  &__icon {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.35);
    opacity: 0;
    transform: scale(0.85);
    transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);

    svg {
      width: 55%;
      height: 55%;
    }

    @media (pointer: coarse) {
      opacity: 1;
      transform: none;
    }
  }
}
</style>
