<script setup lang="ts">
import { invalidateData, useCachedFetch } from '@/shared/lib'
import { remoteCollectionUrl } from '../lib/url'
import { RefreshCw } from 'lucide-vue-next'
import { SaveToLibraryButton } from '@/features/import-playlists'
import { MixCover } from '@/entities/library'
import { CollectionSkeleton, CollectionView } from '@/widgets/collection-view'
import { TrackList } from '@/widgets/track-list'
import { UiButton, UiEmptyState, UiIconButton, useToast } from '@/shared/ui'

/**
 * Плейлист Яндекса ("yandex:UID:KIND"), Spotify ("spotify:ID" / "spotify:saved")
 * или собранный сайтом микс ("mix:daily" / "mix:discover") — только чтение, можно сохранить копию в библиотеку.
 */
const props = defineProps<{ id: string }>()

const url = computed(() => remoteCollectionUrl(props.id))
// Собранные сайтом подборки (микс, плейлист по жанру) — пересобираются, обложка как у «Микса дня»
const isMix = computed(() => props.id.startsWith('mix:') || props.id.startsWith('station:'))

const { data, status, error } = useCachedFetch<Collection>(url, { key: `remote:${props.id}`, ttl: 10 * 60_000 })

// Микс можно пересобрать, если сегодняшний не понравился
const toast = useToast()
const rebuilding = ref(false)
async function rebuild() {
  rebuilding.value = true
  try {
    data.value = await $fetch<Collection>(url.value, { query: { fresh: 1 } })
    invalidateData(props.id.startsWith('station:') ? [] : 'home:feed')
  }
  catch {
    toast.error('Не удалось пересобрать подборку')
  }
  finally {
    rebuilding.value = false
  }
}
useHead({ title: () => data.value?.title ?? 'Плейлист' })
</script>

<template>
  <CollectionSkeleton v-if="status === 'pending' && !data" />
  <UiEmptyState v-else-if="error || !data" title="Не удалось открыть плейлист" :text="(error?.data as { message?: string } | undefined)?.message">
    <UiButton @click="$router.back()">
      Назад
    </UiButton>
  </UiEmptyState>
  <CollectionView v-else :collection="data" :covers="data.coverUrl ? undefined : [...new Set(data.tracks.map(t => t.coverUrl).filter(Boolean) as string[])].slice(0, 8)">
    <!-- Микс и умный плейлист — обложкой одна песня из подборки, как «микс дня» в Spotify -->
    <template v-if="isMix || id.startsWith('smart:')" #cover>
      <MixCover :src="data.tracks.find(t => t.coverUrl)?.coverUrl" :title="data.title" :size="200" />
    </template>
    <template #actions>
      <UiIconButton v-if="isMix" label="Пересобрать" variant="filled" :disabled="rebuilding" @click="rebuild">
        <RefreshCw :class="{ spin: rebuilding }" />
      </UiIconButton>
      <SaveToLibraryButton v-if="data.tracks.length" :id="id" />
    </template>
    <template #empty>
      <UiEmptyState
        v-if="!data.tracks.length"
        :title="isMix ? 'Пока не из чего собрать' : 'Здесь пока пусто'"
        :text="isMix ? 'Послушайте музыку и поставьте пару лайков — подборка соберётся по вашему вкусу.' : undefined"
      />
    </template>
    <template #default="{ tracks }">
      <TrackList :tracks="tracks" />
    </template>
  </CollectionView>
</template>

<style lang="scss" scoped>
.loading {
  display: grid;
  place-items: center;
  padding: var(--space-7);
  font-size: 24px;
}
</style>
