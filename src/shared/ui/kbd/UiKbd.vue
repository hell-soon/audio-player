<script setup lang="ts">
import { comboKeys, isMac } from '../../lib/keys'

/**
 * Сочетание клавиш значками: `<UiKbd combo="mod+k" />` → ⌘ K (на Mac) / Ctrl K.
 * Система известна только в браузере — до гидрации показываем вариант не для Mac (без рассинхрона SSR).
 */
const props = defineProps<{ combo: string }>()
const mac = ref(false)
onMounted(() => (mac.value = isMac()))
const keys = computed(() => comboKeys(props.combo, mac.value))
</script>

<template>
  <span class="ui-kbd" :aria-label="keys.join(' ')">
    <kbd v-for="(k, i) in keys" :key="i">{{ k }}</kbd>
  </span>
</template>

<style lang="scss" scoped>
.ui-kbd {
  display: inline-flex;
  gap: 3px;
  vertical-align: middle;
}

kbd {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--c-glass-border);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--c-surface);
  color: var(--c-text-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}
</style>
