<script setup lang="ts">
import { Minimize2 } from 'lucide-vue-next'
import { PlayerControls, PlayerProgress } from '@/features/player-controls'
import { usePlayer } from '@/entities/player'
import { TrackVideo } from '@/entities/track'
import { UiCover, UiIconButton } from '@/shared/ui'
import { useCurrentLyrics } from '../model/lyrics'
import LivingBackground from './LivingBackground.vue'
import LyricsPanel from './LyricsPanel.vue'

/**
 * Полноэкранный режим «Сейчас играет»: «живой» фон из цветов обложки, текст песни с заливкой по ходу песни.
 * Телефон: сверху маленькая обложка и название, по центру текст, снизу прогресс и кнопки.
 * Компьютер: слева «дышащая» обложка, справа текст; управление прячется, пока мышь не двигается.
 * Без текста — крупная обложка по центру.
 */
const emit = defineEmits<{ exit: [] }>()
const p = usePlayer()
const { lyrics, status } = useCurrentLyrics()

const track = computed(() => p.current.value!)
const showLyrics = computed(() => status.value === 'pending' || !!(lyrics.value?.synced || lyrics.value?.plain))

// Прятать управление — только на компьютере (на телефоне кнопки нужны всегда, мыши нет)
const idle = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function wake() {
  idle.value = false
  clearTimeout(timer)
  if (matchMedia('(pointer: fine)').matches) timer = setTimeout(() => (idle.value = true), 3000)
}
onMounted(wake)
onBeforeUnmount(() => clearTimeout(timer))
const hidden = computed(() => idle.value && p.isPlaying.value)
// Видеообложка — только на компьютере: на iPhone большое видео поверх всего остального съедало память (вылетала вкладка)
const withVideo = import.meta.client && matchMedia('(pointer: fine)').matches
</script>

<template>
  <div class="imm" :class="{ 'is-idle': hidden, 'has-lyrics': showLyrics }" @pointermove="wake" @pointerdown="wake">
    <LivingBackground />

    <!-- Телефон: обложка и название сверху -->
    <header class="imm__top">
      <UiCover :src="track.coverUrl" :size="56" rounded="md" class="imm__thumb" />
      <div class="imm__meta">
        <span class="imm__title">{{ track.title }}</span>
        <span class="imm__artists">{{ track.artists.join(', ') }}</span>
      </div>
      <UiIconButton label="Выйти из полноэкранного режима" variant="filled" class="imm__exit" @click="emit('exit')">
        <Minimize2 />
      </UiIconButton>
    </header>

    <div class="imm__stage">
      <div class="imm__art" :class="{ 'is-playing': p.isPlaying.value }">
        <!-- Квадрат обложки — свои границы: видеообложка ложится ровно поверх неё, а не на весь экран -->
        <div class="imm__frame">
          <UiCover :src="track.coverUrl" :size="720" rounded="md" :fade="false" class="imm__cover" />
          <TrackVideo v-if="withVideo" :track="track" :playing="p.isPlaying.value" />
        </div>
        <div class="imm__art-meta">
          <span class="imm__title">{{ track.title }}</span>
          <span class="imm__artists">{{ track.artists.join(', ') }}</span>
        </div>
      </div>
      <div v-if="showLyrics" class="imm__lyrics">
        <LyricsPanel karaoke />
      </div>
    </div>

    <footer class="imm__dock">
      <PlayerProgress stacked class="imm__progress" />
      <PlayerControls size="lg" class="imm__controls" />
    </footer>
  </div>
</template>

<style lang="scss" scoped>
.imm {
  position: fixed;
  inset: 0;
  z-index: 5;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  color: var(--c-text);

  &.is-idle {
    cursor: none;
  }

  // ---------- Верх (телефон): обложка, название, выход ----------
  &__top {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: calc(var(--space-4) + env(safe-area-inset-top)) var(--space-4) var(--space-2);
  }

  &__thumb {
    flex: none;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
  }

  &__meta {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  &__title {
    @include truncate;

    font-size: var(--fs-lg);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  &__artists {
    @include truncate;

    color: var(--c-text-muted);
  }

  &__exit {
    flex: none;
    margin-left: auto;
  }

  // ---------- Центр: текст (или крупная обложка) ----------
  &__stage {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    // Строка сетки не растёт под длинный текст — иначе он заезжает под прогресс и кнопки
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    padding: 0 var(--space-4);
  }

  &__art {
    display: none;
  }

  &__lyrics {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  // Без текста — квадратная обложка по центру, под ней крупно название и исполнитель
  &:not(.has-lyrics) &__art {
    display: grid;
    align-self: center;
    justify-self: center;
    justify-items: center;
    gap: var(--space-5);
    width: min(100%, 44vh, 420px);
  }

  &:not(.has-lyrics) &__art-meta {
    gap: var(--space-1);

    .imm__title {
      font-size: var(--fs-xl);
    }

    .imm__artists {
      font-size: var(--fs-md);
    }
  }

  &:not(.has-lyrics) &__top &__thumb,
  &:not(.has-lyrics) &__top &__meta {
    visibility: hidden;
  }

  &__art-meta {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    width: 100%;
    text-align: center;

    // Длинное название — многоточием, а не за край
    > * {
      max-width: 100%;
    }
  }

  &__frame {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-lg);
    box-shadow: 0 30px 70px rgb(0 0 0 / 0.4);
  }

  &__cover {
    width: 100% !important;
    height: 100% !important;
    border-radius: inherit !important;
  }

  // ---------- Низ: прогресс и кнопки ----------
  &__dock {
    position: relative;
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom));
  }

  &__controls {
    justify-content: space-between;
  }

  &__dock,
  &__top,
  &__exit {
    transition: opacity 0.5s var(--ease), transform 0.5s var(--ease);
  }

  // ---------- Компьютер: обложка слева, текст справа ----------
  @include up(md) {
    &__top {
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
      z-index: 2;
      justify-content: flex-end;
      padding: var(--space-5) var(--space-6);
    }

    &__thumb,
    &__top &__meta {
      display: none;
    }

    &__stage {
      grid-row: 1 / 3;
      grid-template-columns: minmax(0, min(52vh, 36vw)) minmax(0, 1fr);
      align-items: center;
      gap: 6vw;
      padding: 8vh 7vw 4vh;
    }

    &:not(.has-lyrics) &__stage {
      grid-template-columns: minmax(0, 1fr);
    }

    &.has-lyrics &__art {
      display: grid;
      gap: var(--space-4);
    }

    &__art-meta {
      justify-items: start;
      text-align: left;
    }

    &:not(.has-lyrics) &__art-meta {
      justify-items: center;
      text-align: center;
    }

    &__title {
      font-size: var(--fs-xl);
    }

    &__lyrics {
      height: 80vh;
    }

    &__dock {
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      grid-template-areas: 'progress progress progress' '. controls .';
      padding: var(--space-4) 7vw var(--space-6);
    }

    &__progress {
      grid-area: progress;
    }

    &__controls {
      grid-area: controls;
      justify-content: center;
    }

    // Мышь замерла — остаются фон, обложка и текст
    &.is-idle &__dock {
      opacity: 0;
      transform: translateY(12px);
      pointer-events: none;
    }

    &.is-idle &__exit {
      opacity: 0;
      pointer-events: none;
    }
  }

  // Обложка «дышит», пока играет музыка
  &__art.is-playing &__frame {
    animation: imm-breathe 5s ease-in-out infinite alternate;
  }
}

@keyframes imm-breathe {
  from {
    transform: scale(0.985);
  }

  to {
    transform: scale(1.015);
  }
}
</style>
