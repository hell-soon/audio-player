<script setup lang="ts">
import { Clock3, ListChecks, ListEnd, Music2, Pause, Play, Search, Shuffle } from 'lucide-vue-next'
import { usePlayer } from '@/entities/player'
import { PlaylistCover } from '@/entities/library'
import { formatCount, formatTotalDuration, genreLabel, plural, SELECT_ALL_TRACKS } from '@/shared/lib'
import { UiButton, UiChip, UiCover, UiEmptyState, UiIconButton, UiInput, useToast } from '@/shared/ui'

/**
 * Шапка коллекции (обложка, название, плашки, кнопки) + стеклянная панель списка.
 * Сам список передаётся слотом: `<template #default="{ tracks, isAlbum }">` —
 * так виджет не зависит от виджета списка треков (правило FSD).
 */
const props = defineProps<{
  collection: Collection
  /** Обложки для коллажа (плейлист) */
  covers?: string[]
}>()

const player = usePlayer()
const toast = useToast()
// «Выбрать»: список треков (слот) включает выбор всех строк
const selectAll = ref(0)
provide(SELECT_ALL_TRACKS, selectAll)
const filter = ref('')

const kindLabel = computed(() => {
  const type = props.collection.meta?.type
  if (type === 'single') return 'Сингл'
  if (type === 'compilation') return 'Сборник'
  return ({ album: 'Альбом', playlist: 'Плейлист', liked: 'Коллекция' })[props.collection.kind]
})
/** Подробности альбома: жанр, лейбл, дата выхода, лайки */
const metaLine = computed(() => {
  const m = props.collection.meta
  if (!m) return []
  const date = m.releaseDate ? new Date(m.releaseDate) : null
  return [
    m.genre ? genreLabel(m.genre) : '',
    date && !Number.isNaN(date.getTime()) ? `Вышел ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}` : '',
    m.label ? `℗ ${m.label}` : '',
    m.likes ? `♥ ${formatCount(m.likes)}` : '',
  ].filter(Boolean)
})
const total = computed(() => props.collection.tracks.reduce((s, t) => s + t.durationMs, 0))
const count = computed(() => props.collection.tracks.length)

const visible = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return props.collection.tracks
  return props.collection.tracks.filter(t =>
    t.title.toLowerCase().includes(q) || t.artists.some(a => a.toLowerCase().includes(q)),
  )
})

const isAlbum = computed(() => props.collection.kind === 'album')

function playAll() {
  if (count.value) player.playQueue(props.collection.tracks, 0, { shuffle: false })
}
function shuffleAll() {
  if (count.value) player.playQueue(props.collection.tracks, 0, { shuffle: true })
}

