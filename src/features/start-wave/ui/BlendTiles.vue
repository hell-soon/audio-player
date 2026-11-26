<script setup lang="ts">
import { AudioLines, Play } from 'lucide-vue-next'
import { usePlayer } from '@/entities/player'

/**
 * «Миксы по годам» — плитки десятилетий и жанров в стиле плиток жанров (@include color-tile): название сверху,
 * в углу наискосок — цифры десятилетия контуром (как значки эпох у Яндекса). Нажатие запускает бесконечный
 * поток сразу из Яндекса и Spotify (/api/radio, station: 'blend'); звук — из клика (startRadio сам его
 * разблокирует до запроса, iOS). Раскладка — как у «Жанров дня»: сетка, на телефоне — лента.
 */
const props = defineProps<{
  /** Сколько плиток показать (на главной — один ряд) */
  limit?: number
  /** На телефоне — лента вбок (главная), иначе сетка (страница жанров) */
  strip?: boolean
  compact?: boolean
}>()
const p = usePlayer()
const list = computed(() => BLEND_PRESETS.slice(0, props.limit ?? BLEND_PRESETS.length))
const activeId = computed(() => (p.radioSource.value?.station === 'blend' ? p.radioSource.value.id : null))

function start(b: BlendPreset) {
  if (activeId.value === b.id) return p.toggle()
  p.startRadio({ station: 'blend', id: b.id, name: b.title })
}
</script>

<template>
  <div class="blends" :class="{ 'is-strip': strip, 'is-compact': compact }">
    <button
      v-for="b in list"
      :key="b.id"
      type="button"
      class="blend"
      :class="{ 'is-active': activeId === b.id }"
      :style="compact ? undefined : { '--tile': b.colors[0] }"
      :aria-label="`${b.title}: включить поток`"
      @click="start(b)"
    >
      <!-- Неразрывный дефис: «20-х» не рвётся на «20-» и «х» -->
      <span class="blend__name">{{ b.title.replace(/-(?=х)/g, '\u2011') }}</span>
      <span v-if="!compact" class="blend__art" aria-hidden="true">{{ String(b.from).slice(2) }}</span>
      <span class="blend__play" aria-hidden="true">
        <AudioLines v-if="activeId === b.id && p.isPlaying.value" />
        <Play v-else fill="currentColor" />
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
// Сетка — как у «Жанров дня» на главной: на компьютере плитки по 180+ px, на телефоне — лента вбок
.blends {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(180px, 45%), 1fr));
  gap: var(--space-3);

  &.is-strip {
    @include down(md) {
      grid-template-columns: none;
      grid-auto-columns: 42%;
      grid-auto-flow: column;
      margin: 0 calc(var(--space-4) * -1);
      padding: 0 var(--space-4);
      overflow-x: auto;
      scroll-padding-inline: var(--space-4);
      scroll-snap-type: x mandatory;
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }

      > .blend {
        scroll-snap-align: start;
      }
    }
  }
}

.blend {
  @include reset-button;
  @include focus-ring;
  @include color-tile;

  // Цифры — от ширины плитки: занимают нижний правый угол и не наезжают на название
  container-type: inline-size;

  &.is-active {
    border-color: color-mix(in oklab, var(--tint) 70%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--tint) 70%, transparent);

    .blend__play {
      opacity: 1;
      transform: none;
    }
  }

  @include hover {
    .blend__play {
      opacity: 1;
      transform: none;
    }
  }

  &__name {
    @include color-tile-name;
  }

  // Цифры десятилетия — контуром, крупно и наискосок в углу, как значки станций
  &__art {
    @include color-tile-glyph;

    right: -3%;
    bottom: -20%;
    font-size: 44cqw;
    letter-spacing: -0.06em;
    transform: rotate(-12deg);
  }

  // «Играть» — внизу слева: на компьютере при наведении, у играющего — всегда (с эквалайзером)
  &__play {
    position: absolute;
    left: var(--space-3);
    bottom: var(--space-3);
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--c-accent);
    color: var(--c-on-accent);
    opacity: 0;
    transform: scale(0.85);
    transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);

    svg {
      width: 50%;
      height: 50%;
    }
  }
}

.is-compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);

  .blend {
    grid-template-columns: minmax(0, 1fr) auto;
    align-content: center;
    align-items: center;
    gap: var(--space-1);
    aspect-ratio: auto;
    min-height: 52px;
    background: var(--c-surface);

    @include hover {
      background: var(--c-surface-hover);
      box-shadow: none;
      transform: none;
    }
  }

  .blend__name {
    max-width: none;
    font-size: var(--fs-sm);
  }

  .blend__play {
    position: static;
    width: 16px;
    height: 16px;
    background: none;
    color: var(--c-text);

    svg {
      width: 100%;
      height: 100%;
    }
  }
}
</style>
