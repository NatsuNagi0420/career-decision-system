<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, LogIn, TriangleAlert, UserPlus } from 'lucide-vue-next'
import { m3Message } from '@/design-system/services/feedback'
import { loginApi, registerApi } from '@/api/user'
import { persistSession } from '@/utils/session'
import BrandIdentity from '@/components/BrandIdentity.vue'
import { brandAssets } from '@/assets/brand'

defineOptions({ name: 'LoginPage' })

const route = useRoute()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const modeDirection = ref<'forward' | 'backward'>('forward')
const modeStage = ref<HTMLElement | null>(null)
const loading = ref(false)
let modeHeightAnimation: Animation | null = null
const sessionExpired = computed(() => route.query.expired === '1')
const passwordError = computed(() =>
  mode.value === 'register' && form.confirmPassword && form.password !== form.confirmPassword
    ? '两次输入的密码不一致'
    : ''
)

const form = reactive({
  username: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
  agreement: false
})

const parseMotionDuration = (value: string) => {
  const normalized = value.trim().toLowerCase()
  const amount = Number.parseFloat(normalized)
  if (!Number.isFinite(amount)) return 300
  if (normalized.endsWith('ms')) return amount
  if (normalized.endsWith('s')) return amount * 1000
  return 300
}

const prepareEnteringMode = (element: Element) => {
  if (!(element instanceof HTMLElement)) return
  element.inert = false
  element.removeAttribute('aria-hidden')
}

const hideLeavingModeFromAssistiveTechnology = (element: Element) => {
  if (!(element instanceof HTMLElement)) return
  element.inert = true
  element.setAttribute('aria-hidden', 'true')
}

const switchMode = async (next: 'login' | 'register') => {
  if (next === mode.value) return

  const stage = modeStage.value
  const fromHeight = stage?.getBoundingClientRect().height ?? 0
  modeDirection.value = next === 'register' ? 'forward' : 'backward'

  modeHeightAnimation?.cancel()
  modeHeightAnimation = null
  if (stage && fromHeight > 0) stage.style.height = `${fromHeight}px`

  mode.value = next
  form.password = ''
  form.confirmPassword = ''

  await nextTick()
  if (!stage || stage !== modeStage.value) return

  const nextView = stage.querySelector<HTMLElement>(`[data-auth-mode="${next}"]`)
  const toHeight = nextView?.scrollHeight ?? 0
  const view = stage.ownerDocument.defaultView
  const reducedMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (!toHeight || reducedMotion || typeof stage.animate !== 'function') {
    stage.style.removeProperty('height')
    return
  }

  const styles = view?.getComputedStyle(stage)
  const duration = parseMotionDuration(styles?.getPropertyValue('--md-sys-motion-duration-medium2') ?? '')
  const easing = styles?.getPropertyValue('--md-sys-motion-easing-emphasized').trim() || 'cubic-bezier(0.2, 0, 0, 1)'
  const animation = stage.animate(
    { height: [`${fromHeight}px`, `${toHeight}px`] },
    { duration, easing, fill: 'both' }
  )
  modeHeightAnimation = animation

  try {
    await animation.finished
  } catch {
    // A newer tab selection or page teardown owns the next layout state.
  } finally {
    if (modeHeightAnimation === animation) {
      modeHeightAnimation = null
      stage.style.removeProperty('height')
    }
  }
}

onBeforeUnmount(() => {
  modeHeightAnimation?.cancel()
  modeHeightAnimation = null
})

const login = async () => {
  if (!form.username.trim() || !form.password) {
    m3Message.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    const session = await loginApi({ username: form.username.trim(), password: form.password })
    persistSession(session)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } finally {
    loading.value = false
  }
}

