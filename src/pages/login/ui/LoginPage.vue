<script setup lang="ts">
import { ArrowDown, ChevronDown, Download, Heart, Laptop, MicVocal, Radio, ShieldCheck, Smartphone, Sparkles, Users } from 'lucide-vue-next'
import { DeviceCodeLogin } from '@/features/auth-by-code'
import { PasskeyLoginButton } from '@/features/auth-by-passkey'
import { SpotifyLoginButton } from '@/features/auth-by-spotify'
import { YandexDeviceLogin } from '@/features/auth-by-yandex'
import { vReveal } from '@/shared/lib'
import { UiInput, UiLogo } from '@/shared/ui'

/**
 * Приветствие и вход (лендинг). Сверху — стеклянная панель (лого, разделы, «Войти»); первый экран — крупный
 * заголовок и карточка входа, за ней «парят» мини-плеер и плашка про синхронизацию лайков; бегущая строка;
 * «бенто» возможностей с живыми мини-иллюстрациями; «Как начать»; «Что понадобится»; вопросы; финальный призыв.
 * Всё оформление — на токенах темы (светлая/тёмная, любой акцент), анимации — только transform/opacity
 * и гасятся при «уменьшить движение». Логика входа — в features/auth-by-*.
 */
const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const { data: config } = useFetch('/api/auth/config')

// Ссылка-приглашение: /login?invite=КОД — код подставляется сам.
const invite = ref(String(route.query.invite ?? ''))
const showInvite = ref(!!invite.value)

async function onYandexDone() {
  await refreshSession()
  await navigateTo('/')
}
// Face ID / вход с другого устройства: сессия уже выставлена сервером
async function onSignedIn() {
  await refreshSession()
  await navigateTo('/')
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const MARQUEE = ['Моя волна', 'Яндекс + Spotify', 'Тексты и караоке', 'Слушать вместе', 'Микс дня', 'Открытия недели', 'Миксы по годам', 'Лайки в обоих сервисах', 'Пульт с телефона', 'Без рекламы']

// Мини-эквалайзер в плитке «Моя волна» (одинаково на сервере и в браузере)
const BARS = Array.from({ length: 18 }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 0.7 + 0.4)))

const STEPS = [
  { title: 'Получите приглашение', text: 'Audio — закрытый плеер для своих. Ссылку или код даёт владелец сайта.' },
  { title: 'Войдите через сервис', text: 'Яндекс — кодом на ya.ru/device, Spotify — своим аккаунтом. Второй сервис подключается потом.' },
  { title: 'Слушайте', text: 'Лайки, плейлисты и история соберутся в одну библиотеку. Нажмите «Моя волна» — и музыка играет весь день.' },
]

const NEEDS = [
  { icon: Radio, title: 'Яндекс Музыка', text: 'С Плюсом — полные треки, «Моя волна», радио и подборки.' },
  { icon: Heart, title: 'Spotify — по желанию', text: 'С Premium играет прямо в браузере на компьютере; на телефоне — через Яндекс.' },
  { icon: Smartphone, title: 'Браузер или «приложение»', text: 'Chrome, Safari, Яндекс Браузер, Edge. На телефоне — на экран «Домой».' },
  { icon: ShieldCheck, title: 'Без паролей', text: 'Вход через сам сервис, ключи доступа хранятся зашифрованными.' },
]

const FAQ = [
  { q: 'Это бесплатно?', a: 'Сам Audio — да. Музыка играет по вашим подпискам в Яндекс Музыке и Spotify.' },
  { q: 'Можно пользоваться только одним сервисом?', a: 'Да. При входе выберите, чем пользуетесь, — лишнее спрячется. Второй сервис можно подключить в любой момент.' },
  { q: 'Что будет с моими лайками и плейлистами?', a: 'Ничего не пропадёт. Лайки синхронизируются в обе стороны: лайкнули здесь — появится в сервисе, и наоборот. Плейлисты можно импортировать и выгрузить обратно.' },
  { q: 'Почему Spotify нужно включать отдельно?', a: 'Spotify пускает сторонние плееры только к добавленным вручную пользователям (до 5 человек). Если Spotify нужен — напишите владельцу сайта.' },
  { q: 'Как выйти или отключить сервис?', a: 'В настройках: отключить Яндекс или Spotify, выйти на этом или сразу на всех устройствах.' },
]