// ---------- Компактная полоса сверху (появляется, когда шапка уехала при прокрутке; анимация — в CSS) ----------
const barCover = computed(() => props.collection.coverUrl ?? props.covers?.[0])
/** Сейчас звучит (или на паузе) трек из этой коллекции — кнопка полосы ставит паузу/продолжает, а не начинает заново */
const currentHere = computed(() => {
  const uid = player.current.value?.uid
  return !!uid && props.collection.tracks.some(t => t.uid === uid)
})
function barPlay() {
  if (currentHere.value) player.toggle()
  else playAll()
}
const rootEl = ref<HTMLElement | null>(null)
function scrollToTop() {
  // Прокручивается не окно, а ближайший предок с прокруткой
  for (let el = rootEl.value?.parentElement; el; el = el.parentElement) {
    const o = getComputedStyle(el).overflowY
    if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) {
      el.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function queueAll() {
  player.addToQueue(props.collection.tracks)
  toast.show(`${count.value} ${plural(count.value, ['трек добавлен', 'трека добавлено', 'треков добавлено'])} в очередь`)
}
</script>

<template>
  <div ref="rootEl" class="collection">
    <!-- Компактная полоса: «прилипает» сверху, видна, когда большая шапка уехала (scroll-driven animation).
         Без поддержки таких анимаций её нет вовсе -->
    <div class="collection__sticky">
      <div class="collection__bar">
        <UiCover :src="barCover" :size="40" class="collection__bar-cover" />
        <button type="button" class="collection__bar-title" title="Наверх" @click="scrollToTop">
          {{ collection.title }}
        </button>
        <UiIconButton :label="currentHere && player.isPlaying.value ? 'Пауза' : 'Слушать'" variant="filled" :disabled="!count" @click="barPlay">
          <Pause v-if="currentHere && player.isPlaying.value" fill="currentColor" />
          <Play v-else fill="currentColor" />
        </UiIconButton>
      </div>
    </div>

    <header class="collection__header">
      <!-- Своя обложка страницы (например, «как микс дня»); иначе коллаж или одна обложка -->
      <div v-if="$slots.cover" class="collection__cover collection__cover--slot">
        <slot name="cover" />
      </div>
      <PlaylistCover v-else-if="covers" :covers="covers" :name="collection.kind === 'liked' ? undefined : collection.title" :size="200" class="collection__cover" />
      <UiCover v-else :src="collection.coverUrl" :size="200" rounded="md" class="collection__cover" />

      <div class="collection__info">
        <span class="collection__kind">{{ kindLabel }}</span>
        <h1 class="collection__title">
          {{ collection.title }}
        </h1>
        <p v-if="collection.subtitle" class="collection__subtitle">
          {{ collection.subtitle }}
        </p>
        <p v-if="metaLine.length" class="collection__meta">
          <span v-for="m in metaLine" :key="m">{{ m }}</span>
        </p>
        <div class="collection__chips">
          <UiChip v-if="collection.year">
            {{ collection.year }}
          </UiChip>
          <UiChip>
            <Music2 /> {{ count }} {{ plural(count, ['трек', 'трека', 'треков']) }}
          </UiChip>
          <UiChip v-if="total">
            <Clock3 /> {{ formatTotalDuration(total) }}
          </UiChip>
        </div>
      </div>
    </header>

    <div class="collection__toolbar">
      <UiButton variant="primary" :disabled="!count" @click="playAll">
        <template #icon>
          <Play fill="currentColor" />
        </template>
        Слушать
      </UiButton>
      <UiIconButton label="Перемешать" variant="filled" :disabled="!count" @click="shuffleAll">
        <Shuffle />
      </UiIconButton>
      <UiIconButton label="Добавить всё в очередь" variant="filled" :disabled="!count" @click="queueAll">
        <ListEnd />
      </UiIconButton>
      <UiIconButton label="Выбрать треки" variant="filled" :disabled="!count" @click="selectAll++">
        <ListChecks />
      </UiIconButton>
      <slot name="actions" />

      <UiInput v-if="count > 8" v-model="filter" type="search" placeholder="Поиск в списке" clearable class="collection__filter">
        <template #icon>
          <Search />
        </template>
      </UiInput>
    </div>

    <section class="collection__list">
      <slot name="empty">
        <UiEmptyState v-if="!count" title="Здесь пока пусто" />
      </slot>
      <slot v-if="visible.length" :tracks="visible" :is-album="isAlbum" />
      <p v-else-if="count" class="collection__no-match">
        Ничего не найдено
      </p>
    </section>
    <!-- Под списком: «Другие альбомы исполнителя» и т.п. -->
    <slot name="after" />
  </div>
</template>

<style lang="scss" scoped>
.collection {
  // Шкала прокрутки шапки видна и компактной полосе (она не потомок шапки)
  timeline-scope: --collection-head;
  display: grid;
  // minmax(0, …): иначе колонка растягивается под самое длинное название трека и страница уезжает вбок
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--space-3);
    color: var(--c-text-muted);
    font-size: var(--fs-sm);

    @include down(md) {
      justify-content: center;
    }
  }

  &__header {
    display: flex;
    align-items: flex-end;
    gap: var(--space-5);

    @include down(md) {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
  }

  &__cover--slot {
    width: 200px;
    flex: none;
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  &__cover {
    // Сюда «перелетает» обложка нажатой карточки (shared/lib/hero.ts)
    view-transition-name: cover-hero;
    box-shadow: var(--shadow-lg);

    @include down(md) {
      width: 180px !important;
      height: 180px !important;
    }
  }

  &__info {
    display: grid;
    justify-items: start;
    gap: var(--space-1);
    min-width: 0;

    @include down(md) {
      justify-items: center;
      width: 100%;
    }
  }

  &__kind {
    color: var(--c-text-muted);
    font-size: var(--fs-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  &__title {
    display: -webkit-box;
    overflow: hidden;
    font-size: clamp(1.75rem, 4vw, 3rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.05;
    overflow-wrap: anywhere;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__subtitle {
    max-width: 100%;
    color: var(--c-text-muted);
    font-size: var(--fs-lg);
    overflow-wrap: anywhere;
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);

    @include down(md) {
      justify-content: center;
    }
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;

    @include down(md) {
      justify-content: center;
    }
  }

  &__filter {
    width: 240px;
    height: 40px;
    margin-left: auto;

    @include down(md) {
      width: 100%;
      margin-left: 0;
    }
  }

  &__list {
    @include glass;

    padding: var(--space-2);
    border-radius: var(--radius-lg);
  }

  // ---------- Шапка при прокрутке ----------
  // Нулевой высоты и без зазора сетки: раскладку страницы не меняет, только держит полосу у верхнего края
  &__sticky {
    position: sticky;
    top: 0;
    z-index: 5;
    display: none;
    height: 0;
    margin-bottom: calc(-1 * var(--space-5));
  }

  &__bar {
    @include glass(true);

    position: absolute;
    top: calc(var(--space-2) + env(safe-area-inset-top));
    right: 0;
    left: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    max-width: 640px;
    margin: 0 auto;
    padding: 6px;
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-lg);
    // Без работающей анимации (шкала не найдена) полоса не видна
    opacity: 0;
    visibility: hidden;
  }

  &__bar-cover {
    flex: none;
    border-radius: var(--radius-full) !important;
  }

  &__bar-title {
    @include reset-button;
    @include truncate;
    @include focus-ring;

    flex: 1;
    min-width: 0;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
  }

  // Большая шапка уходит вверх: обложка отстаёт (параллакс), уменьшается и гаснет, текст гаснет чуть раньше;
  // когда шапка почти скрылась — сверху проявляется компактная полоса. Всё привязано к положению шапки,
  // а не к таймеру: при быстрой прокрутке ничего не догоняет
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      &__sticky {
        display: block;
      }

      &__header {
        view-timeline: --collection-head block;
      }

      &__cover {
        animation: collection-cover linear both;
        animation-timeline: --collection-head;
        animation-range: exit 0% exit 100%;
      }

      &__info {
        animation: collection-info linear both;
        animation-timeline: --collection-head;
        animation-range: exit 0% exit 70%;
      }

      &__bar {
        animation: collection-bar linear both;
        animation-timeline: --collection-head;
        animation-range: exit 70% exit 100%;
      }
    }
  }

  &__no-match {
    padding: var(--space-5);
    color: var(--c-text-muted);
    text-align: center;
  }
}

@keyframes collection-cover {
  to {
    opacity: 0;
    transform: translateY(35%) scale(0.82);
  }
}

@keyframes collection-info {
  to {
    opacity: 0;
    transform: translateY(24px);
  }
}

@keyframes collection-bar {
  from {
    opacity: 0;
    visibility: hidden;
    transform: translateY(-10px) scale(0.97);
  }

  to {
    opacity: 1;
    visibility: visible;
    transform: none;
  }
}
</style>
