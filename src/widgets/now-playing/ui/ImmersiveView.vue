<script setup lang="ts">
import { Disc3, MicVocal, Minimize2 } from 'lucide-vue-next'
import { PlayerControls, PlayerProgress } from '@/features/player-controls'
import { usePlayer } from '@/entities/player'
import { useVinylCovers } from '@/entities/preferences'
import { TrackVideo } from '@/entities/track'
import { coverOfSize, useTilt } from '@/shared/lib'
import { UiCover, UiIconButton } from '@/shared/ui'
import { useCurrentLyrics } from '../model/lyrics'
import FlipCover from './FlipCover.vue'
import LivingBackground from './LivingBackground.vue'
import LyricsPanel from './LyricsPanel.vue'

/**
 * Полноэкранный режим «Сейчас играет»: «живой» фон из цветов обложки, текст песни с заливкой по ходу песни.
 * Телефон: компактно, переключатель «обложка / текст» сверху (выбор помнится); текста нет — только обложка.
 * Компьютер: слева «дышащая» обложка, справа текст; управление прячется, пока мышь не двигается.
 */
const emit = defineEmits<{ exit: [] }>()
const p = usePlayer()
const { hasLyrics, status } = useCurrentLyrics()

const track = computed(() => p.current.value!)

// Пока текст новой песни грузится — раскладка не меняется (остаётся, как была): без лишних перестроек экрана
const lyricsShown = ref(hasLyrics.value)
watch([hasLyrics, status], ([has, st]) => {
  if (st !== 'pending') lyricsShown.value = has
}, { immediate: true })

// Телефон: что показывать — текст или обложку (помним выбор)
const KEY = 'imm:text'
const wantText = ref(true)
try {
  wantText.value = localStorage.getItem(KEY) !== '0'
}
catch {}
function toggleText() {
  wantText.value = !wantText.value
  try {
    localStorage.setItem(KEY, wantText.value ? '1' : '0')
  }
  catch {}
}
const textMode = computed(() => lyricsShown.value && wantText.value)

// Прятать управление — только на компьютере (на телефоне кнопки нужны всегда, мыши нет)
const desktop = matchMedia('(pointer: fine)').matches
const idle = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function wake() {
  idle.value = false
  clearTimeout(timer)
  if (desktop) timer = setTimeout(() => (idle.value = true), 3000)
}
onMounted(wake)
onBeforeUnmount(() => clearTimeout(timer))
const hidden = computed(() => idle.value && p.isPlaying.value)

// Наклон обложки за курсором, блик и свечение — как у обложки в карточке (только мышь/трекпад)
const art = ref<HTMLElement | null>(null)
useTilt(art, { max: 10 })

// «Обложки как пластинки»: сторона общая с карточкой
const vinyl = useVinylCovers()
const flipped = useState('np:flipped', () => false)
</script>