// Подсказка про установку — только в браузере и если сайт ещё не установлен
const installHint = ref('')
onMounted(() => {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
  if (standalone) return
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) installHint.value = 'На iPhone: «Поделиться» → «На экран «Домой»» — и Audio откроется как приложение.'
  else if (/Android/.test(ua)) installHint.value = 'На Android: меню браузера → «Установить приложение».'
})
</script>

<template>
  <main class="land">
    <!-- Фон: сияние акцента сверху и тонкая сетка, растворяющаяся книзу -->
    <div class="land__bg" aria-hidden="true">
      <span class="land__glow is-a" />
      <span class="land__glow is-b" />
      <span class="land__grid" />
    </div>

    <!-- Панель сверху: fixed, а место под неё в потоке держит пустой .nav-slot -->
    <div class="nav-slot" aria-hidden="true" />
    <header class="nav">
      <a href="#top" class="nav__brand" @click.prevent="scrollTo('top')">
        <UiLogo :size="30" :animated="false" />
        Audio
      </a>
      <nav class="nav__links" aria-label="Разделы">
        <a href="#features" @click.prevent="scrollTo('features')">Возможности</a>
        <a href="#start" @click.prevent="scrollTo('start')">Как начать</a>
        <a href="#faq" @click.prevent="scrollTo('faq')">Вопросы</a>
      </nav>
      <button type="button" class="nav__cta" @click="scrollTo('login')">
        Войти
      </button>
    </header>

    <!-- Первый экран -->
    <section id="top" class="hero">
      <div class="hero__text">
        <span class="hero__eyebrow"><Sparkles /> Яндекс Музыка + Spotify</span>
        <h1 class="hero__title">
          Вся музыка.<br><span class="hero__accent">Один плеер.</span>
        </h1>
        <p class="hero__lead">
          Одна библиотека и поиск по обоим сервисам, «Моя волна» на весь день, тексты песен
          и музыка с друзьями — на компьютере и телефоне.
        </p>
        <button type="button" class="hero__more" @click="scrollTo('features')">
          Что умеет <ArrowDown />
        </button>
      </div>

      <div class="hero__stage">
        <!-- Декор: мини-плеер и плашка «парят» вокруг карточки входа -->
        <div class="float-player" aria-hidden="true">
          <span class="float-player__cover"><span class="float-player__disc" /></span>
          <span class="float-player__meta">
            <span class="float-player__title">Сейчас играет</span>
            <span class="float-player__sub">Моя волна · без остановки</span>
            <span class="float-player__bar"><i /></span>
          </span>
          <span class="float-player__eq"><i /><i /><i /><i /></span>
        </div>
        <div class="float-chip" aria-hidden="true">
          <Heart fill="currentColor" /> Лайк ушёл и в Spotify
        </div>

        <!-- Вход -->
        <section id="login" class="auth" aria-labelledby="auth-title">
          <h2 id="auth-title" class="auth__title">
            Войти
          </h2>
          <p class="auth__sub">
            Через сервис, которым вы пользуетесь. Второй можно подключить потом.
          </p>

          <p v-if="config?.firstUser" class="auth__note">
            Вы первый — станете владельцем сайта.
          </p>

          <YandexDeviceLogin :invite="invite" @done="onYandexDone" />
          <SpotifyLoginButton v-if="config?.spotifyEnabled" :invite="invite" />

          <!-- Уже есть аккаунт: без Яндекса — по Face ID или подтверждением с другого устройства -->
          <template v-if="!config?.firstUser">
            <div class="auth__or">
              <span>уже входили?</span>
            </div>
            <PasskeyLoginButton @done="onSignedIn" />
            <DeviceCodeLogin @done="onSignedIn" />
          </template>

          <template v-if="config?.inviteRequired">
            <button v-if="!showInvite" type="button" class="auth__link" @click="showInvite = true">
              Первый раз здесь? Введите код приглашения
            </button>
            <UiInput v-else v-model="invite" placeholder="Код приглашения" autofocus />
          </template>

          <p v-if="route.query.error" class="auth__error" role="alert">
            {{ route.query.error }}
          </p>
        </section>
      </div>
    </section>

    <!-- Бегущая строка возможностей (копия — для бесшовного круга) -->
    <div class="marquee" aria-hidden="true">
      <div class="marquee__track">
        <template v-for="copy in 2" :key="copy">
          <span v-for="m in MARQUEE" :key="`${copy}-${m}`" class="marquee__item">{{ m }}</span>
        </template>
      </div>
    </div>

    <!-- Возможности: «бенто» -->
    <section id="features" class="section">
      <header class="section__head">
        <span class="section__kicker">Возможности</span>
        <h2 class="section__title">
          Всё, что нужно, чтобы просто слушать
        </h2>
      </header>

      <div class="bento">
        <!-- Две библиотеки в одной -->
        <article v-reveal class="cell cell--wide">
          <div class="cell__art lib" aria-hidden="true">
            <span class="lib__row"><b class="lib__src is-y">Я</b><i /><i class="is-short" /></span>
            <span class="lib__row"><b class="lib__src is-s">S</b><i /><i class="is-short" /></span>
            <span class="lib__row"><b class="lib__src is-y">Я</b><i /><i class="is-short" /></span>
            <span class="lib__row"><b class="lib__src is-s">S</b><i /><i class="is-short" /></span>
          </div>
          <h3>Яндекс и Spotify — одна библиотека</h3>
          <p>Общие поиск, любимые и плейлисты. Лайк здесь — лайк в сервисе, и наоборот.</p>
        </article>

        <!-- Волна -->
        <article v-reveal class="cell cell--tall">
          <div class="cell__art wave" aria-hidden="true">
            <i v-for="(h, i) in BARS" :key="i" :style="{ '--h': h, '--i': i }" />
          </div>
          <h3>«Моя волна» на весь день</h3>
          <p>Новое из Яндекса и Spotify в ваших жанрах и любимое, что давно не звучало. Пропуски учитываются — не надоедает.</p>
        </article>

        <!-- Тексты -->
        <article v-reveal class="cell">
          <div class="cell__art lyric" aria-hidden="true">
            <span class="lyric__line is-past">и снова утро</span>
            <span class="lyric__line is-now">поём вместе с текстом</span>
            <span class="lyric__line">строчка за строчкой</span>
          </div>
          <h3>Тексты и караоке</h3>
          <p>Синхронный текст и полноэкранный режим.</p>
        </article>

        <!-- Устройства -->
        <article v-reveal class="cell">
          <div class="cell__art devices" aria-hidden="true">
            <Laptop />
            <span class="devices__link" />
            <Smartphone />
          </div>
          <h3>С любого устройства</h3>
          <p>Начали на компьютере — продолжите с телефона. Телефон — пульт.</p>
        </article>

        <!-- Друзья -->
        <article v-reveal class="cell">
          <div class="cell__art friends" aria-hidden="true">
            <span class="friends__a">А</span>
            <span class="friends__b">М</span>
            <span class="friends__c">Вы</span>
            <span class="friends__chip"><Users /> Слушаем вместе</span>
          </div>
          <h3>С друзьями</h3>
          <p>Что слушают друзья, «Слушать вместе», совпадение вкусов.</p>
        </article>

        <!-- Миксы -->
        <article v-reveal class="cell">
          <div class="cell__art mixes" aria-hidden="true">
            <span>20</span><span>10</span><span>00</span>
          </div>
          <h3>Миксы и подборки</h3>
          <p>«Микс дня», «Открытия недели», жанры и миксы по годам.</p>
        </article>

        <!-- Приложение -->
        <article v-reveal class="cell cell--full cell--row">
          <div class="cell__icon" aria-hidden="true">
            <Download />
          </div>
          <div>
            <h3>Как приложение</h3>
            <p>Ставится на экран «Домой», управляется с экрана блокировки и наушников, работает при плохой сети.</p>
          </div>
          <div class="cell__icon" aria-hidden="true">
            <MicVocal />
          </div>
        </article>
      </div>
    </section>

    <!-- Как начать -->
    <section id="start" class="section">
      <header class="section__head">
        <span class="section__kicker">Как начать</span>
        <h2 class="section__title">
          Три шага — и всё играет
        </h2>
      </header>
      <ol class="steps">
        <li v-for="(s, i) in STEPS" :key="s.title" v-reveal class="step">
          <span class="step__num">{{ String(i + 1).padStart(2, '0') }}</span>
          <h3>{{ s.title }}</h3>
          <p>{{ s.text }}</p>
        </li>
      </ol>
    </section>

    <!-- Что понадобится -->
    <section class="section">
      <header class="section__head">
        <span class="section__kicker">Что понадобится</span>
        <h2 class="section__title">
          Немного — и, скорее всего, у вас уже есть
        </h2>
      </header>
      <ul class="needs">
        <li v-for="n in NEEDS" :key="n.title" class="need">
          <span class="need__icon"><component :is="n.icon" /></span>
          <span>
            <strong>{{ n.title }}</strong>
            <span>{{ n.text }}</span>
          </span>
        </li>
      </ul>
    </section>

    <!-- Вопросы -->
    <section id="faq" class="section section--narrow">
      <header class="section__head">
        <span class="section__kicker">Вопросы</span>
        <h2 class="section__title">
          Коротко о главном
        </h2>
      </header>
      <div class="faq">
        <details v-for="f in FAQ" :key="f.q" class="faq__item">
          <summary>{{ f.q }}<ChevronDown class="faq__chevron" /></summary>
          <p>{{ f.a }}</p>
        </details>
      </div>
    </section>

    <!-- Финальный призыв -->
    <section class="final">
      <h2>Готовы слушать?</h2>
      <p>Войдите через Яндекс Музыку или Spotify — библиотека соберётся сама.</p>
      <button type="button" class="final__cta" @click="scrollTo('login')">
        Войти
      </button>
      <p v-if="installHint" class="final__install">
        <Download /> {{ installHint }}
      </p>
    </section>

    <footer class="foot">
      Audio · личный плеер для своих
    </footer>
  </main>
