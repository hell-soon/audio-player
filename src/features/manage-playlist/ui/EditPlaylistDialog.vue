<script setup lang="ts">
import { ImagePlus, LayoutGrid, Sparkles } from 'lucide-vue-next'
import { PlaylistCover, refreshPlaylists } from '@/entities/library'
import { generateCover, invalidateData, resizeImage, type CoverStyle } from '@/shared/lib'
import { describePlaylist } from '../lib/describe'
import { UiButton, UiCover, UiDialog, UiInput, UiTextarea, useToast } from '@/shared/ui'

/**
 * «Изменить плейлист»: обложка (своё фото / обложка одного из треков / коллаж), название, описание.
 * Фото уменьшается в браузере до 600 px JPEG и хранится на сайте.
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  id: string
  name: string
  description?: string
  /** Своя обложка сейчас (null — коллаж) */
  coverUrl?: string | null
  /** Треки плейлиста — коллаж, выбор обложки, генерация обложки и описания */
  tracks: Track[]
  /** «Любимые треки»: название не меняется, сохраняется в /api/library/likes/meta */
  liked?: boolean
}>()
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()

const name = ref('')
const description = ref('')
// Что будет обложкой: null — коллаж; строка — адрес (своя / трека); upload — новое фото (data URL)
const cover = ref<string | null>(null)
const upload = ref<string | null>(null)
const saving = ref(false)
const reading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

watch(open, (o) => {
  if (!o) return
  name.value = props.name
  description.value = props.description ?? ''
  cover.value = props.coverUrl ?? null
  upload.value = null
  generated.value = []
})

const trackCovers = computed(() => [...new Set(props.tracks.map(t => t.coverUrl).filter(Boolean) as string[])])
const choices = computed(() => trackCovers.value.slice(0, 12))

// ---------- Генерация обложки (в браузере, из цветов обложек треков) ----------
const STYLES: CoverStyle[] = ['spotlight', 'gradient', 'wave', 'mosaic']
const generated = ref<string[]>([])
const generating = ref(false)
let seed = 1
async function generate() {
  generating.value = true
  try {
    const title = name.value.trim() || props.name
    generated.value = await Promise.all(STYLES.map(st => generateCover(st, title, trackCovers.value, seed)))
    seed++
  }
  catch {
    toast.error('Не получилось сгенерировать')
  }
  finally {
    generating.value = false
  }
}

// ---------- Описание из самого плейлиста ----------
let describeVariant = 0
function suggestDescription() {
  description.value = describePlaylist(props.tracks, describeVariant++)
}
const preview = computed(() => upload.value ?? cover.value)

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  reading.value = true
  try {
    upload.value = await resizeImage(file, 600)
    cover.value = null
  }
  catch {
    toast.error('Не удалось открыть фото')
  }
  finally {
    reading.value = false
  }
}
function pick(url: string | null) {
  upload.value = null
  cover.value = url
}

async function save() {
  const n = name.value.trim()
  if (!n) return
  saving.value = true
  try {
    const changedCover = upload.value || cover.value !== (props.coverUrl ?? null)
    await $fetch(props.liked ? '/api/library/likes/meta' : `/api/playlists/${props.id}`, {
      method: 'PATCH',
      body: {
        ...(props.liked ? {} : { name: n }),
        description: description.value,
        ...(changedCover ? { cover: upload.value ? { upload: upload.value } : cover.value ? { url: cover.value } : null } : {}),
      },
    })
    open.value = false
    refreshPlaylists()
    invalidateData(props.liked ? ['library:liked-meta', 'library:liked-covers', 'me:profile'] : [`playlist:${props.id}`, 'home:feed'])
    emit('saved')
    toast.show('Плейлист сохранён')
  }
  catch (e: any) {
    toast.error(e?.data?.message || 'Не удалось сохранить')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UiDialog v-model:open="open" :title="liked ? 'Изменить «Любимые треки»' : 'Изменить плейлист'">
    <form class="edit" @submit.prevent="save">
      <div class="edit__cover-row">
        <div class="edit__preview">
          <UiCover v-if="preview" :src="preview" :size="120" rounded="md" :fade="false" />
          <PlaylistCover v-else :covers="trackCovers" :name="name" :size="120" />
        </div>
        <div class="edit__cover-actions">
          <UiButton :loading="reading" @click="fileInput?.click()">
            <template #icon>
              <ImagePlus />
            </template>
            Загрузить фото
          </UiButton>
          <UiButton :loading="generating" @click="generate">
            <template #icon>
              <Sparkles />
            </template>
            {{ generated.length ? 'Ещё варианты' : 'Сгенерировать' }}
          </UiButton>
          <UiButton variant="ghost" :disabled="!preview" @click="pick(null)">
            <template #icon>
              <LayoutGrid />
            </template>
            Коллаж из треков
          </UiButton>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile">
        </div>
      </div>

      <!-- Сгенерированные варианты -->
      <div v-if="generated.length" class="edit__generated" role="radiogroup" aria-label="Сгенерированные обложки">
        <button
          v-for="(g, i) in generated"
          :key="i"
          type="button"
          role="radio"
          class="edit__choice edit__choice--big"
          :class="{ 'is-active': upload === g }"
          :aria-checked="upload === g"
          :aria-label="`Вариант ${i + 1}`"
          @click="upload = g; cover = null"
        >
          <img :src="g" alt="">
        </button>
      </div>

      <!-- Обложка одного из треков -->
      <div v-if="choices.length" class="edit__choices" role="radiogroup" aria-label="Обложка из треков">
        <button
          v-for="c in choices"
          :key="c"
          type="button"
          role="radio"
          class="edit__choice"
          :class="{ 'is-active': !upload && cover === c }"
          :aria-checked="!upload && cover === c"
          aria-label="Эта обложка"
          @click="pick(c)"
        >
          <UiCover :src="c" :size="48" rounded="sm" />
        </button>
      </div>

      <UiInput v-if="!liked" v-model="name" placeholder="Название" aria-label="Название" maxlength="100" />
      <div class="edit__desc">
        <UiTextarea v-model="description" placeholder="Описание — о чём этот плейлист" aria-label="Описание" :maxlength="300" />
        <UiButton v-if="tracks.length" size="sm" variant="ghost" class="edit__suggest" @click="suggestDescription">
          <template #icon>
            <Sparkles />
          </template>
          Придумать
        </UiButton>
      </div>
      <UiButton type="submit" variant="primary" size="lg" block :loading="saving" :disabled="!name.trim()">
        Сохранить
      </UiButton>
    </form>
  </UiDialog>
</template>

<style lang="scss" scoped>
.edit {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);

  &__cover-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  &__preview {
    flex: none;
    overflow: hidden;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
  }

  &__cover-actions {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  // Лента обложек треков
  &__choices {
    display: flex;
    gap: var(--space-2);
    padding: 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  &__generated {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-2);
    animation: rise-in 0.3s var(--ease) both;
  }

  &__desc {
    display: grid;
    gap: var(--space-1);
  }

  &__suggest {
    justify-self: end;
  }

  &__choice {
    @include reset-button;
    @include focus-ring;

    flex: none;
    padding: 2px;
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    transition: border-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);

    &:active {
      transform: scale(0.94);
    }

    &.is-active {
      border-color: var(--c-accent);
    }

    // Сгенерированный вариант — квадрат на четверть ширины
    &--big img {
      display: block;
      width: 100%;
      aspect-ratio: 1;
      border-radius: var(--radius-sm);
    }
  }
}
</style>
