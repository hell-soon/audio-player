<script setup lang="ts">
import { MicVocal } from 'lucide-vue-next'
import { usePlayer } from '@/entities/player'
import { useKaraokeFill } from '../model/karaoke'
import { useCurrentLyrics } from '../model/lyrics'

/**
 * Текст песни — крупно, прямо на фоне карточки (как в Apple Music), без рамки.
 * Синхронизированный — подсвечивает текущую строку и сам прокручивается (пока пользователь не листает вручную);
 * клик по строке — перемотка. Пока грузится — «строки-заглушки» той же высоты: ничего не прыгает.
 */
const props = defineProps<{
  /** Караоке: крупные строки на весь экран (полноэкранный режим) */
  karaoke?: boolean
}>()
const p = usePlayer()
const box = ref<HTMLElement | null>(null)
const { lyrics, status, activeIndex } = useCurrentLyrics()
// Текущая строка заливается по ходу песни (слово за словом)
useKaraokeFill(box, computed(() => lyrics.value?.synced), activeIndex)
const wordsOfLine = (l: LyricsLine) => (l.words?.length ? l.words.map(w => w.text) : l.text.split(/\s+/).filter(Boolean))

let userScrollUntil = 0
function onUserScroll() {
  userScrollUntil = Date.now() + 4000
}

async function scrollToActive(behavior: ScrollBehavior) {
  const i = activeIndex.value
  if (i < 0 || Date.now() < userScrollUntil) return
  await nextTick()
  const el = box.value?.querySelector<HTMLElement>(`[data-i="${i}"]`)
  const container = box.value
  if (!el || !container) return
  // В караоке текущая строка — на трети высоты: видно, что поётся дальше
  const anchor = props.karaoke ? container.clientHeight / 3 : container.clientHeight / 2
  container.scrollTo({ top: el.offsetTop - anchor + el.clientHeight / 2, behavior })
}

watch(activeIndex, () => scrollToActive('smooth'))
// Открыли посреди песни — сразу к текущей строке, без долгой прокрутки
watch(() => lyrics.value?.synced, () => scrollToActive('instant'), { flush: 'post' })
// Новая песня — текст с начала
watch(() => p.current.value?.uid, () => box.value?.scrollTo({ top: 0 }))

// Ширины строк-заглушек — как у настоящего текста (разной длины)
const SKELETON = [72, 54, 86, 63, 78, 45, 68]
onMounted(() => scrollToActive('instant'))
</script>