<template>
  <div
    class="imm"
    :class="{ 'is-idle': hidden, 'has-lyrics': lyricsShown, 'is-text': textMode }"
    @pointermove="wake"
    @pointerdown="wake"
  >
    <LivingBackground />

    <header class="imm__top">
      <!-- Телефон, режим текста: маленькая обложка и название -->
      <div class="imm__head">
        <UiCover :src="track.coverUrl" :size="48" rounded="md" class="imm__thumb" />
        <div class="imm__meta">
          <span class="imm__title">{{ track.title }}</span>
          <span class="imm__artists">{{ track.artists.join(', ') }}</span>
        </div>
      </div>
      <UiIconButton
        v-if="lyricsShown"
        :label="textMode ? 'Показать обложку' : 'Показать текст'"
        variant="filled"
        class="imm__toggle"
        @click="toggleText"
      >
        <Disc3 v-if="textMode" />
        <MicVocal v-else />
      </UiIconButton>
      <UiIconButton label="Выйти из полноэкранного режима" variant="filled" class="imm__exit" @click="emit('exit')">
        <Minimize2 />
      </UiIconButton>
    </header>

    <div class="imm__stage">
      <div ref="art" class="imm__art" :class="{ 'is-playing': p.isPlaying.value }">
        <!-- Наклон — на обёртке (у квадрата своя анимация «дыхания» — transform не должен спорить) -->
        <div class="imm__tilt">
          <img v-if="desktop && track.coverUrl" :src="coverOfSize(track.coverUrl, 100)" class="imm__glow" alt="" aria-hidden="true">
          <!-- Тема «пластинки»: спереди обложка, сзади винил; нажатие переворачивает -->
          <FlipCover
            :vinyl="vinyl"
            :flipped="flipped"
            :src="track.coverUrl"
            :playing="p.isPlaying.value"
            :class="{ 'imm__flip': vinyl }"
            @click="vinyl && (flipped = !flipped)"
          >
            <!-- Квадрат обложки — свои границы: видеообложка ложится ровно поверх неё, а не на весь экран -->
            <div class="imm__frame">
              <UiCover :src="track.coverUrl" :size="720" rounded="md" :fade="false" class="imm__cover" />
              <!-- Видеообложка — только на компьютере: на iPhone большое видео в этом режиме съедало память -->
              <TrackVideo v-if="desktop" :track="track" :playing="p.isPlaying.value" />
              <span class="imm__glare" aria-hidden="true" />
            </div>
          </FlipCover>
        </div>
        <div class="imm__art-meta">
          <span class="imm__title">{{ track.title }}</span>
          <span class="imm__artists">{{ track.artists.join(', ') }}</span>
        </div>
      </div>
      <div v-if="lyricsShown" class="imm__lyrics">
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
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  color: var(--c-text);

  &.is-idle {
    cursor: none;
  }

  &__top {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 44px;
    padding: calc(var(--space-3) + env(safe-area-inset-top)) var(--space-4) var(--space-2);
  }

  &__head {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    opacity: 0;
    transition: opacity 0.3s var(--ease);
  }

  // Шапка с названием — только в режиме текста (в режиме обложки название под обложкой)
  &.is-text &__head {
    opacity: 1;
  }

  &__thumb {
    flex: none;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.3);
  }

  &__meta {
    display: grid;
    min-width: 0;
  }

  &__title {
    @include truncate;

    font-size: var(--fs-md);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  &__artists {
    @include truncate;

    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &__toggle,
  &__exit {
    flex: none;
  }

  // ---------- Центр: обложка или текст ----------
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
    display: grid;
    align-self: center;
    justify-self: center;
    justify-items: center;
    gap: var(--space-4);
    width: min(100%, 40vh, 360px);
    animation: imm-in 0.35s var(--ease);
  }

  // 3D-наклон за курсором (переменные --tilt-* пишет useTilt на .imm__art)
  &__art {
    perspective: 1100px;
  }

  &__tilt {
    position: relative;
    width: 100%;
    transform: rotateX(var(--tilt-rx, 0deg)) rotateY(var(--tilt-ry, 0deg));
    transform-style: preserve-3d;
    transition: transform 0.6s var(--ease);
  }

  // Пока курсор двигается — следуем быстро, после ухода — плавно возвращаемся
  &__art:hover &__tilt {
    transition-duration: 0.12s;
  }

  // Свечение: та же обложка, сильно размытая под квадратом, смещается против наклона
  // Сторона с пластинкой — свечение круглое, как сама пластинка
  &__art:has(.flip.is-flipped) &__glow {
    border-radius: 50%;
  }

  &__glow {
    position: absolute;
    inset: 8% 6% -6%;
    width: 88%;
    height: 98%;
    object-fit: cover;
    border-radius: var(--radius-lg);
    filter: blur(40px) saturate(1.6);
    opacity: 0.7;
    transform: translate3d(calc(var(--tilt-x, 0) * -18px), calc(var(--tilt-y, 0) * -18px), -40px);
    transition: transform 0.6s var(--ease), border-radius 0.6s var(--ease);
    pointer-events: none;
  }

  // Блик: светлое пятно под курсором поверх обложки
  &__glare {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: radial-gradient(
      circle at var(--tilt-gx, 50%) var(--tilt-gy, 50%),
      rgb(255 255 255 / 0.35),
      rgb(255 255 255 / 0.08) 35%,
      transparent 65%
    );
    mix-blend-mode: soft-light;
    opacity: var(--tilt-active, 0);
    transition: opacity 0.4s var(--ease);
    pointer-events: none;
  }

  &__flip {
    cursor: pointer;
  }

  &__frame {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 60px rgb(0 0 0 / 0.4);
  }

  &__cover {
    width: 100% !important;
    height: 100% !important;
    border-radius: inherit !important;
  }

  &__art-meta {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: 2px;
    width: 100%;
    text-align: center;

    // Длинное название — многоточием, а не за край
    > * {
      max-width: 100%;
    }

    .imm__title {
      font-size: var(--fs-xl);
    }

    .imm__artists {
      font-size: var(--fs-md);
    }
  }

  &__lyrics {
    display: none;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  // Телефон, режим текста: вместо обложки — текст
  &.is-text &__art {
    display: none;
  }

  &.is-text &__lyrics {
    display: block;
    animation: imm-in 0.35s var(--ease);
  }

  // ---------- Низ: прогресс и кнопки ----------
  &__dock {
    position: relative;
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-5) calc(var(--space-4) + env(safe-area-inset-bottom));
  }

  &__controls {
    justify-content: space-between;
  }

  &__dock,
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

    &__head,
    &__toggle {
      display: none;
    }

    &__stage {
      grid-row: 1 / 3;
      align-items: center;
      gap: 6vw;
      padding: 8vh 7vw 4vh;
    }

    &.has-lyrics &__stage {
      grid-template-columns: minmax(0, min(52vh, 36vw)) minmax(0, 1fr);
    }

    // На компьютере обложка и текст видны вместе
    &.is-text &__art,
    &__art {
      display: grid;
      width: min(100%, 52vh, 520px);
    }

    &.has-lyrics &__art {
      width: 100%;
    }

    &.has-lyrics &__lyrics {
      display: block;
      height: 80vh;
    }

    &.has-lyrics &__art-meta {
      justify-items: start;
      text-align: left;
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

  // Обложка «дышит», пока играет музыка (только компьютер: на телефоне — без лишней работы)
  @media (pointer: fine) {
    &__art.is-playing &__frame {
      animation: imm-breathe 5s ease-in-out infinite alternate;
    }
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

@keyframes imm-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