</template>

<style lang="scss" scoped>
// ---------- Общее ----------
.land {
  position: relative;
  min-height: 100dvh;
  // clip, а не hidden: hidden делает блок контейнером прокрутки и ломает «прилипание» панели
  overflow-x: clip;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--c-bg);
  isolation: isolate;

  &__bg {
    position: absolute;
    inset: 0 0 auto;
    z-index: -1;
    height: 1100px;
    overflow: hidden;
    pointer-events: none;
  }

  // Сияние — радиальные градиенты (без filter: blur — дёшево)
  &__glow {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--c-accent) 38%, transparent), transparent);

    &.is-a {
      top: -380px;
      left: 50%;
      width: 1100px;
      height: 760px;
      margin-left: -550px;
      animation: glow 14s ease-in-out infinite alternate;
    }

    &.is-b {
      top: 160px;
      right: -260px;
      width: 640px;
      height: 640px;
      opacity: 0.6;
      animation: glow 18s ease-in-out -6s infinite alternate-reverse;
    }
  }

  // Тонкая сетка, растворяющаяся книзу
  &__grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(var(--c-border) 1px, transparent 1px),
      linear-gradient(90deg, var(--c-border) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%);
  }
}

// ---------- Панель сверху ----------
// fixed, а не sticky: страница прокручивается окном, и в Safari на iPhone «прилипшая» панель дёргалась
// при прокрутке и уезжала вместе со страницей, когда та «пружинит» у нижнего края. Фиксированная не
// участвует ни в том, ни в другом. Место в потоке держит .nav-slot той же высоты (--nav-h).
.land {
  --nav-h: 54px;
  --nav-top: calc(var(--space-3) + env(safe-area-inset-top));
}

