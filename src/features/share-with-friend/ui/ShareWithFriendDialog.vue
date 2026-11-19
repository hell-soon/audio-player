<script setup lang="ts">
import { Check, Copy, Ellipsis, MessageCircle, Send, Twitter, Users } from 'lucide-vue-next'
import { FriendAvatar, useFriends } from '@/entities/friend'
import { serviceHref, universalHref } from '@/entities/track'
import { invalidateData } from '@/shared/lib'
import { UiButton, UiCover, UiDialog, UiInput, UiSegmented, useToast } from '@/shared/ui'

/**
 * «Поделиться»: друзьям на сайте (трек появится у них в «Вам прислали») и в другие приложения —
 * Telegram, WhatsApp, ВКонтакте, X, копия ссылки, системное меню. Наружу уходит ссылка на выбор:
 *  - «Audio» (по умолчанию) — страница песни у нас (/t/…, подписанная ссылка): открывается и без аккаунта,
 *    с кнопками «Открыть в Яндекс Музыке / Spotify»; у кого есть Audio — «Слушать в Audio»;
 *  - на песню в самом сервисе или song.link — «для любого сервиса».
 */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ track: Track | null }>()
const toast = useToast()
const { data: friends, refresh } = useFriends()
const picked = ref(new Set<string>())
const note = ref('')
const sending = ref(false)

watch(open, (o) => {
  if (!o) return
  picked.value = new Set()
  note.value = ''
  refresh()
})

type LinkKind = 'audio' | 'service' | 'any'
const linkKind = ref<LinkKind>('audio')
const linkOptions = computed(() => [
  { label: 'Audio', value: 'audio' as const },
  { label: props.track?.source === 'spotify' ? 'Spotify' : 'Яндекс Музыка', value: 'service' as const },
  { label: 'Любой сервис', value: 'any' as const },
])
// Ссылку на Audio подписывает сервер — берём её, как только окно открылось (к нажатию она уже готова)
const audioLink = ref('')
watch(() => [open.value, props.track?.uid] as const, async ([o]) => {
  audioLink.value = ''
  if (!o || !props.track) return
  const uid = props.track.uid
  try {
    const r = await $fetch<{ path: string }>('/api/share/link', { method: 'POST', body: { track: props.track } })
    if (props.track?.uid === uid) audioLink.value = `${location.origin}${r.path}`
  }
  catch {}
}, { immediate: true })
const link = computed(() => {
  if (!props.track) return ''
  if (linkKind.value === 'any') return universalHref(props.track)
  // Ссылка на Audio ещё не пришла (или сбой) — пока отдаём ссылку на сервис, чтобы кнопки работали
  if (linkKind.value === 'audio' && audioLink.value) return audioLink.value
  return serviceHref(props.track)
})
const caption = computed(() => (props.track ? `${props.track.artists.join(', ')} — ${props.track.title}` : ''))
const canNativeShare = ref(false)
onMounted(() => (canNativeShare.value = typeof navigator.share === 'function'))

const enc = encodeURIComponent
const targets = computed(() => [
  { name: 'Telegram', icon: Send, href: `https://t.me/share/url?url=${enc(link.value)}&text=${enc(caption.value)}` },
  { name: 'WhatsApp', icon: MessageCircle, href: `https://wa.me/?text=${enc(`${caption.value} ${link.value}`)}` },
  { name: 'ВКонтакте', icon: Users, href: `https://vk.com/share.php?url=${enc(link.value)}&title=${enc(caption.value)}` },
  { name: 'X', icon: Twitter, href: `https://x.com/intent/post?text=${enc(caption.value)}&url=${enc(link.value)}` },
])

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    toast.show('Ссылка скопирована')
  }
  catch {
    toast.error('Не удалось скопировать')
  }
}

function nativeShare() {
  navigator.share({ title: caption.value, text: caption.value, url: link.value }).catch(() => {})
}