const register = async () => {
  if (!form.username.trim() || !form.phone.trim() || !form.password || !form.confirmPassword) {
    m3Message.warning('请完成必填项')
    return
  }
  if (passwordError.value) {
    m3Message.warning(passwordError.value)
    return
  }
  if (!form.agreement) {
    m3Message.warning('请先同意用户协议和隐私政策')
    return
  }
  loading.value = true
  try {
    await registerApi({
      username: form.username.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      password: form.password,
      confirmPassword: form.confirmPassword
    })
    const session = await loginApi({ username: form.username.trim(), password: form.password })
    persistSession(session)
    m3Message.success('账号已创建')
    await router.replace('/onboarding')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <main class="auth-shell">
      <aside class="brand-showcase" aria-label="青穗集品牌介绍">
        <img :src="brandAssets.lockupSuina" alt="青穗集与 AI 导师穗奈" />
        <div><h1>把职业选择，变成可以验证的行动</h1><p>整理真实岗位、个人证据与阶段反馈，在每次选择前多看一步。</p></div>
      </aside>

      <div class="auth-column">
        <header class="auth-brand"><BrandIdentity /></header>
        <M3Card tag="section" class="auth-panel">
        <M3Tabs class="mode-control" aria-label="账户操作">
          <M3Tab :active="mode === 'login'" @click="switchMode('login')"><template #icon><LogIn :size="17" /></template>登录</M3Tab>
          <M3Tab :active="mode === 'register'" @click="switchMode('register')"><template #icon><UserPlus :size="17" /></template>注册</M3Tab>
        </M3Tabs>

        <div v-if="sessionExpired" class="session-notice" role="alert"><TriangleAlert :size="17" /><span>登录已过期，请重新登录。未提交的本地草稿仍然保留。</span></div>

        <div ref="modeStage" class="auth-mode-stage" :data-direction="modeDirection">
          <Transition name="auth-mode" @before-enter="prepareEnteringMode" @before-leave="hideLeavingModeFromAssistiveTechnology">
            <section :key="mode" class="auth-mode-view" :data-auth-mode="mode">
              <header class="form-heading">
                <h1>{{ mode === 'login' ? '继续你的职业决策' : '创建学生账号' }}</h1>
                <p>{{ mode === 'login' ? '登录后回到当前项目和行动进度。' : '新账号会从五分钟基础引导开始。' }}</p>
              </header>

              <form v-if="mode === 'login'" class="auth-form" @submit.prevent="login">
                <label class="field-label" for="login-username">用户名或手机号<M3TextField id="login-username" v-model="form.username"  autocomplete="username" /></label>
                <label class="field-label" for="login-password">密码<M3TextField id="login-password" v-model="form.password"  type="password" autocomplete="current-password" /></label>
                <M3Button class="submit-button" type="submit" :disabled="loading">{{ loading ? '正在登录' : '进入工作台' }}<ArrowRight :size="17" /></M3Button>
              </form>

              <form v-else class="auth-form" @submit.prevent="register">
                <label class="field-label" for="register-username">用户名<M3TextField id="register-username" v-model="form.username"  maxlength="32" autocomplete="username" /></label>
                <div class="two-fields">
                  <label class="field-label" for="register-phone">手机号<M3TextField id="register-phone" v-model="form.phone"  type="tel" pattern="^1[3-9]\d{9}$" autocomplete="tel" /></label>
                  <label class="field-label" for="register-email">邮箱（选填）<M3TextField id="register-email" v-model="form.email"  type="email" autocomplete="email" /></label>
                </div>
                <div class="two-fields">
                  <label class="field-label" for="register-password">密码<M3TextField id="register-password" v-model="form.password"  type="password" autocomplete="new-password" /></label>
                  <label class="field-label" for="register-confirm">确认密码<M3TextField id="register-confirm" v-model="form.confirmPassword"  type="password" autocomplete="new-password" /></label>
                </div>
                <p v-if="passwordError" class="field-error">{{ passwordError }}</p>
                <label class="agreement"><M3Checkbox v-model="form.agreement" label="同意用户协议和隐私政策" /><span>我已阅读并同意用户协议和隐私政策</span></label>
                <M3Button class="submit-button" type="submit" :disabled="loading || !!passwordError">{{ loading ? '正在创建' : '创建并开始引导' }}<ArrowRight :size="17" /></M3Button>
              </form>
            </section>
          </Transition>
        </div>
        </M3Card>
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; display: grid; place-items: center; padding: 28px 20px; background: color-mix(in srgb, var(--md-sys-color-surface) var(--career-background-canvas-tint-opacity), transparent); color: var(--md-sys-color-on-surface); }
.auth-shell { display: grid; width: min(960px, 100%); grid-template-columns: minmax(0, 0.95fr) minmax(420px, 1fr); align-items: center; gap: 42px; }
.brand-showcase { display: grid; align-self: stretch; align-content: center; gap: 18px; overflow: hidden; border-radius: var(--md-sys-shape-corner-extra-large); background: color-mix(in srgb, var(--md-sys-color-primary-container) 66%, transparent); padding: 30px; }
.brand-showcase > img { display: block; width: 100%; max-height: 310px; object-fit: contain; }
.brand-showcase h1 { margin: 0; font-size: var(--md-sys-typescale-headline-small-size); line-height: var(--md-sys-typescale-headline-small-line-height); }
.brand-showcase p { margin: 8px 0 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
.auth-column { min-width: 0; }
.auth-brand { display: flex; justify-content: center; margin-bottom: 18px; }
.auth-panel { padding: 26px; }
.session-notice { display: flex; align-items: flex-start; gap: 8px; margin-top: 16px; border-left: 3px solid var(--career-sys-color-warning); background: var(--md-sys-color-surface-container); padding: 10px 12px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.mode-control { width: 100%; }
.auth-mode-stage { position: relative; overflow: hidden; }
.auth-mode-view { display: grid; min-width: 0; }
.auth-mode-enter-active {
  transition:
    opacity var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate),
    transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate);
  will-change: opacity, transform;
}
.auth-mode-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  transition:
    opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized-accelerate),
    transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized-accelerate);
  pointer-events: none;
  will-change: opacity, transform;
}
.auth-mode-stage[data-direction='forward'] > .auth-mode-enter-from,
.auth-mode-stage[data-direction='backward'] > .auth-mode-leave-to { opacity: 0; transform: translateX(var(--career-spacing-6)); }
.auth-mode-stage[data-direction='forward'] > .auth-mode-leave-to,
.auth-mode-stage[data-direction='backward'] > .auth-mode-enter-from { opacity: 0; transform: translateX(calc(0px - var(--career-spacing-6))); }
.form-heading { margin: 26px 0 22px; }
.form-heading h1 { margin: 0 0 7px; font-size: var(--md-sys-typescale-headline-small-size); }
.form-heading p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.55; }
.auth-form { display: grid; gap: 16px; }
.two-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.field-error { margin: -7px 0 0; color: var(--md-sys-color-error); font-size: var(--md-sys-typescale-body-small-size); }
.agreement { display: flex; align-items: flex-start; gap: 8px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; cursor: pointer; }
.submit-button { width: 100%; margin-top: 3px; }
@media (max-width: 820px) { .auth-shell { width: min(470px, 100%); grid-template-columns: 1fr; } .brand-showcase { display: none; } }
@media (max-width: 520px) { .auth-panel { padding: 22px 18px; } .two-fields { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) {
  .auth-mode-enter-active, .auth-mode-leave-active { transition: none; }
  .auth-mode-enter-from, .auth-mode-leave-to { opacity: 1; transform: none; }
}
</style>
