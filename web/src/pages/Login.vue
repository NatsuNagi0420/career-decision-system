<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, LockKeyhole, LogIn, TriangleAlert, UserPlus } from 'lucide-vue-next'
import { m3Message } from '@/design-system/services/feedback'
import { loginApi, registerApi } from '@/api/user'
import { persistSession } from '@/utils/session'

defineOptions({ name: 'LoginPage' })

const route = useRoute()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const loading = ref(false)
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

const switchMode = (next: 'login' | 'register') => {
  mode.value = next
  form.password = ''
  form.confirmPassword = ''
}

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
      <header class="auth-brand">
        <span class="brand-mark"><LockKeyhole :size="20" /></span>
        <div><strong>职途</strong><span>职业决策与行动</span></div>
      </header>

      <M3Card tag="section" class="auth-panel">
        <M3Tabs class="mode-control" aria-label="账户操作">
          <M3Tab :active="mode === 'login'" @click="switchMode('login')"><template #icon><LogIn :size="17" /></template>登录</M3Tab>
          <M3Tab :active="mode === 'register'" @click="switchMode('register')"><template #icon><UserPlus :size="17" /></template>注册</M3Tab>
        </M3Tabs>

        <div v-if="sessionExpired" class="session-notice" role="alert"><TriangleAlert :size="17" /><span>登录已过期，请重新登录。未提交的本地草稿仍然保留。</span></div>

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
      </M3Card>
    </main>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; display: grid; place-items: center; padding: 28px 20px; background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); }
.auth-shell { width: min(470px, 100%); }
.auth-brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 18px; }
.brand-mark { width: 40px; height: 40px; display: grid; place-items: center; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.auth-brand > div { display: grid; gap: 1px; }
.auth-brand strong { font-size: var(--md-sys-typescale-title-medium-size); }.auth-brand div span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.auth-panel { padding: 26px; }
.session-notice { display: flex; align-items: flex-start; gap: 8px; margin-top: 16px; border-left: 3px solid var(--career-sys-color-warning); background: var(--md-sys-color-surface-container); padding: 10px 12px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.mode-control { width: 100%; }
.form-heading { margin: 26px 0 22px; }
.form-heading h1 { margin: 0 0 7px; font-size: var(--md-sys-typescale-headline-small-size); }
.form-heading p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.55; }
.auth-form { display: grid; gap: 16px; }
.two-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.field-error { margin: -7px 0 0; color: var(--md-sys-color-error); font-size: var(--md-sys-typescale-body-small-size); }
.agreement { display: flex; align-items: flex-start; gap: 8px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; cursor: pointer; }
.submit-button { width: 100%; margin-top: 3px; }
@media (max-width: 520px) { .auth-panel { padding: 22px 18px; } .two-fields { grid-template-columns: 1fr; } }
</style>
