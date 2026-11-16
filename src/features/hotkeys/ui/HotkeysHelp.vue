<script setup lang="ts">
import { UiDialog, UiKbd } from '@/shared/ui'
import { HOTKEYS, hotkeysHelpOpen } from '../model/hotkeys'
</script>

<template>
  <UiDialog v-model:open="hotkeysHelpOpen" title="Горячие клавиши">
    <section v-for="g in HOTKEYS" :key="g.group" class="hotkeys">
      <h3 class="hotkeys__group">
        {{ g.group }}
      </h3>
      <dl class="hotkeys__list">
        <template v-for="h in g.items" :key="h.action">
          <dt>
            <template v-for="(c, i) in h.combos" :key="c">
              <span v-if="i" class="hotkeys__or">/</span>
              <UiKbd :combo="c" />
            </template>
          </dt>
          <dd>{{ h.action }}</dd>
        </template>
      </dl>
    </section>
  </UiDialog>
</template>

<style lang="scss" scoped>
.hotkeys {
  display: grid;
  gap: var(--space-2);

  &__group {
    margin: 0;
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  &__list {
    display: grid;
    grid-template-columns: 8.5rem minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2) var(--space-4);
    margin: 0;

    dt {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    dd {
      margin: 0;
      color: var(--c-text-muted);
      font-size: var(--fs-sm);
    }
  }

  &__or {
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
  }
}
</style>