<template>
  <div ref="box" class="lyrics" :class="{ 'lyrics--karaoke': karaoke }" @wheel.passive="onUserScroll" @touchmove.passive="onUserScroll">
    <div v-if="status === 'pending'" class="lyrics__skeleton" aria-label="Загружаем текст">
      <span v-for="(w, i) in SKELETON" :key="i" :style="{ width: `${w}%`, '--i': i }" />
    </div>
    <template v-else-if="lyrics?.synced">
      <button
        v-for="(l, i) in lyrics.synced"
        :key="i"
        type="button"
        class="lyrics__line"
        :class="{ 'is-active': i === activeIndex, 'is-past': i < activeIndex, 'is-gap': !l.text }"
        :data-i="i"
        @click="p.seek(l.t)"
      >
        <template v-if="l.text">
          <!-- Слова — отдельно: заливка идёт по словам и правильно переходит на следующую строку при переносе -->
          <template v-for="(w, k) in wordsOfLine(l)" :key="k">
            <!-- Буквы — отдельно: каждая заливается в свой момент, приподнимается и вспыхивает -->
            <span class="lyrics__w" :style="{ '--n': [...w].length }"><span
              v-for="(ch, j) in [...w]"
              :key="j"
              class="lyrics__c"
              :style="{ '--p': j / [...w].length }"
            >{{ ch }}</span></span>{{ ' ' }}
          </template>
        </template>
        <template v-else>
          ♪
        </template>
      </button>
      <p class="lyrics__source">
        Текст: {{ lyrics.source }}
      </p>
    </template>
    <template v-else-if="lyrics?.plain">
      <p class="lyrics__plain">
        {{ lyrics.plain }}
      </p>
      <p class="lyrics__source">
        Текст: {{ lyrics.source }}
      </p>
    </template>
    <div v-else class="lyrics__state">
      <MicVocal />
      <strong>Текста пока нет</strong>
      <span>Для этой песни не нашли слов — может, она без них</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.lyrics {
  position: relative;
  height: 100%;
  // Строки начинаются ниже верхнего края и кончаются выше нижнего — текущая может встать по центру.
  // В rem, а не в %: вертикальные проценты считаются от ширины (на широком телефоне отступ был огромным)
  padding: 4.5rem var(--space-1) 6rem;
  // Только вертикальная прокрутка: увеличенная текущая строка вылезала вправо — блок «ходил» вбок под пальцем
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  scrollbar-width: none;
  // Растворение сверху и снизу (без рамки: текст лежит прямо на фоне карточки)
  mask-image: linear-gradient(to bottom, transparent, #000 16%, #000 80%, transparent);

  &::-webkit-scrollbar {
    display: none;
  }

  // По центру всего блока (а не ниже отступа для строк), вне зоны затухания краёв
  &__state {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-4);
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    text-align: center;

    svg {
      width: 36px;
      height: 36px;
      margin-bottom: var(--space-1);
      opacity: 0.6;
    }

    strong {
      color: var(--c-text);
      font-size: var(--fs-lg);
    }
  }

  // Заглушки строк: высота как у настоящих, мягкое мерцание
  &__skeleton {
    display: grid;
    gap: 14px;
    padding: 0 var(--space-2);

    span {
      height: 1.35rem;
      border-radius: var(--radius-sm);
      background: var(--c-surface-active);
      animation: lyrics-pulse 1.4s ease-in-out calc(var(--i) * 0.1s) infinite;
    }
  }

  &__line {
    @include reset-button;

    // Без фиолетовой рамки фокуса и серой вспышки после касания (рамка — только с клавиатуры)
    -webkit-tap-highlight-color: transparent;
    outline: none;

    &:focus-visible {
      outline: 2px solid var(--c-accent);
      outline-offset: 2px;
    }

    display: block;
    width: 100%;
    padding: 0.28em var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--c-text);
    font-size: clamp(1.3rem, 1.8vw, 1.6rem);
    font-weight: 800;
    line-height: 1.22;
    letter-spacing: -0.02em;
    text-align: left;
    opacity: 0.35;
    transform-origin: left center;
    transition: opacity 0.4s var(--ease), transform 0.4s var(--ease);

    @include hover {
      opacity: 0.6;
    }

    &.is-past {
      opacity: 0.25;
    }

    &.is-active {
      opacity: 1;
      transform: scale(1.02);
    }

    // Не текущие строки — слова целиком (прозрачность строки задаёт тон)
    &:not(.is-active) .lyrics__w {
      --w: 1;
    }

    &.is-gap {
      font-size: var(--fs-lg);
    }
  }

  // Заливка по буквам: --w (0…1) — сколько слова спето (ставит useKaraokeFill), --p — место буквы в слове.
  // Буква заливается, когда до неё дошла очередь: в этот момент чуть приподнимается, увеличивается
  // и вспыхивает свечением акцента («волна» бежит по строке), потом остаётся яркой.
  &__w {
    --w: 0;

    white-space: nowrap;
  }

  &__c {
    // Насколько залита эта буква: 0 — ещё не пели, 1 — спета
    --f: clamp(0, (var(--w) - var(--p)) * var(--n), 1);
    // «Пик» — пока букву поют (0 до и после, 1 посередине)
    --peak: calc(var(--f) * (1 - var(--f)) * 4);

    display: inline-block;
    color: color-mix(in srgb, var(--c-text) calc(32% + var(--f) * 68%), transparent);
    transform: translateY(calc(var(--peak) * -0.08em));
    scale: calc(1 + var(--peak) * 0.12);
    text-shadow: 0 0 calc(var(--peak) * 18px) color-mix(in srgb, var(--c-accent) calc(var(--peak) * 80%), transparent);

    // Safari (на iPhone — всегда) не стирает свечение, когда буква уменьшается обратно: в конце строк
    // оставались фиолетовые «полоски». Там без text-shadow — спетая буква вспыхивает цветом акцента.
    @supports (font: -apple-system-body) {
      text-shadow: none;
      color: color-mix(in srgb, color-mix(in srgb, var(--c-text) calc(32% + var(--f) * 68%), transparent), var(--c-accent) calc(var(--peak) * 70%));
    }

    @media (pointer: coarse) {
      text-shadow: none;
      color: color-mix(in srgb, color-mix(in srgb, var(--c-text) calc(32% + var(--f) * 68%), transparent), var(--c-accent) calc(var(--peak) * 70%));
    }
  }

  &__plain {
    padding: 0 var(--space-2);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.55;
    white-space: pre-line;
  }

  // Караоке: без панели, крупно, текущая строка яркая, остальные приглушены
  &--karaoke {
    max-height: none;
    height: 100%;
    padding: 30vh var(--space-2) 50vh;
    border: 0;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 75%, transparent);
  }

  &--karaoke &__line {
    padding: 0.3em 0;
    font-size: clamp(1.5rem, 3.2vw, 3rem);
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.02em;
    opacity: 0.32;
    filter: blur(0.6px);
    transition: opacity 0.45s var(--ease), transform 0.45s var(--ease), filter 0.45s, color 0.45s;

    &.is-past {
      opacity: 0.22;
    }

    &.is-active {
      opacity: 1;
      filter: none;
      transform: scale(1.04);
    }

    @include down(md) {
      font-size: 1.6rem;
    }
  }

  &--karaoke &__state,
  &--karaoke &__plain {
    font-size: var(--fs-lg);
  }

  &__source {
    margin-top: var(--space-4);
    padding: 0 var(--space-2);
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
  }
}

@keyframes lyrics-pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
