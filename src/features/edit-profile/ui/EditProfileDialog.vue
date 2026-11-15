<script setup lang="ts">
import { Camera, Trash2 } from 'lucide-vue-next'
import { FriendAvatar } from '@/entities/friend'
import { resizeImage } from '@/shared/lib'
import { UiButton, UiDialog, UiInput, UiTextarea, useToast } from '@/shared/ui'

/** «Изменить профиль»: фото (уменьшается в браузере до 400 px), имя, «о себе». Видят друзья. */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ name: string, bio?: string, avatarUrl?: string }>()
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()
const { fetch: refreshSession } = useUserSession()

const name = ref('')
const bio = ref('')
// undefined — фото не меняли; null — убрать; строка — новое фото (data URL)
const avatar = ref<string | null | undefined>(undefined)
const saving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

watch(open, (o) => {
  if (!o) return
  name.value = props.name
  bio.value = props.bio ?? ''
  avatar.value = undefined
})
const preview = computed(() => (avatar.value === undefined ? props.avatarUrl : avatar.value ?? undefined))

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  try {
    avatar.value = await resizeImage(file, 400)
  }
  catch {
    toast.error('Не удалось открыть фото')
  }
}

async function save() {
  const n = name.value.trim()
  if (!n) return
  saving.value = true
  try {
    await $fetch('/api/me/profile', { method: 'PATCH', body: { name: n, bio: bio.value, ...(avatar.value !== undefined ? { avatar: avatar.value } : {}) } })
    await refreshSession()
    open.value = false
    emit('saved')
    toast.show('Профиль сохранён')
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
  <UiDialog v-model:open="open" title="Изменить профиль">
    <form class="profile-edit" @submit.prevent="save">
      <div class="profile-edit__photo">
        <button type="button" class="profile-edit__avatar" aria-label="Выбрать фото" @click="fileInput?.click()">
          <FriendAvatar :name="name || '?'" :src="preview" :size="96" />
          <span class="profile-edit__cam"><Camera /></span>
        </button>
        <div class="profile-edit__photo-actions">
          <UiButton size="sm" @click="fileInput?.click()">
            Выбрать фото
          </UiButton>
          <UiButton v-if="preview" size="sm" variant="ghost" @click="avatar = null">
            <template #icon>
              <Trash2 />
            </template>
            Убрать
          </UiButton>
        </div>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile">
      </div>
      <UiInput v-model="name" placeholder="Имя" aria-label="Имя" maxlength="40" />
      <UiTextarea v-model="bio" placeholder="О себе — например, что слушаете" aria-label="О себе" :maxlength="160" :rows="2" />
      <UiButton type="submit" variant="primary" size="lg" block :loading="saving" :disabled="!name.trim()">
        Сохранить
      </UiButton>
    </form>
  </UiDialog>
</template>

<style lang="scss" scoped>
.profile-edit {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);

  &__photo {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  &__avatar {
    @include reset-button;
    @include focus-ring;

    position: relative;
    border-radius: 50%;
  }

  &__cam {
    position: absolute;
    right: 0;
    bottom: 0;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 2px solid var(--c-bg-elevated);
    border-radius: 50%;
    background: var(--c-accent);
    color: var(--c-on-accent);

    svg {
      width: 15px;
      height: 15px;
    }
  }

  &__photo-actions {
    display: grid;
    justify-items: start;
    gap: var(--space-2);
  }
}
</style>