// Отступ сверху — высотой, а не margin: margin «проваливался» за пределы .land, и фон страницы
// начинался ниже края экрана (светлая полоса под статус-баром)
.nav-slot {
  height: calc(var(--nav-top) + var(--nav-h));
}

.nav {
  @include glass(true);

  position: fixed;
  top: var(--nav-top);
  right: 0;
  left: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  width: min(100% - 2 * var(--space-4), 1120px);
  height: var(--nav-h);
  margin: 0 auto;
  padding: 8px 8px 8px var(--space-4);
  border-radius: 999px;
  // Свой слой композитора: размытие под панелью не перерисовывается с запаздыванием при прокрутке
  transform: translateZ(0);

  &__brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--c-text);
    font-size: var(--fs-md);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  &__links {
    display: flex;
    gap: var(--space-1);
    margin-left: auto;

    a {
      padding: 6px 12px;
      border-radius: 999px;
      color: var(--c-text-muted);
      font-size: var(--fs-sm);
      font-weight: 500;
      transition: color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease);

      @include hover {
        background: var(--c-surface);
        color: var(--c-text);
      }
    }

    @include down(md) {
      display: none;
    }
  }

  &__cta {
    @include reset-button;
    @include focus-ring;

    margin-left: auto;
    padding: 8px 18px;
    border-radius: 999px;
    background: var(--c-text);
    color: var(--c-bg);
    font-size: var(--fs-sm);
    font-weight: 700;
    transition: transform var(--dur-fast) var(--ease);

    @include hover {
      transform: translateY(-1px);
    }

    &:active {
      transform: scale(0.97);
    }
  }

  // Рядом со ссылками отступ не нужен; на телефоне ссылки скрыты — кнопка снова прижимается вправо
  &__links + &__cta {
    margin-left: 0;

    @include down(md) {
      margin-left: auto;
    }
  }
}

