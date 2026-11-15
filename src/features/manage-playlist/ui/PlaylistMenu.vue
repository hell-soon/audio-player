<script setup lang="ts">
import { Ellipsis, Pencil, Trash2, Upload } from 'lucide-vue-next'
import { useMusicServices } from '@/entities/preferences'
import EditPlaylistDialog from './EditPlaylistDialog.vue'
import ExportDialog from './ExportDialog.vue'
import { refreshPlaylists } from '@/entities/library'
import { UiIconButton, UiMenu, useToast, type UiMenuItem } from '@/shared/ui'

const props = defineProps<{
  id: string
  name: string
  description?: string
  /** Своя обложка (null — коллаж из треков) */
  coverUrl?: string | null
  /** Треки — для коллажа, выбора и генерации обложки и описания */
  tracks?: Track[]
}>()
const emit = defineEmits<{ renamed: [] }>()
const toast = useToast()

const editOpen = ref(false)
const exportTo = ref<TrackSource | null>(null)
const exportOpen = ref(false)
function startExport(to: TrackSource) {
  exportTo.value = to
  exportOpen.value = true
}

const music = useMusicServices()
const items = computed<UiMenuItem[]>(() => [
  { label: 'Изменить', icon: Pencil, action: () => (editOpen.value = true) },
  ...(music.hasSpotify.value ? [{ label: 'Экспорт в Spotify', icon: Upload, action: () => startExport('spotify') }] : []),
  ...(music.hasYandex.value ? [{ label: 'Экспорт в Яндекс Музыку', icon: Upload, action: () => startExport('yandex') }] : []),
  { label: 'Удалить плейлист', icon: Trash2, danger: true, action: remove },
])


async function remove() {
  if (!confirm(`Удалить плейлист «${props.name}»?`)) return
  await $fetch(`/api/playlists/${props.id}`, { method: 'DELETE' })
  refreshPlaylists()
  toast.show('Плейлист удалён')
  await navigateTo('/library')
}
</script>

<template>
  <UiMenu :items="items" label="Действия с плейлистом">
    <UiIconButton label="Ещё" variant="filled">
      <Ellipsis />
    </UiIconButton>
  </UiMenu>

  <ExportDialog v-model:open="exportOpen" :playlist-id="id" :to="exportTo" />

  <EditPlaylistDialog
    v-model:open="editOpen"
    :id="id"
    :name="name"
    :description="description"
    :cover-url="coverUrl"
    :tracks="tracks ?? []"
    @saved="emit('renamed')"
  />
</template>

