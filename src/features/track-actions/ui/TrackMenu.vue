<script setup lang="ts">
import { Ban, CheckSquare, Disc3, EllipsisVertical, HeartPlus, Info, ListEnd, ListPlus, ListStart, Share2, Trash2 } from 'lucide-vue-next'
import { useLikes } from '@/entities/library'
import { useMusicServices } from '@/entities/preferences'
import { useDislike } from '../model/dislike'
import { usePlayer } from '@/entities/player'
import { UiIconButton, UiMenu, useToast, type UiMenuItem } from '@/shared/ui'
import { invalidateData } from '@/shared/lib'

const props = defineProps<{
  track: Track
  /** Показать «Удалить из плейлиста» */
  removable?: boolean
  /** Показать «Выбрать» (выбор нескольких треков в списке) */
  selectable?: boolean
}>()
const emit = defineEmits<{ 'add-to-playlist': [], 'share-friend': [], 'remove': [], 'info': [], 'select': [] }>()
const { dislike } = useDislike()
const music = useMusicServices()
const likes = useLikes()

/** «В любимые и в Spotify / Яндекс»: лайк на сайте + та же песня во втором сервисе */
async function likeInBoth() {
  const other = props.track.source === 'yandex' ? 'Spotify' : 'Яндекс Музыке'
  try {
    const r = await $fetch<{ found: boolean }>('/api/library/likes/mirror', { method: 'POST', body: { track: props.track } })
    toast.show(r.found ? `В любимых здесь и в ${other}` : `В любимых здесь; в ${other} такой песни не нашлось`)
    // Сердечки на сайте — сразу закрашены
    await likes.load(true)
    invalidateData('library:liked')
  }
  catch (e: any) {
    toast.error(e?.data?.message || 'Не получилось')
  }
}

const player = usePlayer()
const toast = useToast()

const items = computed<UiMenuItem[]>(() => [
  { label: 'Играть следующим', icon: ListStart, action: () => {
    player.playNext(props.track)
    toast.show('Сыграет следующим')
  } },
  { label: 'Добавить в очередь', icon: ListEnd, action: () => {
    player.addToQueue([props.track])
    toast.show('Добавлено в очередь')
  } },
  { label: 'Добавить в плейлист', icon: ListPlus, action: () => emit('add-to-playlist') },
  // Пользуется обоими сервисами — можно лайкнуть копию песни и во втором
  ...(music.services.value === 'both'
    ? [{ label: props.track.source === 'yandex' ? 'В любимые и в Spotify' : 'В любимые и в Яндекс', icon: HeartPlus, action: likeInBoth }]
    : []),
  ...(props.track.albumId
    ? [{ label: 'Перейти к альбому', icon: Disc3, action: () => navigateTo(`/album/${props.track.source}:${props.track.albumId}`) }]
    : []),
  { label: 'Поделиться', icon: Share2, action: () => emit('share-friend') },
  { label: 'Сведения о треке', icon: Info, action: () => emit('info') },
  ...(props.selectable ? [{ label: 'Выбрать несколько', icon: CheckSquare, action: () => emit('select') }] : []),
  // Подбор музыки — только Яндекс: «не предлагать» имеет смысл, когда он подключён
  ...(music.hasYandex.value ? [{ label: 'Больше не предлагать', icon: Ban, action: () => dislike(props.track) }] : []),
  ...(props.removable
    ? [{ label: 'Удалить из плейлиста', icon: Trash2, danger: true, action: () => emit('remove') }]
    : []),
])
</script>

<template>
  <UiMenu :items="items" label="Действия с треком">
    <UiIconButton label="Ещё" size="sm">
      <EllipsisVertical />
    </UiIconButton>
  </UiMenu>
</template>
