<script setup lang="ts">
import { Shuffle } from 'lucide-vue-next'
import { useMusicServices } from '@/entities/preferences'
import { GenreTile, stationLink, useGenres } from '@/entities/station'
import { UiButton, UiEmptyState, UiPageHeader, UiSkeleton } from '@/shared/ui'

/**
 * «Жанры и настроения»: все станции Яндекса по группам. Плитка открывает плейлист станции на сегодня
 * (собирается при открытии, мягко по вкусу — без уже лайкнутого). «Наугад» — случайная станция.
 */
const music = useMusicServices()
const { data, status, error } = useGenres(music.hasYandex.value)

function random() {
  const all = data.value?.groups.flatMap(g => g.stations) ?? []
  const s = all[Math.floor(Math.random() * all.length)]
  if (s) navigateTo(stationLink(s))
}
</script>

<template>
  <div class="genres">
    <UiPageHeader title="Жанры и настроения" subtitle="Плейлист из новой для вас музыки — каждый день свой" />

    <UiEmptyState
      v-if="!music.hasYandex.value"
      title="Нужна Яндекс Музыка"
      text="Подборки по жанрам собирает радио Яндекса: у Spotify подбор музыки для сторонних приложений закрыт."
    />
    <UiEmptyState
      v-else-if="error"
      title="Не удалось загрузить жанры"
      :text="(error.data as { message?: string } | undefined)?.message || 'Проверьте, что Яндекс Музыка подключена в настройках.'"
    />
    <template v-else-if="status === 'pending' && !data">
      <div v-for="g in 3" :key="g" class="genres__group">
        <UiSkeleton width="140px" height="24px" />
        <div class="genres__grid">
          <UiSkeleton v-for="i in 8" :key="i" width="100%" height="auto" radius="var(--radius-md)" class="genres__skeleton" />
        </div>
      </div>
    </template>
    <template v-else-if="data">
      <UiButton class="genres__random" @click="random">
        <template #icon>
          <Shuffle />
        </template>
        Наугад
      </UiButton>
      <section v-for="g in data.groups" :key="g.type" class="genres__group">
        <h2 class="genres__heading">
          {{ g.title }}
        </h2>
        <div class="genres__grid">
          <GenreTile v-for="s in g.stations" :key="s.id" :station="s" />
        </div>
      </section>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.genres {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-6);

  &__random {
    justify-self: start;
    margin-top: calc(var(--space-3) - var(--space-6));
  }

  &__group {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  &__heading {
    font-size: var(--fs-xl);
    font-weight: 700;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(160px, 45%), 1fr));
    gap: var(--space-3);
  }

  &__skeleton {
    aspect-ratio: 16 / 10;
  }
}
</style>