// ---------- Первый экран ----------
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 420px);
  align-items: center;
  gap: clamp(var(--space-6), 6vw, 96px);
  width: min(100% - 2 * var(--space-5), 1120px);
  min-height: min(760px, calc(100dvh - 80px));
  margin: 0 auto;
  padding: clamp(var(--space-6), 7vh, 88px) 0 var(--space-6);
  scroll-margin-top: 90px;

  @include down(lg) {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
    gap: var(--space-6);
    width: min(100% - 2 * var(--space-4), 560px);
    padding-top: var(--space-6);
  }

  &__text {
    display: grid;
    justify-items: start;
    gap: var(--space-4);
    animation: rise-in 0.7s cubic-bezier(0.2, 0, 0, 1) both;
  }

  &__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent);
    border-radius: 999px;
    background: var(--c-accent-soft);
    color: var(--c-accent);
    font-size: var(--fs-sm);
    font-weight: 600;

    svg {
      width: 15px;
      height: 15px;
    }
  }

  &__title {
    font-size: clamp(48px, 7.4vw, 96px);
    font-weight: 800;
    letter-spacing: -0.055em;
    line-height: 0.95;
  }

  // Вторая строка — градиентом акцента
  &__accent {
    background: linear-gradient(100deg, var(--c-accent), color-mix(in oklab, var(--c-accent) 45%, var(--c-text)));
    background-clip: text;
    color: transparent;
  }

  &__lead {
    max-width: 34em;
    color: var(--c-text-muted);
    font-size: clamp(var(--fs-md), 1.6vw, 1.2rem);
    line-height: 1.5;
  }

  &__more {
    @include reset-button;
    @include focus-ring;

    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border: 1px solid var(--c-border);
    border-radius: 999px;
    color: var(--c-text);
    font-weight: 600;
    transition: background-color var(--dur-fast) var(--ease);

    svg {
      width: 16px;
      height: 16px;
      animation: nudge 1.8s ease-in-out infinite;
    }

    @include hover {
      background: var(--c-surface);
    }
  }

  // Карточка входа и «парящие» детали вокруг
  &__stage {
    position: relative;
    animation: rise-in 0.7s cubic-bezier(0.2, 0, 0, 1) 0.12s both;
  }
}

.auth {
  @include glass(true);

  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-6) var(--space-5);
  border-radius: calc(var(--radius-lg) + 8px);
  box-shadow: var(--shadow-lg);
  scroll-margin-top: 100px;

  &__title {
    font-size: var(--fs-xl);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  &__sub,
  &__note {
    margin-top: calc(var(--space-2) * -1);
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  &__note {
    margin-top: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--c-accent-soft);
    color: var(--c-text);
  }

  &__or {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);

    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--c-border);
    }
  }

  &__link {
    @include reset-button;

    justify-self: center;
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    text-decoration: underline;
    text-underline-offset: 3px;

    @include hover {
      color: var(--c-text);
    }
  }

  &__error {
    color: var(--c-danger);
    font-size: var(--fs-sm);
  }
}

