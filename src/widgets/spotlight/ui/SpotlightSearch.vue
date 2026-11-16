<script setup lang="ts">
import type { Component } from 'vue'
import { ChartColumn, CornerDownLeft, Disc3, Heart, Mic2, History, House, Keyboard, Library, ListMusic, Radio, Search, Settings, UserRound, Users } from 'lucide-vue-next'
import { hotkeysHelpOpen } from '@/features/hotkeys'
import { useTrackSearch } from '@/features/search-tracks'
import { usePlaylists } from '@/entities/library'
import { usePlayer } from '@/entities/player'
import { useSourcePreference } from '@/entities/preferences'
import { useSpotlight } from '@/shared/lib'
import { UiCover, UiKbd, UiSpinner } from '@/shared/ui'

/**
 * Умный поиск (⌘K / Ctrl+K), как Spotlight: одно поле — и сразу всё. Свои плейлисты и разделы сайта
 * (мгновенно, без сервера), любимые, треки из своих плейлистов и история (/api/search/library),
 * каталог Яндекса и Spotify (/api/search). Стрелки — выбор, Enter — открыть/включить, Esc — закрыть.
 */
interface Item {
  key: string
  title: string
  subtitle?: string
  cover?: string
  icon?: Component
  round?: boolean
  run: () => void
}

const { open } = useSpotlight()
const player = usePlayer()
const search = useTrackSearch()
const prefer = useSourcePreference()
const { data: playlists } = usePlaylists()

const dialog = ref<HTMLDialogElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const q = ref('')
const active = ref(0)
const library = ref<LibrarySearchResult | null>(null)
const catalog = ref<SearchResult | null>(null)
const loading = ref(false)

watch(open, async (o) => {
  const d = dialog.value
  if (!d) return
  if (o && !d.open) {
    q.value = ''
    library.value = null
    catalog.value = null
    active.value = 0
    d.showModal()
    await nextTick()
    input.value?.focus()
  }
  if (!o && d.open) d.close()
}, { flush: 'post' })

