<script setup lang="ts">
import { Pause, Play, SlidersHorizontal } from 'lucide-vue-next'
import { usePlayer } from '@/entities/player'
import { UiDialog, UiSpinner, useToast } from '@/shared/ui'
import { DIVERSITY, MOODS, useWaveSettings, type WaveDiversity, type WaveMood } from '../model/wave-settings'

/**
 * «Моя волна»: бесконечный поток рекомендаций Яндекса.
 * На карточке — только главное: кнопка, название и одна «пилюля» с текущей настройкой;
 * настроение и характер выбираются в окне (раньше девять чипов прямо на карточке — тесно и пёстро).
 * Фон — «волна» из линий: плывёт всегда, пока играет — поднимается выше.
 */
defineProps<{ disabled?: boolean }>()
const p = usePlayer()
const toast = useToast()
const { mood, diversity, apply } = useWaveSettings()
const onWave = computed(() => p.radioStation.value === 'wave')
const playing = computed(() => onWave.value && p.isPlaying.value)
const canToggle = computed(() => onWave.value && !p.waveError.value)
const tuneOpen = ref(false)

function play() {
  if (canToggle.value) p.toggle()
  else p.startWave()
}

async function choose(kind: 'mood' | 'diversity', value: string) {
  if (kind === 'mood') mood.value = value as WaveMood
  else diversity.value = value as WaveDiversity
  try {
    await apply()
    // Волна уже играет — перезапускаем с новыми настройками.
    if (onWave.value) p.startWave()
  }
  catch {
    toast.error('Не удалось изменить настройки волны')
  }
}