// Мини-плеер над карточкой (декор)
.float-player {
  @include glass(true);

  position: absolute;
  top: -78px;
  left: -72px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 270px;
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  transform: rotate(-4deg);
  animation: float 6s ease-in-out infinite;

  @include down(lg) {
    display: none;
  }

  &__cover {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    background: conic-gradient(from 200deg, var(--c-accent), color-mix(in oklab, var(--c-accent) 40%, var(--c-text)), var(--c-accent));
  }

  &__disc {
    width: 14px;
    height: 14px;
    border: 3px solid var(--c-bg);
    border-radius: 50%;
    animation: spin 3s linear infinite;
  }

  &__meta {
    display: grid;
    flex: 1;
    gap: 2px;
    min-width: 0;
  }

  &__title {
    font-size: var(--fs-sm);
    font-weight: 700;
  }

  &__sub {
    color: var(--c-text-muted);
    font-size: var(--fs-xs);
  }

  &__bar {
    height: 3px;
    margin-top: 4px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--c-surface-active);

    i {
      display: block;
      height: 100%;
      background: var(--c-accent);
      transform-origin: left;
      animation: progress 9s linear infinite;
    }
  }

  &__eq {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 16px;

    i {
      width: 3px;
      height: 100%;
      border-radius: 2px;
      background: var(--c-accent);
      transform-origin: bottom;
      animation: eq 0.9s ease-in-out infinite;

      &:nth-child(2) { animation-delay: -0.3s; }
      &:nth-child(3) { animation-delay: -0.6s; }
      &:nth-child(4) { animation-delay: -0.15s; }
    }
  }
}

// Плашка про синхронизацию лайков (декор)
.float-chip {
  @include glass(true);

  position: absolute;
  bottom: -20px;
  right: -36px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  box-shadow: var(--shadow-lg);
  font-size: var(--fs-sm);
  font-weight: 600;
  transform: rotate(3deg);
  animation: float 7s ease-in-out -2s infinite;

  svg {
    width: 16px;
    height: 16px;
    color: var(--c-accent);
  }

  @include down(lg) {
    display: none;
  }
}

// ---------- Бегущая строка ----------
.marquee {
  margin: var(--space-6) 0;
  overflow: hidden;
  border-block: 1px solid var(--c-border);
  mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);

  &__track {
    display: flex;
    width: max-content;
    animation: marquee 40s linear infinite;
  }

  &__item {
    display: inline-flex;
    align-items: center;
    padding: var(--space-3) var(--space-5);
    color: var(--c-text-muted);
    font-size: var(--fs-md);
    font-weight: 600;
    white-space: nowrap;

    &::after {
      content: '';
      width: 6px;
      height: 6px;
      margin-left: var(--space-5);
      border-radius: 50%;
      background: var(--c-accent);
    }
  }
}

// ---------- Разделы ----------
.section {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);
  width: min(100% - 2 * var(--space-5), 1120px);
  margin: 0 auto;
  padding: clamp(var(--space-6), 8vh, 96px) 0 0;
  scroll-margin-top: 70px;

  @include down(lg) {
    width: min(100% - 2 * var(--space-4), 560px);
  }

  &--narrow {
    width: min(100% - 2 * var(--space-4), 760px);
  }

  &__head {
    display: grid;
    gap: var(--space-2);
  }

  &__kicker {
    color: var(--c-accent);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  &__title {
    max-width: 18em;
    font-size: clamp(28px, 4vw, 44px);
    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 1.05;
  }
}

// ---------- Бенто ----------
.bento {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-flow: dense;
  gap: var(--space-3);

  @include down(lg) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @include down(sm) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.cell {
  @include glass;

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: end;
  gap: var(--space-2);
  min-height: 220px;
  padding: var(--space-5);
  overflow: hidden;
  border-radius: calc(var(--radius-lg) + 6px);

  h3 {
    font-size: var(--fs-lg, 1.125rem);
    font-weight: 700;
    letter-spacing: -0.015em;
  }

  p {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  &--wide {
    grid-column: span 2;
  }

  &--tall {
    grid-row: span 2;
  }

  // Последняя плитка — во всю ширину ряда (иначе справа оставалась пустота)
  &--full {
    grid-column: 1 / -1;
  }

  @include down(sm) {
    &--wide,
    &--tall {
      grid-column: auto;
      grid-row: auto;
    }
  }

  &--row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    align-content: center;
    gap: var(--space-4);
    min-height: 0;

    @include down(sm) {
      grid-template-columns: auto minmax(0, 1fr);

      > .cell__icon:last-child {
        display: none;
      }
    }
  }

  &__art {
    align-self: start;
    margin-bottom: auto;
  }

  &__icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md);
    background: var(--c-accent-soft);
    color: var(--c-accent);

    svg {
      width: 22px;
      height: 22px;
    }
  }
}