const close = () => (open.value = false)
function go(path: string) {
  close()
  navigateTo(path)
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim()

const COMMANDS: (Item & { words: string })[] = [
  { key: 'c:wave', title: 'Моя волна', subtitle: 'Включить', icon: Radio, words: 'волна радио wave включить', run: () => {
    close()
    player.startWave()
  } },
  { key: 'c:liked', title: 'Любимые треки', icon: Heart, words: 'любимые лайки liked', run: () => go('/liked') },
  { key: 'c:home', title: 'Главная', icon: House, words: 'главная домой home', run: () => go('/') },
  { key: 'c:library', title: 'Библиотека', icon: Library, words: 'библиотека медиатека плейлисты', run: () => go('/library') },
  { key: 'c:history', title: 'История прослушиваний', icon: History, words: 'история слушал history', run: () => go('/history') },
  { key: 'c:stats', title: 'Статистика', icon: ChartColumn, words: 'статистика топ stats', run: () => go('/stats') },
  { key: 'c:friends', title: 'Друзья', icon: Users, words: 'друзья friends прислали', run: () => go('/friends') },
  { key: 'c:profile', title: 'Профиль', icon: UserRound, words: 'профиль аккаунт', run: () => go('/profile') },
  { key: 'c:settings', title: 'Настройки', icon: Settings, words: 'настройки тема качество settings', run: () => go('/settings') },
  { key: 'c:keys', title: 'Горячие клавиши', icon: Keyboard, words: 'горячие клавиши сочетания shortcuts', run: () => {
    close()
    hotkeysHelpOpen.value = true
  } },
]

// Запросы к серверу — с задержкой ввода; ответ устаревшего запроса не применяется
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
watch(q, (value) => {
  active.value = 0
  clearTimeout(timer)
  const text = value.trim()
  if (text.length < 2) {
    library.value = null
    catalog.value = null
    loading.value = false
    return
  }
  loading.value = true
  timer = setTimeout(() => {
    const id = ++seq
    const lib = $fetch<LibrarySearchResult>('/api/search/library', { query: { q: text } })
      .then(r => id === seq && (library.value = r))
      .catch(() => {})
    const cat = $fetch<SearchResult>('/api/search', { query: { q: text, prefer: prefer.value } })
      .then(r => id === seq && (catalog.value = r))
      .catch(() => {})
    Promise.all([lib, cat]).finally(() => id === seq && (loading.value = false))
  }, 220)
})

function trackItems(prefix: string, list: Track[], subtitle?: (t: Track, i: number) => string): Item[] {
  return list.map((t, i) => ({
    key: `${prefix}:${t.uid}`,
    title: t.title,
    subtitle: subtitle?.(t, i) ?? t.artists.join(', '),
    cover: t.coverUrl,
    run: () => {
      // Синхронно в обработчике нажатия — браузер разрешит звук
      player.playQueue(list, i)
      if (prefix === 'cat') search.remember(q.value)
      close()
    },
  }))
}

const groups = computed<{ title: string, items: Item[] }[]>(() => {
  const text = norm(q.value)
  if (!text) {
    const recent = search.recent.value.slice(0, 5).map<Item>(r => ({ key: `r:${r}`, title: r, icon: History, run: () => (q.value = r) }))
    return [
      { title: 'Недавние запросы', items: recent },
      { title: 'Быстрые действия', items: COMMANDS.slice(0, 6) },
    ].filter(g => g.items.length)
  }

  const out: { title: string, items: Item[] }[] = []
  const commands = COMMANDS.filter(c => norm(c.title).includes(text) || c.words.includes(text))
  out.push({ title: 'Разделы и действия', items: commands.slice(0, 4) })
  const pls = (playlists.value ?? []).filter(p => norm(p.name).includes(text)).slice(0, 4)
  out.push({ title: 'Мои плейлисты', items: pls.map(p => ({
    key: `p:${p.id}`,
    title: p.name,
    subtitle: `Плейлист · ${p.count} тр.`,
    cover: p.covers[0],
    icon: ListMusic,
    run: () => go(`/playlist/${p.id}`),
  })) })

  const lib = library.value
  if (lib) {
    out.push({ title: 'В любимых', items: trackItems('lk', lib.liked.slice(0, 5)) })
    out.push({ title: 'В моих плейлистах', items: trackItems('pl', lib.inPlaylists.map(x => x.track), (t, i) =>
      `${t.artists.join(', ')} · «${lib.inPlaylists[i]!.playlistName}»`) })
    out.push({ title: 'Слушали', items: trackItems('h', lib.history.slice(0, 4)) })
  }

  const cat = catalog.value
  if (cat) {
    out.push({ title: 'Исполнители', items: cat.artists.slice(0, 3).map(a => ({
      key: `a:${a.id}`,
      title: a.name,
      subtitle: 'Исполнитель',
      cover: a.imageUrl,
      icon: Mic2,
      round: true,
      run: () => {
        search.remember(q.value)
        go(`/artist/${a.id}`)
      },
    })) })
    out.push({ title: 'Треки', items: trackItems('cat', cat.tracks.slice(0, 6)) })
    out.push({ title: 'Альбомы', items: cat.albums.slice(0, 4).map(a => ({
      key: `al:${a.id}`,
      title: a.title,
      subtitle: [a.type === 'single' ? 'Сингл' : 'Альбом', a.artists.join(', '), a.year].filter(Boolean).join(' · '),
      cover: a.coverUrl,
      icon: Disc3,
      run: () => {
        search.remember(q.value)
        go(`/album/${a.id}`)
      },
    })) })
  }

  out.push({ title: '', items: [{
    key: 'all',
    title: `Все результаты по «${q.value.trim()}»`,
    icon: Search,
    run: openFullSearch,
  }] })
  return out.filter(g => g.items.length)
})

const flat = computed(() => groups.value.flatMap(g => g.items))
const indexOf = (key: string) => flat.value.findIndex(i => i.key === key)

function openFullSearch() {
  const text = q.value.trim()
  search.query.value = text
  search.filter.value = 'all'
  search.run()
  go('/search')
}

const list = ref<HTMLElement | null>(null)
function move(delta: number) {
  const n = flat.value.length
  if (!n) return
  active.value = (active.value + delta + n) % n
  nextTick(() => list.value?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }))
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  }
  else if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()
    flat.value[active.value]?.run()
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === dialog.value) close()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="spot"
    aria-label="Умный поиск"
    @close="open = false"
    @click="onBackdrop"
  >
    <div class="spot__panel" @keydown="onKey">
      <label class="spot__field">
        <Search class="spot__icon" aria-hidden="true" />
        <input
          ref="input"
          v-model="q"
          class="spot__input"
          type="search"
          placeholder="Поиск: песни, исполнители, любимые, плейлисты…"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-expanded="true"
          aria-controls="spot-list"
          :aria-activedescendant="flat[active] ? `spot-${active}` : undefined"
        >
        <UiSpinner v-if="loading" class="spot__spinner" />
        <UiKbd v-else combo="esc" class="spot__esc" />
      </label>

      <div v-if="groups.length" id="spot-list" ref="list" class="spot__list" role="listbox">
        <section v-for="g in groups" :key="g.title" class="spot__group">
          <h3 v-if="g.title" class="spot__group-title">
            {{ g.title }}
          </h3>
          <button
            v-for="item in g.items"
            :id="`spot-${indexOf(item.key)}`"
            :key="item.key"
            type="button"
            role="option"
            class="spot__item"
            :class="{ 'is-active': indexOf(item.key) === active }"
            :aria-selected="indexOf(item.key) === active"
            tabindex="-1"
            @mousemove="active = indexOf(item.key)"
            @click="item.run()"
          >
            <UiCover v-if="item.cover" :src="item.cover" :size="40" :rounded="item.round ? 'full' : 'sm'" />
            <span v-else class="spot__item-icon"><component :is="item.icon ?? Search" /></span>
            <span class="spot__text">
              <span class="spot__title">{{ item.title }}</span>
              <span v-if="item.subtitle" class="spot__subtitle">{{ item.subtitle }}</span>
            </span>
            <CornerDownLeft class="spot__enter" aria-hidden="true" />
          </button>
        </section>
      </div>

      <footer class="spot__footer">
        <span><UiKbd combo="up" /><UiKbd combo="down" /> выбрать</span>
        <span><UiKbd combo="enter" /> открыть</span>
        <span><UiKbd combo="mod+k" /> закрыть</span>
      </footer>
    </div>
  </dialog>
