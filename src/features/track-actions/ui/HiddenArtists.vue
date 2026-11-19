<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { invalidateData, useCachedFetch } from '@/shared/lib'
import { UiIconButton, useToast } from '@/shared/ui'

/**
 * Настройки → «Скрытые исполнители»: кого пользователь попросил не предлагать (меню трека «Не предлагать «…»»).
 * Крестик возвращает исполнителя в радио и подборки.
 */
const { data, status } = useCachedFetch<{ name: string, createdAt: number }[]>('/api/library/blocked-artists', { key: 'blocked-artists', ttl: 60_000 })
const toast = useToast()

async function unhide(name: string) {
  // Сразу убираем из списка; ошибка — вернём
  const before = data.value
  data.value = (data.value ?? []).filter(a => a.name !== name)
  try {
    await $fetch('/api/library/blocked-artists', { method: 'DELETE', query: { name } })
    toast.show(`«${name}» снова в подборе`)
  }
  catch (e: any) {
    data.value = before
    toast.error(e?.data?.message || 'Не получилось')
  }
  invalidateData('blocked-artists')
}
</script>

<template>
  <div class="hidden-artists">
    <p v-if="status !== 'pending' && !data?.length" class="hidden-artists__empty">
      Пока никого. В меню трека «⋯» → «Не предлагать «исполнитель»» — и его песни перестанут попадаться в радио и подборках.
    </p>
    <ul v-else-if="data?.length" class="hidden-artists__list">
      <li v-for="a in data" :key="a.name" class="hidden-artists__item">
        <span class="hidden-artists__name">{{ a.name }}</span>
        <UiIconButton :label="`Вернуть «${a.name}»`" size="sm" @click="unhide(a.name)">
          <X />
        </UiIconButton>
      </li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.hidden-artists {
  &__empty {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 100%;
    padding: 2px 2px 2px var(--space-3);
    border-radius: 999px;
    background: var(--c-surface);
  }

  &__name {
    @include truncate;

    font-size: var(--fs-sm);
  }
}
</style>