/** «Настроить» — пока всё по умолчанию; иначе — что выбрано («Бодрое · Незнакомое») */
const summary = computed(() => {
  const parts = [
    mood.value !== 'all' ? MOODS.find(m => m.value === mood.value)?.label : '',
    diversity.value !== 'default' ? DIVERSITY.find(d => d.value === diversity.value)?.label : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Настроить'
})

/**
 * Линия-синусоида шириной в три периода: сдвиг на один период по кругу — бесшовное движение.
 * Строится один раз (SSR и клиент дают одну и ту же строку — без расхождений при гидрации).
 */
const PERIOD = 300
function wavePath(amp: number, y: number, phase: number) {
  let d = ''
  for (let x = 0; x <= PERIOD * 3; x += 10) {
    const v = y + amp * Math.sin(((x / PERIOD) * 2 + phase) * Math.PI)
    d += `${x ? 'L' : 'M'}${x} ${v.toFixed(1)}`
  }
  return d
}
const LINES = [
  { d: wavePath(18, 96, 0), cls: 'is-a' },
  { d: wavePath(12, 104, 0.6), cls: 'is-b' },
  { d: wavePath(24, 112, 1.2), cls: 'is-c' },
]
</script>

<template>
  <div class="wave" :class="{ 'is-playing': playing, 'is-disabled': disabled }">
    <svg class="wave__lines" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">
      <g class="wave__amp">
        <path v-for="l in LINES" :key="l.cls" :d="l.d" class="wave__line" :class="l.cls" />
      </g>
    </svg>

    <button type="button" class="wave__btn" :disabled="disabled || !!p.waveStartStatus.value" :aria-label="canToggle && playing ? 'Пауза' : 'Включить «Мою волну»'" @click="play">
      <UiSpinner v-if="p.waveStartStatus.value" />
      <Pause v-else-if="canToggle && playing" fill="currentColor" />
      <Play v-else fill="currentColor" />
    </button>

    <div class="wave__text">
      <h2 class="wave__title">
        Моя волна
      </h2>
      <p class="wave__sub" role="status">
        {{ p.waveStartStatus.value || (disabled ? 'Подключите Яндекс Музыку в настройках' : playing ? 'Играет — под ваш вкус' : 'Бесконечный поток под ваш вкус') }}
      </p>
    </div>

    <button v-if="!disabled" type="button" class="wave__tune" @click="tuneOpen = true">
      <SlidersHorizontal aria-hidden="true" />
      <span>{{ summary }}</span>
    </button>

    <UiDialog v-model:open="tuneOpen" title="Настроить волну">
      <div class="tune">
        <section class="tune__group">
          <h3 class="tune__label">
            Настроение
          </h3>
          <div class="tune__chips" role="radiogroup" aria-label="Настроение">
            <button
              v-for="m in MOODS"
              :key="m.value"
              type="button"
              role="radio"
              class="tune__chip"
              :aria-checked="mood === m.value"
              @click="choose('mood', m.value)"
            >
              {{ m.label }}
            </button>
          </div>
        </section>
        <section class="tune__group">
          <h3 class="tune__label">
            Характер
          </h3>
          <div class="tune__chips" role="radiogroup" aria-label="Характер">
            <button
              v-for="d in DIVERSITY"
              :key="d.value"
              type="button"
              role="radio"
              class="tune__chip"
              :aria-checked="diversity === d.value"
              @click="choose('diversity', d.value)"
            >
              {{ d.label }}
            </button>
          </div>
        </section>
        <p class="tune__hint">
          Настройки сохраняются в Яндекс Музыке. Если волна играет, она сразу перезапустится с новыми.
        </p>
      </div>
    </UiDialog>
  </div>
</template>

<style lang="scss" scoped>
.wave {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4) var(--space-5);
  min-height: 148px;
  padding: var(--space-5) var(--space-6);
  overflow: hidden;
  border-radius: var(--radius-xl);
  background: var(--wave-bg);
  color: var(--wave-text);
  box-shadow: var(--shadow-lg);

  &.is-disabled {
    filter: grayscale(0.6);
    opacity: 0.75;
  }

  // Волна из линий на всю карточку — заполняет ширину на компьютере
  &__lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  // Пока играет — волна «поднимается» (плавно, transform; скорость не меняем — иначе рывок фазы)
  &__amp {
    transform-origin: 50% 65%;
    transition: transform 0.8s var(--ease);
  }

  &.is-playing &__amp {
    transform: scaleY(1.7);
  }

  &__line {
    fill: none;
    stroke: rgb(255 255 255 / 0.22);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    animation: wave-drift 14s linear infinite;

    &.is-b {
      stroke: rgb(255 255 255 / 0.14);
      animation-duration: 19s;
    }

    &.is-c {
      stroke: rgb(255 255 255 / 0.1);
      animation-duration: 24s;
      animation-direction: reverse;
    }
  }

  &__btn {
    @include reset-button;
    @include focus-ring;

    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #fff;
    color: #17161d;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
    transition: transform var(--dur) var(--ease);

    @include hover {
      transform: scale(1.06);
    }

    &:active {
      transform: scale(0.95);
    }

    &:disabled {
      cursor: not-allowed;
    }

    svg {
      width: 24px;
      height: 24px;
      margin-left: 2px;
    }
  }

  &__text {
    position: relative;
    min-width: 0;
  }

  &__title {
    font-size: clamp(1.9rem, 3.2vw, 2.6rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  &__sub {
    margin-top: var(--space-2);
    color: rgb(255 255 255 / 0.85);
    font-size: var(--fs-sm);
  }

  // Одна «пилюля» вместо девяти чипов
  &__tune {
    @include reset-button;
    @include focus-ring;

    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 38px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-full);
    background: rgb(255 255 255 / 0.16);
    font-size: var(--fs-sm);
    font-weight: 600;
    white-space: nowrap;
    backdrop-filter: blur(8px);
    transition: background-color var(--dur-fast) var(--ease);

    @include hover {
      background: rgb(255 255 255 / 0.26);
    }

    svg {
      width: 16px;
      height: 16px;
    }
  }

  // Телефон: название слева, кнопка справа, «пилюля» строкой ниже
  @include down(md) {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'text btn'
      'tune tune';
    min-height: 0;
    padding: var(--space-5);

    &__text {
      grid-area: text;
    }

    &__btn {
      grid-area: btn;
    }

    &__tune {
      grid-area: tune;
      justify-self: start;
    }
  }
}

.tune {
  display: grid;
  gap: var(--space-5);

  &__group {
    display: grid;
    gap: var(--space-2);
  }

  &__label {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__chip {
    @include reset-button;
    @include focus-ring;

    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-full);
    background: var(--c-surface);
    font-size: var(--fs-sm);
    font-weight: 500;
    transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast);

    @include hover {
      background: var(--c-surface-hover);
    }

    &[aria-checked='true'] {
      background: var(--c-accent);
      color: var(--c-on-accent);
    }
  }

  &__hint {
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
  }
}

@keyframes wave-drift {
  to {
    transform: translateX(-300px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wave__line {
    animation: none;
  }
}
</style>
