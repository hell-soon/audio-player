<script setup lang="ts">
import { useCachedFetch } from '@/shared/lib'
import { Heart, Pencil } from 'lucide-vue-next'
import { EditPlaylistDialog } from '@/features/manage-playlist'
import { CollectionSkeleton, CollectionView } from '@/widgets/collection-view'
import { TrackList } from '@/widgets/track-list'
import { UiButton, UiEmptyState, UiIconButton } from '@/shared/ui'

const { data: tracks, status } = useCachedFetch<Track[]>('/api/library/likes', { key: 'library:liked', default: () => [] })

// Своя обложка и описание «Любимых» (меняются в «Изменить»)
const { data: meta } = useCachedFetch<{ coverUrl: string | null, description: string | null }>('/api/library/likes/meta', {
  key: 'library:liked-meta',
  default: () => ({ coverUrl: null, description: null }),
})
const editOpen = ref(false)

const collection = computed<Collection>(() => ({
  kind: 'liked',
  id: 'liked',
  title: 'Любимые треки',
  subtitle: meta.value.description ?? undefined,
  coverUrl: meta.value.coverUrl ?? undefined,
  tracks: tracks.value,
}))
const covers = computed(() => (meta.value.coverUrl ? undefined : [...new Set(tracks.value.map(t => t.coverUrl).filter(Boolean) as string[])].slice(0, 8)))
</script>

<template>
  <CollectionSkeleton v-if="status === 'pending' && !tracks.length" />
  <CollectionView v-else :collection="collection" :covers="covers">
    <template #actions>
      <UiIconButton label="Изменить обложку и описание" variant="filled" @click="editOpen = true">
        <Pencil />
      </UiIconButton>
    </template>
    <template #empty>
      <UiEmptyState v-if="!tracks.length" title="Пока нет любимых треков" text="Нажмите ♥ у трека — он появится здесь на всех устройствах. Лайки из приложений Яндекса и Spotify подтягиваются сами.">
        <template #icon>
          <Heart />
        </template>
        <UiButton to="/search" variant="primary">
          Найти музыку
        </UiButton>
      </UiEmptyState>
    </template>
    <template #default="{ tracks: list }">
      <TrackList :tracks="list" />
    </template>
  </CollectionView>
  <EditPlaylistDialog
    v-model:open="editOpen"
    id="liked"
    liked
    name="Любимые треки"
    :description="meta.description ?? undefined"
    :cover-url="meta.coverUrl"
    :tracks="tracks"
  />
</template>

<style lang="scss" scoped>
.loading {
  display: grid;
  place-items: center;
  padding: var(--space-7);
  font-size: 24px;
}
</style>