// Две библиотеки: строки треков с пометкой сервиса
.lib {
  display: grid;
  gap: 8px;
  margin-bottom: var(--space-4);

  &__row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius-md);
    background: var(--c-surface);

    &:nth-child(even) {
      margin-left: 24px;
    }

    i {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--c-surface-active);

      &.is-short {
        flex: 0.4;
      }
    }
  }

  &__src {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 800;

    &.is-y {
      background: var(--c-accent);
      color: var(--c-on-accent);
    }

    &.is-s {
      background: var(--c-text);
      color: var(--c-bg);
    }
  }
}

// Волна: эквалайзер
.wave {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 180px;
  margin-bottom: var(--space-4);

  i {
    flex: 1;
    height: calc(100% * var(--h));
    border-radius: 4px;
    background: linear-gradient(to top, var(--c-accent), color-mix(in srgb, var(--c-accent) 30%, transparent));
    transform-origin: bottom;
    animation: eq 1.6s ease-in-out calc(var(--i) * -0.13s) infinite;
  }
}

// Текст песни: текущая строка заливается
.lyric {
  display: grid;
  gap: 4px;
  margin-bottom: var(--space-3);
  font-weight: 700;

  &__line {
    color: var(--c-text-subtle);
    font-size: var(--fs-sm);

    &.is-past {
      color: var(--c-text-muted);
    }

    &.is-now {
      width: max-content;
      max-width: 100%;
      background: linear-gradient(90deg, var(--c-accent) 50%, var(--c-text-subtle) 50%) 100% 0 / 200% 100%;
      background-clip: text;
      color: transparent;
      font-size: var(--fs-md);
      animation: karaoke 3.5s linear infinite;
    }
  }
}

// Устройства: ноутбук ↔ телефон
.devices {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  color: var(--c-accent);

  svg {
    width: 34px;
    height: 34px;
  }

  &__link {
    position: relative;
    flex: 1;
    max-width: 90px;
    height: 2px;
    background: repeating-linear-gradient(90deg, var(--c-accent) 0 6px, transparent 6px 12px);

    &::after {
      content: '';
      position: absolute;
      top: -3px;
      left: 0;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--c-accent);
      animation: travel 2.4s ease-in-out infinite;
    }
  }
}

// Друзья: аватары внахлёст
.friends {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: var(--space-3);

  > span:not(.friends__chip) {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin-right: -10px;
    border: 3px solid var(--c-bg-elevated);
    border-radius: 50%;
    color: var(--c-on-accent);
    font-size: 13px;
    font-weight: 800;
  }

  &__a { background: var(--c-accent); }
  &__b { background: color-mix(in oklab, var(--c-accent) 55%, var(--c-text)); }
  &__c { background: var(--c-text); color: var(--c-bg) !important; }

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 22px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--c-accent-soft);
    color: var(--c-accent);
    font-size: var(--fs-xs);
    font-weight: 700;

    svg {
      width: 13px;
      height: 13px;
    }
  }
}

// Миксы: цифры десятилетий контуром
.mixes {
  display: flex;
  gap: 6px;
  margin-bottom: var(--space-2);

  span {
    color: transparent;
    font-size: 44px;
    font-weight: 900;
    letter-spacing: -0.05em;
    line-height: 1;
    -webkit-text-stroke: 1.5px var(--c-accent);

    &:nth-child(2) { opacity: 0.6; }
    &:nth-child(3) { opacity: 0.35; }
  }
}