</template>

<style lang="scss" scoped>
.spot {
  width: min(680px, calc(100% - 2 * var(--space-4)));
  max-width: none;
  max-height: none;
  margin: 12vh auto auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--c-text);
  overflow: visible;

  &::backdrop {
    background: color-mix(in srgb, var(--c-bg) 35%, transparent);
    backdrop-filter: blur(4px);
  }

  &[open] {
    animation: spot-in 0.18s var(--ease);
  }

  &__panel {
    @include glass(true);

    display: grid;
    grid-template-columns: minmax(0, 1fr);
    max-height: 72vh;
    border-radius: 28px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  &__field {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    cursor: text;
  }

  &__icon {
    flex: none;
    width: 26px;
    height: 26px;
    color: var(--c-text-muted);
  }

  &__input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 1.5rem;
    font-weight: 500;

    &::placeholder {
      color: var(--c-text-subtle);
    }

    &::-webkit-search-cancel-button {
      display: none;
    }
  }

  &__spinner {
    flex: none;
  }

  &__list {
    display: grid;
    gap: var(--space-2);
    min-height: 0;
    padding: var(--space-2) var(--space-2) var(--space-3);
    border-top: 1px solid var(--c-glass-border);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  &__group {
    display: grid;
  }

  &__group-title {
    margin: 0;
    padding: var(--space-1) var(--space-3);
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  &__item {
    @include reset-button;

    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-width: 0;
    padding: 6px var(--space-3);
    border-radius: var(--radius-md);
    text-align: left;

    &.is-active {
      background: var(--c-accent-soft);
    }
  }

  &__item-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
    background: var(--c-surface);
    color: var(--c-text-muted);

    svg {
      width: 20px;
      height: 20px;
    }
  }

  &__item.is-active &__item-icon {
    color: var(--c-accent);
  }

  &__text {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  &__title {
    @include truncate;

    font-weight: 600;
  }

  &__subtitle {
    @include truncate;

    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &__enter {
    flex: none;
    width: 16px;
    height: 16px;
    color: var(--c-text-subtle);
    opacity: 0;
  }

  &__item.is-active &__enter {
    opacity: 1;
  }

  &__footer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-5);
    border-top: 1px solid var(--c-glass-border);
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);

    span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  }

  @include down(md) {
    margin-top: calc(env(safe-area-inset-top) + var(--space-4));

    &__input {
      font-size: 1.125rem;
    }

    &__footer {
      display: none;
    }
  }
}

@keyframes spot-in {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spot[open] {
    animation: none;
  }
}
</style>
