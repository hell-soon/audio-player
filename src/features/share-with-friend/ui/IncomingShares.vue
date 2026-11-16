<script setup lang="ts">
import { Play, X } from 'lucide-vue-next'
import { FriendAvatar } from '@/entities/friend'
import { usePlayer } from '@/entities/player'
import { invalidateData, useCachedFetch } from '@/shared/lib'
import { UiCover, UiIconButton, useToast } from '@/shared/ui'

/**
 * «Вам прислали» / «Вы отправили» (sent): треки с подписью. Тап — играет этот трек, дальше остальные из списка.
 * onlyUnseen — компактный блок на главной (только новое); markSeen — отметить просмотренными (страница «Друзья»);
 * removable — крестик: получатель убирает у себя, отправитель отменяет отправку (у друга тоже пропадёт).
 */
const props = defineProps<{ onlyUnseen?: boolean, markSeen?: boolean, limit?: number, sent?: boolean, removable?: boolean }>()
const p = usePlayer()
const toast = useToast()
const KEY = props.sent ? 'shares:sent' : 'shares:list'

interface Row { id: number, person: { id: string, name: string, avatarUrl?: string }, track: Track, note?: string, createdAt: number, seen: boolean }
const { data: shares } = useCachedFetch<(ShareInfo | SentShareInfo)[]>(props.sent ? '/api/shares/sent' : '/api/shares', { key: KEY, ttl: 30_000, default: () => [] })
/** Только что удалённые — скрываем сразу, не дожидаясь ответа сервера */
const removed = ref(new Set<number>())

const list = computed<Row[]>(() => shares.value
  .filter(s => !removed.value.has(s.id) && (!props.onlyUnseen || !s.seen))
  .slice(0, props.limit ?? 30)
  .map(s => ({ ...s, person: 'to' in s ? s.to : s.from })))

onMounted(async () => {
  if (!props.markSeen) return
  // Даём увидеть «новое», потом помечаем прочитанным и убираем значок в меню
  setTimeout(async () => {
    if (!shares.value.some(s => !s.seen)) return
    await $fetch('/api/shares/seen', { method: 'POST' }).catch(() => {})
    invalidateData('shares:unseen')
  }, 2500)
})

function play(i: number) {
  p.playQueue(list.value.map(s => s.track), i)
}

async function remove(s: Row) {
  removed.value = new Set(removed.value).add(s.id)
  try {
    await $fetch(`/api/shares/${s.id}`, { method: 'DELETE' })
    toast.show(props.sent ? `Отправка отменена — у ${s.person.name} песни больше нет` : 'Убрано из присланного')
    invalidateData(props.sent ? ['shares:sent'] : ['shares:list', 'shares:unseen'])
  }
  catch {
    const next = new Set(removed.value)
    next.delete(s.id)
    removed.value = next
    toast.error('Не удалось удалить')
  }
}

function ago(ts: number) {
  const min = Math.floor((Date.now() - ts) / 60_000)
  if (min < 60) return min < 1 ? 'только что' : `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}
</script>

<template>
  <section v-if="list.length" class="shares">
    <slot name="title" />
    <TransitionGroup tag="ul" name="share" class="shares__list">
      <li v-for="(s, i) in list" :key="s.id" class="shares__item">
        <button type="button" class="share" :class="{ 'is-new': !sent && !s.seen }" @click="play(i)">
          <span class="share__art">
            <UiCover :src="s.track.coverUrl" :size="52" rounded="md" />
            <span class="share__play"><Play fill="currentColor" /></span>
          </span>
          <span class="share__body">
            <span class="share__title">{{ s.track.title }}</span>
            <span class="share__artists">{{ s.track.artists.join(', ') }}</span>
            <span class="share__from">
              <template v-if="sent">Для</template>
              <FriendAvatar :name="s.person.name" :src="s.person.avatarUrl" :size="18" />
              {{ s.person.name }}<template v-if="s.note">: «{{ s.note }}»</template> · {{ ago(s.createdAt) }}<template v-if="sent"> · {{ s.seen ? 'открыто' : 'ещё не открыто' }}</template>
            </span>
          </span>
        </button>
        <UiIconButton
          v-if="removable"
          :label="sent ? 'Отменить отправку' : 'Убрать из присланного'"
          size="sm"
          class="shares__remove"
          @click="remove(s)"
        >
          <X />
        </UiIconButton>
      </li>
    </TransitionGroup>
  </section>
</template>

<style lang="scss" scoped>
.shares {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);

  &__list {
    @include glass;

    display: grid;
    gap: 2px;
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    list-style: none;
  }

  // Строка: трек и крестик справа
  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  &__remove {
    flex: none;
    color: var(--c-text-muted);
  }
}

.share-leave-active {
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}

.share-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

.share {
  @include reset-button;
  @include focus-ring;

  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  text-align: left;

  @include hover {
    background: var(--c-surface);
  }

  &.is-new {
    background: var(--c-accent-soft);
  }

  &__art {
    position: relative;
    flex: none;
  }

  &__play {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md);
    background: rgb(0 0 0 / 0.35);
    color: #fff;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease);

    svg {
      width: 20px;
      height: 20px;
    }
  }

  @include hover {
    .share__play {
      opacity: 1;
    }
  }

  &__body {
    display: grid;
    flex: 1;
    gap: 1px;
    min-width: 0;
  }

  &__title {
    @include truncate;

    font-weight: 600;
  }

  &__artists {
    @include truncate;

    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &__from {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin-top: 2px;
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}
</style>
