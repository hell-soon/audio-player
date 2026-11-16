<script setup lang="ts">
import { ArrowRight, BadgeCheck, Sparkles } from 'lucide-vue-next'
import { usePlayer } from '@/entities/player'
import { formatCount, genreLabel, plural } from '@/shared/lib'
import { UiCover, UiSkeleton } from '@/shared/ui'
import { songFacts, useTrackDetails, useTrackVersions, VERSION_LABEL, yourFacts } from '../model/details'

/**
 * Вкладка «О треке» в карточке «Сейчас играет»: факты о песне, коротко об исполнителе
 * и другие версии (ремиксы, live, акустика, каверы…) — нажатие включает версию сразу.
 */
const props = defineProps<{ track: Track | null, active: boolean }>()
const p = usePlayer()

const { info, failed } = useTrackDetails(() => props.track, () => props.active)
const { versions } = useTrackVersions(() => props.track, () => props.active)

const facts = computed(() => (props.track ? songFacts(props.track, info.value) : []))
const mine = computed(() => yourFacts(info.value))
const artist = computed(() => info.value?.artist)
const artistLine = computed(() => {
  const a = artist.value
  if (!a) return ''
  return [
    a.listeners ? `${formatCount(a.listeners)} ${plural(a.listeners, ['слушатель', 'слушателя', 'слушателей'])} за месяц` : '',
    (a.genres ?? []).map(genreLabel).filter(Boolean).slice(0, 2).join(', '),
  ].filter(Boolean).join(' · ')
})

/** Оригинал, если играет кавер: чужая запись самого автора песни (ремикс/live своего же — это не «кавер») */
const originalVersion = computed(() => {
  const v = versions.value?.versions.find(x => x.kind === 'original')
  if (!v || !props.track) return undefined
  const mine = new Set(props.track.artists.map(a => a.toLowerCase()))
  return v.track.artists.some(a => mine.has(a.toLowerCase())) ? undefined : v
})

const bioOpen = ref(false)
watch(() => props.track?.uid, () => (bioOpen.value = false))

/** Включить версию сразу: встаёт следующей и играет */
function playVersion(t: Track) {
  p.playNext(t)
  p.next()
}
</script>