// ---------- Шаги ----------
.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: none;

  @include down(md) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.step {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  padding: var(--space-5) var(--space-5) var(--space-5) 0;
  border-top: 2px solid var(--c-border);

  // Первый шаг — «пройден»: полоса акцентом
  &:first-child {
    border-top-color: var(--c-accent);
  }

  &__num {
    color: var(--c-accent);
    font-size: var(--fs-sm);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  h3 {
    font-size: var(--fs-lg, 1.125rem);
    font-weight: 700;
  }

  p {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }
}

// ---------- Что понадобится ----------
.needs {
  @include glass;

  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  overflow: hidden;
  border-radius: calc(var(--radius-lg) + 6px);
  list-style: none;

  @include down(md) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.need {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-5);
  // Разделители — только между ячейками
  box-shadow: inset -1px -1px 0 var(--c-border);

  > span:last-child {
    display: grid;
    gap: 4px;
    min-width: 0;

    strong {
      font-size: var(--fs-md);
    }

    span {
      color: var(--c-text-muted);
      font-size: var(--fs-sm);
      line-height: 1.45;
    }
  }

  &__icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: var(--c-accent-soft);
    color: var(--c-accent);

    svg {
      width: 20px;
      height: 20px;
    }
  }
}

// ---------- Вопросы ----------
.faq {
  display: grid;
  gap: var(--space-2);

  &__item {
    @include glass;

    border-radius: var(--radius-lg);
    overflow: hidden;

    summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
      font-weight: 600;
      cursor: pointer;
      list-style: none;

      &::-webkit-details-marker {
        display: none;
      }

      @include hover {
        background: var(--c-surface);
      }
    }

    p {
      margin: 0;
      padding: 0 var(--space-5) var(--space-4);
      color: var(--c-text-muted);
      font-size: var(--fs-sm);
      line-height: 1.55;
    }

    &[open] .faq__chevron {
      transform: rotate(180deg);
    }
  }

  &__chevron {
    flex: none;
    width: 18px;
    height: 18px;
    color: var(--c-text-muted);
    transition: transform var(--dur-fast) var(--ease);
  }
}

// ---------- Финал ----------
.final {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  width: min(100% - 2 * var(--space-4), 1120px);
  margin: clamp(var(--space-6), 10vh, 120px) auto 0;
  padding: clamp(var(--space-6), 8vh, 88px) var(--space-5);
  border-radius: calc(var(--radius-lg) + 12px);
  background:
    radial-gradient(80% 120% at 50% 0%, color-mix(in srgb, var(--c-accent) 30%, transparent), transparent 70%),
    var(--c-surface);
  text-align: center;

  h2 {
    font-size: clamp(32px, 5vw, 56px);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  > p {
    max-width: 30em;
    color: var(--c-text-muted);
  }

  &__cta {
    @include reset-button;
    @include focus-ring;

    margin-top: var(--space-2);
    padding: 14px 32px;
    border-radius: 999px;
    background: var(--c-accent);
    color: var(--c-on-accent);
    font-size: var(--fs-md);
    font-weight: 700;
    box-shadow: 0 10px 30px -10px var(--c-accent);
    transition: transform var(--dur-fast) var(--ease);

    @include hover {
      transform: translateY(-2px);
    }

    &:active {
      transform: scale(0.97);
    }
  }

  &__install {
    display: inline-flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-top: var(--space-3);
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    text-align: left;

    svg {
      flex: none;
      width: 18px;
      height: 18px;
      color: var(--c-accent);
    }
  }
}

.foot {
  padding: var(--space-6) var(--space-4) var(--space-5);
  color: var(--c-text-subtle);
  font-size: var(--fs-xs);
  text-align: center;
}

// ---------- Анимации (гасятся при «уменьшить движение» в _motion.scss) ----------
@keyframes glow {
  to { transform: translate(40px, 30px) scale(1.08); }
}

@keyframes float {
  0%,
  100% { translate: 0 0; }
  50% { translate: 0 -8px; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes progress {
  from { transform: scaleX(0.05); }
  to { transform: scaleX(1); }
}

@keyframes eq {
  0%,
  100% { transform: scaleY(0.35); }
  50% { transform: scaleY(1); }
}

@keyframes marquee {
  to { transform: translateX(-50%); }
}

@keyframes karaoke {
  from { background-position: 100% 0; }
  to { background-position: 0 0; }
}

@keyframes travel {
  0%,
  100% { transform: translateX(0); }
  50% { transform: translateX(80px); }
}

@keyframes nudge {
  0%,
  100% { transform: translateY(0); }
  50% { transform: translateY(3px); }
}
</style>
