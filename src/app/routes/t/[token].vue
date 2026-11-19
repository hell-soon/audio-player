<script setup lang="ts">
import { SharedTrackPage } from '@/pages/shared-track'

// Ссылка на песню: открывается и без входа (auth.global.ts пропускает /t/…)
definePageMeta({ layout: 'blank' })
</script>

<template>
  <SharedTrackPage />
</template>