<template>
  <div class="about">
    <!-- О песне -->
    <section class="about__card" aria-label="О песне">
      <dl v-if="facts.length" class="about__facts">
        <div v-for="f in facts" :key="f.label" class="about__fact" :class="{ 'is-wide': f.value.length > 28 }">
          <dt>{{ f.label }}</dt>
          <dd>{{ f.value }}</dd>
        </div>
      </dl>
      <div v-if="!info && !failed" class="about__facts" aria-label="Загрузка">
        <div v-for="n in 4" :key="n" class="about__fact">
          <UiSkeleton width="60px" height="12px" />
          <UiSkeleton width="110px" height="16px" />
        </div>
      </div>
      <p v-if="failed" class="about__muted">
        Не удалось загрузить подробности
      </p>
      <p v-if="mine.length" class="about__mine">
        <span v-for="m in mine" :key="m.label">{{ m.label }} <b>{{ m.value }}</b></span>
      </p>
    </section>

    <!-- Об исполнителе -->
    <section v-if="artist" class="about__card about__artist" aria-label="Об исполнителе">
      <NuxtLink :to="`/artist/${artist.id}`" class="about__artist-head">
        <UiCover :src="artist.imageUrl" :size="56" rounded="full" class="about__avatar" />
        <span class="about__artist-text">
          <span class="about__kicker">Об исполнителе</span>
          <strong class="about__artist-name">{{ artist.name }}</strong>
          <span v-if="artistLine" class="about__muted">{{ artistLine }}</span>
        </span>
        <ArrowRight class="about__go" aria-hidden="true" />
      </NuxtLink>
      <div v-if="artist.bio" class="about__bio" :class="{ 'is-open': bioOpen }">
        <p>{{ artist.bio }}</p>
        <button v-if="artist.bio.length > 180" type="button" class="about__more" @click="bioOpen = !bioOpen">
          {{ bioOpen ? 'Свернуть' : 'Читать полностью' }}
        </button>
      </div>
    </section>

    <!-- Другие версии; сверху — оригинал это или нет (по авторам песни) -->
    <section v-if="versions === null || versions.versions.length || versions.isOriginal" class="about__card" aria-label="Другие версии">
      <h3 class="about__heading">
        Другие версии
      </h3>
      <p v-if="versions?.isOriginal" class="about__original">
        <BadgeCheck aria-hidden="true" />
        <span>Вы слушаете оригинал<template v-if="versions.writers?.length"> — песню исполняет её автор</template></span>
      </p>
      <p v-else-if="originalVersion" class="about__original">
        <Sparkles aria-hidden="true" />
        <span>Это кавер. Оригинал — {{ originalVersion.track.artists.join(', ') }}</span>
      </p>
      <div v-if="versions === null" class="about__versions">
        <div v-for="n in 3" :key="n" class="about__version">
          <UiSkeleton width="40px" height="40px" />
          <UiSkeleton width="60%" height="14px" />
        </div>
      </div>
      <ol v-else-if="versions.versions.length" class="about__versions">
        <li v-for="v in versions.versions" :key="v.track.uid">
          <button type="button" class="about__version" @click="playVersion(v.track)">
            <UiCover :src="v.track.coverUrl" :size="40" />
            <span class="about__version-text">
              <span class="about__version-title">{{ v.track.title }}</span>
              <span class="about__muted about__truncate">{{ v.track.artists.join(', ') }}</span>
            </span>
            <span class="about__badge" :data-kind="v.kind">{{ VERSION_LABEL[v.kind] }}</span>
          </button>
        </li>
      </ol>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.about {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start; // в блоке постоянной высоты карточки не растягиваются
  gap: var(--space-3);

  &__card {
    @include glass;

    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
  }

  // Факты — плиткой по две в ряд; длинные (авторы, альбом) — на всю ширину
  &__facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3) var(--space-4);
  }

  &__fact {
    display: grid;
    gap: 2px;
    min-width: 0;

    &.is-wide {
      grid-column: 1 / -1;
    }

    dt {
      color: var(--c-text-muted);
      font-size: var(--fs-xs);
    }

    dd {
      font-size: var(--fs-sm);
      font-weight: 500;
      overflow-wrap: anywhere;
    }
  }

  &__mine {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--c-border);
    color: var(--c-text-muted);
    font-size: var(--fs-xs);

    b {
      color: var(--c-text);
      font-weight: 600;
    }
  }

  &__muted {
    color: var(--c-text-muted);
    font-size: var(--fs-xs);
  }

  &__truncate {
    @include truncate;
  }

  &__artist-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    color: inherit;
    text-decoration: none;

    @include hover {
      .about__go {
        color: var(--c-text);
        transform: translateX(3px);
      }
    }
  }

  &__avatar {
    flex: none;
  }

  &__artist-text {
    display: grid;
    flex: 1;
    min-width: 0;

    > * {
      @include truncate;
    }
  }

  &__kicker {
    color: var(--c-text-muted);
    font-size: var(--fs-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  &__artist-name {
    font-size: var(--fs-md);
  }

  &__go {
    flex: none;
    width: 18px;
    height: 18px;
    color: var(--c-text-muted);
    transition: transform var(--dur) var(--ease), color var(--dur) var(--ease);
  }

  // Биография — свёрнута до четырёх строк
  &__bio {
    display: grid;
    justify-items: start;
    gap: var(--space-1);
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;

    p {
      display: -webkit-box;
      overflow: hidden;
      white-space: pre-line;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 4;
    }

    &.is-open p {
      display: block;
    }
  }

  &__more {
    @include reset-button;
    @include focus-ring;

    padding: 4px 0;
    color: var(--c-text);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  &__heading {
    font-size: var(--fs-sm);
    font-weight: 700;
  }

  // «Вы слушаете оригинал» / «Это кавер. Оригинал — …»
  &__original {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--c-accent-soft);
    color: var(--c-text);
    font-size: var(--fs-sm);

    svg {
      flex: none;
      width: 18px;
      height: 18px;
      color: var(--c-accent);
    }
  }

  &__versions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    margin: 0 calc(var(--space-2) * -1);
  }

  &__version {
    @include reset-button;
    @include focus-ring;

    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: 6px var(--space-2);
    border-radius: var(--radius-md);
    text-align: left;

    @include hover {
      background: var(--c-surface);
    }
  }

  &__version-text {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  &__version-title {
    @include truncate;

    font-size: var(--fs-sm);
    font-weight: 500;
  }

  &__badge {
    flex: none;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--c-surface);
    color: var(--c-text-muted);
    font-size: var(--fs-xs);
    font-weight: 600;
    white-space: nowrap;

    // Каверы и ремиксы — акцентом: ради них обычно и открывают список
    &[data-kind='original'],
    &[data-kind='cover'],
    &[data-kind='remix'] {
      background: var(--c-accent-soft);
      color: var(--c-accent);
    }
  }
}
</style>