function toggle(id: string) {
  const s = new Set(picked.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  picked.value = s
}

async function send() {
  if (!props.track || !picked.value.size) return
  sending.value = true
  try {
    await Promise.all([...picked.value].map(id =>
      $fetch(`/api/friends/${id}/share`, { method: 'POST', body: { track: props.track, note: note.value } })))
    const names = friends.value.filter(f => picked.value.has(f.id)).map(f => f.name)
    toast.show(`Отправлено: ${names.join(', ')}`)
    invalidateData('shares:sent')
    open.value = false
  }
  catch {
    toast.error('Не удалось отправить')
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <UiDialog v-model:open="open" title="Поделиться">
    <div v-if="track" class="share__track">
      <UiCover :src="track.coverUrl" :size="44" />
      <span class="share__text">
        <span class="share__title">{{ track.title }}</span>
        <span class="share__artists">{{ track.artists.join(', ') }}</span>
      </span>
    </div>

    <section class="share__section" aria-label="В другие приложения">
      <div class="share__head">
        <h3 class="share__label">
          В другие приложения
        </h3>
        <UiSegmented v-model="linkKind" :options="linkOptions" label="Какую ссылку отправить" />
        <p v-if="linkKind === 'audio'" class="share__hint">
          Откроется и без аккаунта: обложка, название и кнопки «Открыть в Яндекс Музыке / Spotify»
        </p>
      </div>
      <div class="share__apps">
        <a
          v-for="t in targets"
          :key="t.name"
          class="share__app"
          :href="t.href"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="share__app-icon"><component :is="t.icon" /></span>
          <span class="share__name">{{ t.name }}</span>
        </a>
        <button type="button" class="share__app" @click="copyLink">
          <span class="share__app-icon"><Copy /></span>
          <span class="share__name">Ссылка</span>
        </button>
        <button v-if="canNativeShare" type="button" class="share__app" @click="nativeShare">
          <span class="share__app-icon"><Ellipsis /></span>
          <span class="share__name">Ещё</span>
        </button>
      </div>
    </section>

    <h3 class="share__label">
      Друзьям на сайте
    </h3>
    <p v-if="!friends.length" class="share__empty">
      Пока здесь никого нет. Пригласите друзей ссылкой из настроек.
    </p>
    <div v-else class="share__friends" role="group" aria-label="Кому отправить">
      <button
        v-for="f in friends"
        :key="f.id"
        type="button"
        class="share__friend"
        :class="{ 'is-on': picked.has(f.id) }"
        :aria-pressed="picked.has(f.id)"
        @click="toggle(f.id)"
      >
        <span class="share__avatar">
          <FriendAvatar :name="f.name" :src="f.avatarUrl" :size="52" />
          <span v-if="picked.has(f.id)" class="share__check"><Check /></span>
        </span>
        <span class="share__name">{{ f.name }}</span>
      </button>
    </div>

    <UiInput v-if="friends.length" v-model="note" placeholder="Подпись (по желанию): «послушай припев»" />
    <UiButton v-if="friends.length" variant="primary" block :loading="sending" :disabled="!picked.size" @click="send">
      <template #icon>
        <Send />
      </template>
      {{ picked.size ? 'Отправить' : 'Выберите друзей' }}
    </UiButton>
  </UiDialog>
</template>

<style lang="scss" scoped>
.share {
  &__track {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  &__text {
    display: grid;
    grid-template-columns: minmax(0, 1fr); // длинный текст обрезается, а не раздвигает окно
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

  &__section {
    display: grid;
    gap: var(--space-2);
  }

  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__hint {
    flex-basis: 100%;
    margin: 0;
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
  }

  &__label {
    margin: 0;
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  &__apps {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: var(--space-2);
  }

  &__app {
    @include reset-button;
    @include focus-ring;

    display: grid;
    justify-items: center;
    gap: 6px;
    min-width: 0;
    padding: var(--space-2) 2px;
    border-radius: var(--radius-md);
    color: inherit;
    text-decoration: none;

    @include hover {
      background: var(--c-surface);
    }
  }

  &__app-icon {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--c-surface);

    svg {
      width: 22px;
      height: 22px;
    }
  }

  &__app:hover &__app-icon {
    background: var(--c-accent-soft);
    color: var(--c-accent);
  }

  &__empty {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &__friends {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: var(--space-2);
  }

  &__friend {
    @include reset-button;
    @include focus-ring;

    display: grid;
    justify-items: center;
    gap: 6px;
    min-width: 0;
    padding: var(--space-2) 2px;
    border-radius: var(--radius-md);

    @include hover {
      background: var(--c-surface);
    }
  }

  &__avatar {
    position: relative;
  }

  &__check {
    position: absolute;
    right: -2px;
    bottom: -2px;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 2px solid var(--c-bg-elevated);
    border-radius: 50%;
    background: var(--c-accent);
    color: var(--c-on-accent);

    svg {
      width: 12px;
      height: 12px;
    }
  }

  &__name {
    @include truncate;

    max-width: 100%;
    font-size: var(--fs-xs);
    font-weight: 600;
  }
}
</style>
