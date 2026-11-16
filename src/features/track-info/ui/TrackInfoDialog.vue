<script setup lang="ts">
import { formatDuration } from '@/shared/lib'
import { UiCover, UiDialog, UiSkeleton } from '@/shared/ui'
import { songFacts, useTrackDetails, yourFacts } from '../model/details'

/** «Сведения о треке»: альбом, дата выхода, жанр, авторы, лейбл, качество, где ещё есть и ваша статистика. */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ track: Track | null }>()

const { info, failed } = useTrackDetails(() => props.track, () => open.value)

const SOURCE = { yandex: 'Яндекс Музыка', spotify: 'Spotify' } as const

const rows = computed(() => {
  const t = props.track
  const i = info.value
  if (!t) return []
  return [
    ...songFacts(t, i),
    { label: 'Длительность', value: t.durationMs ? formatDuration(t.durationMs) : '' },
    { label: 'Источник', value: SOURCE[t.source] + (i?.alsoIn ? ` · есть и в ${SOURCE[i.alsoIn]}` : '') },
    { label: 'Качество', value: i?.quality ?? '' },
    ...yourFacts(i),
  ].filter(r => r.value)
})
</script>

<template>
  <UiDialog v-model:open="open" title="Сведения о треке">
    <div v-if="track" class="info">
      <div class="info__head">
        <UiCover :src="track.coverUrl" :size="64" rounded="md" />
        <div class="info__text">
          <strong class="info__title">{{ track.title }}</strong>
          <span class="info__artists">{{ track.artists.join(', ') }}</span>
        </div>
      </div>
      <dl class="info__list">
        <div v-for="r in rows" :key="r.label" class="info__row">
          <dt>{{ r.label }}</dt>
          <dd>{{ r.value }}</dd>
        </div>
      </dl>
      <div v-if="!info && !failed" class="info__loading" aria-label="Загрузка">
        <UiSkeleton v-for="n in 3" :key="n" height="18px" />
      </div>
      <p v-if="failed" class="info__error">
        Не удалось загрузить подробности
      </p>
    </div>
  </UiDialog>
</template>

<style lang="scss" scoped>
.info {
  display: grid;
  grid-template-columns: minmax(0, 1fr); // длинный текст обрезается, а не раздвигает окно
  gap: var(--space-4);

  &__head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  &__text {
    display: grid;
    min-width: 0;
  }

  &__title {
    @include truncate;
  }

  &__artists {
    @include truncate;

    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &__list {
    display: grid;
    grid-template-columns: minmax(0, 1fr); // длинный текст обрезается, а не раздвигает окно
    gap: 2px;
  }

  &__row {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: var(--space-3);
    padding: 6px 0;
    border-bottom: 1px solid var(--c-border);
    font-size: var(--fs-sm);

    dt {
      color: var(--c-text-muted);
    }

    dd {
      overflow-wrap: anywhere;
    }
  }

  &__loading {
    display: grid;
    gap: var(--space-2);
  }

  &__error {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }
}
</style>
