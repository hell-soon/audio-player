<script setup lang="ts">
/** Многострочное поле (описание, «о себе») — в стиле UiInput, со счётчиком символов при maxlength */
const model = defineModel<string>({ default: '' })
defineProps<{ placeholder?: string, maxlength?: number, rows?: number, ariaLabel?: string }>()
</script>

<template>
  <label class="ui-textarea">
    <textarea v-model="model" :placeholder="placeholder" :maxlength="maxlength" :rows="rows ?? 3" :aria-label="ariaLabel" />
    <span v-if="maxlength" class="ui-textarea__count">{{ model.length }}/{{ maxlength }}</span>
  </label>
</template>

<style lang="scss" scoped>
.ui-textarea {
  position: relative;
  display: block;

  textarea {
    display: block;
    width: 100%;
    padding: var(--space-3) var(--space-4) var(--space-5);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: var(--c-surface);
    color: var(--c-text);
    font: inherit;
    line-height: 1.45;
    resize: vertical;
    outline: 0;
    transition: border-color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease);

    &::placeholder {
      color: var(--c-text-subtle);
    }

    &:focus {
      border-color: var(--c-accent);
      background: var(--c-bg-elevated);
    }
  }

  &__count {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-2);
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
    pointer-events: none;
  }
}
</style>
