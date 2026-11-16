<script setup lang="ts">
import { BellRing, X } from 'lucide-vue-next'
import { UiButton, UiIconButton, useToast } from '@/shared/ui'
import { usePushNotifications } from '../model/push'

/**
 * Подсказка на «Друзьях»: «Включите уведомления — узнаете, когда вам пришлют песню».
 * Показывается, пока уведомления можно включить и подсказку не закрыли (localStorage `push:prompt`).
 */
const push = usePushNotifications()
const toast = useToast()
const dismissed = ref(true)
onMounted(() => {
  try {
    dismissed.value = localStorage.getItem('push:prompt') === 'hidden'
  }
  catch {
    dismissed.value = false
  }
})
function dismiss() {
  dismissed.value = true
  try {
    localStorage.setItem('push:prompt', 'hidden')
  }
  catch {}
}

async function enable() {
  try {
    if (await push.enable()) toast.show('Уведомления включены')
    else if (push.state.value === 'denied') toast.error('Уведомления запрещены в настройках браузера')
  }
  catch {
    toast.error('Не удалось включить уведомления')
  }
}

const show = computed(() => !dismissed.value && (push.state.value === 'off' || push.state.value === 'install'))
</script>

<template>
  <div v-if="show" class="push-prompt">
    <span class="push-prompt__icon"><BellRing /></span>
    <div class="push-prompt__text">
      <strong>Узнавайте о присланных песнях</strong>
      <span v-if="push.state.value === 'install'">На iPhone уведомления работают в установленном приложении: «Поделиться» → «На экран „Домой“».</span>
      <span v-else>Придёт уведомление, когда друг пришлёт песню — даже если сайт закрыт.</span>
    </div>
    <UiButton v-if="push.state.value === 'off'" variant="primary" :loading="push.busy.value" class="push-prompt__btn" @click="enable">
      Включить
    </UiButton>
    <UiIconButton label="Скрыть подсказку" class="push-prompt__close" @click="dismiss">
      <X />
    </UiIconButton>
  </div>
</template>

<style lang="scss" scoped>
.push-prompt {
  @include glass;

  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);

  &__icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    background: var(--c-accent-soft);
    color: var(--c-accent);

    svg {
      width: 20px;
      height: 20px;
    }
  }

  &__text {
    display: grid;
    gap: 2px;
    font-size: var(--fs-sm);

    span {
      color: var(--c-text-muted);
    }
  }

  // Телефон: кнопка под текстом на всю ширину
  @include down(sm) {
    grid-template-columns: auto minmax(0, 1fr) auto;

    &__btn {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
}
</style>
