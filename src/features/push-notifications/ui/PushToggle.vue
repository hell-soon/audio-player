<script setup lang="ts">
import { UiSwitch, useToast } from '@/shared/ui'
import { usePushNotifications } from '../model/push'

/** Переключатель в настройках: системные уведомления о присланных песнях на этом устройстве. */
const push = usePushNotifications()
const toast = useToast()

const on = computed({
  get: () => push.state.value === 'on',
  set: async (v: boolean) => {
    if (!v) return push.disable()
    try {
      if (!(await push.enable()) && push.state.value === 'denied') toast.error('Уведомления запрещены в настройках браузера')
    }
    catch {
      toast.error('Не удалось включить уведомления')
    }
  },
})

const hint = computed(() => ({
  install: 'На iPhone уведомления работают в установленном приложении: «Поделиться» → «На экран „Домой“», откройте оттуда.',
  denied: 'Уведомления запрещены для сайта — разрешите их в настройках браузера.',
  unsupported: 'Этот браузер не поддерживает уведомления.',
  off: 'Когда друг пришлёт песню, придёт уведомление — даже если сайт закрыт. Только на этом устройстве.',
  on: 'Когда друг пришлёт песню, придёт уведомление — даже если сайт закрыт. Только на этом устройстве.',
})[push.state.value])
</script>

<template>
  <UiSwitch
    v-if="push.state.value === 'on' || push.state.value === 'off'"
    v-model="on"
    label="Уведомления о присланных песнях"
    :description="hint"
  />
  <div v-else class="push-hint">
    <span>Уведомления о присланных песнях</span>
    <span class="push-hint__text">{{ hint }}</span>
  </div>
</template>

<style lang="scss" scoped>
.push-hint {
  display: grid;

  &__text {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }
}
</style>
