<!--
  页面：登录与注册集成页（/login）。
  职责：提供用户名 + 密码登录表单，并在同一个卡片中集成注册表单。
        加入平滑动画过渡，同时保留了原本单独的注册页代码待后续测试通过后决定是否清理。
-->
<template>
  <div class="login-page">
    <div class="page-orb orb-matcha" aria-hidden="true"></div>
    <div class="page-orb orb-lemon" aria-hidden="true"></div>
    <div class="page-orb orb-ube" aria-hidden="true"></div>

    <div class="login-grid">
      <section class="story-panel" aria-label="登录页视觉介绍">
        <p class="eyebrow">Career planning studio</p>
        <h1 class="hero-title">把职业规划，做成一件更有质感的事。</h1>
        <p class="hero-copy">欢迎回来。登录后继续完善能力画像、探索目标岗位，并生成更清晰的成长路径。</p>

        <div class="story-pills">
          <span class="story-pill pill-matcha">Warm Cream</span>
          <span class="story-pill pill-lemon">Playful Hover</span>
          <span class="story-pill pill-ube">Rounded Card</span>
        </div>

        <div class="story-note">
          <span class="note-label">登录后可继续</span>
          <ul class="note-list">
            <li>补全信息录入与职业偏好</li>
            <li>查看能力画像与岗位推荐</li>
            <li>延续你的路径规划与分析报告</li>
          </ul>
        </div>
      </section>

      <section class="login-card">
        <div class="card-dash" aria-hidden="true"></div>
        <p class="card-tag">{{ isLoginMode ? 'Welcome back' : 'Join us' }}</p>
        <h2 class="card-title">{{ isLoginMode ? '登录' : '注册账号' }}</h2>
        <p class="card-subtitle">
          {{ isLoginMode ? '使用你的账号继续当前进度，重新进入职业规划工作台。' : '创建一个新账号以开始使用职业规划工作台。' }}
        </p>

        <div class="form-container">
          <transition name="form-fade" mode="out-in">
            <!-- 登录表单 -->
            <form v-if="isLoginMode" class="login-form" @submit.prevent="handleLogin" key="login">
              <div class="field">
                <label for="login-username">用户名</label>
                <input id="login-username" v-model="form.username" type="text" placeholder="请输入用户名或手机号" required />
              </div>

              <div class="field">
                <label for="login-password">密码</label>
                <input id="login-password" v-model="form.password" type="password" placeholder="请输入密码" required />
              </div>

              <div class="submit-wrap">
                <button type="submit" class="submit-btn" :disabled="isLoading">
                  <span>{{ isLoading ? '登录中...' : '进入工作台' }}</span>
                  <span class="btn-accent">→</span>
                </button>
              </div>

              <div class="login-footer">
                <span>还没有账号？</span>
                <a href="#" class="login-link" @click.prevent="toggleMode">立即注册</a>
              </div>
            </form>

            <!-- 注册表单 -->
            <form v-else class="login-form" @submit.prevent="handleRegister" key="register">
              <div class="field-row">
                <div class="field">
                  <label for="reg-username">用户名</label>
                  <input id="reg-username" v-model="form.username" type="text" placeholder="设置用户名" required />
                </div>
                <div class="field">
                  <label for="reg-phone">手机号</label>
                  <input id="reg-phone" v-model="form.phone" type="tel" placeholder="输入手机号" required pattern="^1[3-9]\d{9}$" title="请输入有效的手机号" />
                </div>
              </div>

              <div class="field">
                <label for="reg-email">邮箱 <span class="optional">(选填)</span></label>
                <input id="reg-email" v-model="form.email" type="email" placeholder="输入常用邮箱" />
              </div>

              <div class="field-row">
                <div class="field">
                  <label for="reg-password">密码</label>
                  <input id="reg-password" v-model="form.password" type="password" placeholder="设置密码" required @input="checkPassword" />
                </div>
                <div class="field">
                  <label for="reg-confirm">确认密码</label>
                  <input id="reg-confirm" v-model="form.confirmPassword" type="password" placeholder="再次输入" required @input="checkPassword" />
                </div>
              </div>
              <p v-if="passwordError" class="error-msg">{{ passwordError }}</p>

              <div class="field checkbox-field">
                <input id="agreement" v-model="form.agreement" type="checkbox" required />
                <label for="agreement">
                  我已阅读并同意 <a href="#" class="login-link" @click.prevent>用户协议</a> 和 <a href="#" class="login-link" @click.prevent>隐私政策</a>
                </label>
              </div>

              <div class="submit-wrap">
                <button type="submit" class="submit-btn" :disabled="isLoading || !!passwordError">
                  <span>{{ isLoading ? '注册中...' : '立即注册' }}</span>
                  <span class="btn-accent">→</span>
                </button>
              </div>

              <div class="login-footer">
                <span>已有账号？</span>
                <a href="#" class="login-link" @click.prevent="toggleMode">立即登录</a>
              </div>
            </form>
          </transition>
        </div>
      </section>
    </div>

    <AppDialog v-model="errorVisible" :title="dialogTitle" :message="errorMessage" />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { loginApi, registerApi } from '@/api/user'
import Cookies from 'js-cookie'
import AppDialog from '@/components/AppDialog.vue'

defineOptions({ name: 'UserLoginPage' })

const router = useRouter()
const isLoading = ref(false)

// 视图模式切换
const isLoginMode = ref(true)

// 弹窗提示状态
const errorVisible = ref(false)
const errorMessage = ref('')
const dialogTitle = computed(() => isLoginMode.value ? '登录提示' : '注册提示')

const passwordError = ref('')

const form = reactive({
  username: '',
  password: '',
  phone: '',
  email: '',
  confirmPassword: '',
  agreement: false
})

const toggleMode = () => {
  isLoginMode.value = !isLoginMode.value
  // 切换模式时清空错误状态和密码
  errorMessage.value = ''
  passwordError.value = ''
  form.password = ''
  form.confirmPassword = ''
}

const checkPassword = () => {
  if (form.confirmPassword && form.password !== form.confirmPassword) {
    passwordError.value = '两次输入的密码不一致'
  } else {
    passwordError.value = ''
  }
}

const handleLogin = async () => {
  if (!form.username || !form.password) {
    errorMessage.value = '请输入用户名和密码'
    errorVisible.value = true
    return
  }

  isLoading.value = true
  try {
    const res = await loginApi({ username: form.username, password: form.password })
    Cookies.set('userInfo', JSON.stringify(res.user), { expires: 7 })
    Cookies.set('token', res.token, { expires: 7 })
    router.push('/')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '登录失败，请检查账号密码'
    errorMessage.value = msg
    errorVisible.value = true
  } finally {
    isLoading.value = false
  }
}

const handleRegister = async () => {
  if (form.password !== form.confirmPassword) {
    passwordError.value = '两次输入的密码不一致'
    errorMessage.value = '两次输入的密码不一致'
    errorVisible.value = true
    return
  }
  if (!form.agreement) {
    errorMessage.value = '请先同意用户协议'
    errorVisible.value = true
    return
  }

  isLoading.value = true
  try {
    await registerApi({
      username: form.username,
      phone: form.phone,
      password: form.password,
      confirmPassword: form.confirmPassword,
      email: form.email
    })
    
    // 注册成功，提示并切回到登录模式
    errorMessage.value = '账号注册成功，请使用新账号登录！'
    errorVisible.value = true
    toggleMode()
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '注册失败，请稍后重试'
    errorMessage.value = msg
    errorVisible.value = true
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  --clay-bg:#faf9f7; --clay-card:#fff; --clay-text:#000; --clay-muted:#9f9b93; --clay-border:#dad4c8;
  --clay-border-light:#eee9df; --clay-focus:#146ef5; --clay-matcha:#84e7a5; --clay-lemon:#fbbd41;
  --clay-ube:#43089f; --clay-pomegranate:#fc7981;
  --clay-shadow:rgba(0,0,0,.1) 0 1px 1px, rgba(0,0,0,.04) 0 -1px 1px inset, rgba(0,0,0,.05) 0 -.5px 1px;
  position:relative; min-height:100vh; overflow:hidden; display:flex; align-items:center; justify-content:center;
  padding:40px 24px; background:transparent; color:var(--clay-text); font-family:'Roobert', Arial, sans-serif;
  font-feature-settings:'ss03' 1, 'ss10' 1, 'ss11' 1, 'ss12' 1;
}

.page-orb { position:absolute; border-radius:999px; filter:blur(.5px); opacity:.95; pointer-events:none; }
.orb-matcha { top:56px; left:-88px; width:240px; height:240px; background:radial-gradient(circle at 35% 35%, #b6f5ca 0%, var(--clay-matcha) 58%, transparent 60%); }
.orb-lemon { top:80px; right:10%; width:156px; height:156px; background:radial-gradient(circle at 50% 50%, #ffe6a8 0%, var(--clay-lemon) 62%, transparent 64%); }
.orb-ube { right:-70px; bottom:50px; width:220px; height:220px; background:radial-gradient(circle at 50% 50%, #c1b0ff 0%, var(--clay-ube) 65%, transparent 67%); }

.login-grid { position:relative; z-index:1; width:min(1120px, 100%); display:grid; grid-template-columns:minmax(0, 1.08fr) minmax(360px, 440px); gap:28px; align-items:stretch; }
.story-panel, .login-card { position:relative; background:var(--clay-card); box-shadow:var(--clay-shadow); }
.story-panel {
  padding:44px 40px; border:1px dashed var(--clay-border); border-radius:40px;
  background:linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.88)), radial-gradient(circle at top left, rgba(132,231,165,.38), transparent 30%), radial-gradient(circle at bottom right, rgba(251,189,65,.26), transparent 32%);
  display:flex; flex-direction:column; gap:24px;
}

.eyebrow, .note-label, .field label, .card-tag { font-size:12px; font-weight:600; letter-spacing:1.08px; text-transform:uppercase; }
.eyebrow, .card-tag { color:var(--clay-muted); }
.hero-title, .card-title {
  margin:0; font-weight:600; line-height:1; letter-spacing:-1.4px;
  font-feature-settings:'ss01' 1, 'ss03' 1, 'ss10' 1, 'ss11' 1, 'ss12' 1;
}
.hero-title { font-size:clamp(40px, 5vw, 64px); max-width:10ch; }
.hero-copy, .card-subtitle, .login-footer { margin:0; font-size:16px; line-height:1.6; color:#55534e; }

.story-pills { display:flex; flex-wrap:wrap; gap:12px; }
.story-pill { border-radius:999px; padding:10px 16px; font-size:14px; font-weight:500; border:1px solid rgba(0,0,0,.08); }
.pill-matcha { background:#ecfff1; }
.pill-lemon { background:#fff4d6; }
.pill-ube { background:#efe8ff; }

.story-note { margin-top:auto; padding:24px; border:1px solid var(--clay-border); border-radius:24px; background:rgba(255,255,255,.9); }
.note-list { margin:12px 0 0; padding:0; list-style:none; display:grid; gap:12px; }
.note-list li { position:relative; padding-left:20px; font-size:16px; color:#333; }
.note-list li::before { content:''; position:absolute; left:0; top:10px; width:8px; height:8px; border-radius:999px; background:var(--clay-pomegranate); }

.login-card { padding:40px 36px 32px; border:1px solid var(--clay-border); border-radius:32px; overflow:hidden; }
.card-dash { position:absolute; inset:14px; border:1px dashed var(--clay-border-light); border-radius:24px; pointer-events:none; }
.card-title { font-size:clamp(44px, 7vw, 60px); margin-top:8px; }
.card-subtitle { margin-top:10px; margin-bottom:28px; }
.form-container { position: relative; }
.login-form { display:flex; flex-direction:column; gap:18px; }
.field { display:flex; flex-direction:column; gap:8px; }
.field input {
  width:100%; min-height:54px; padding:14px 16px; border:1px solid #717989; border-radius:4px; background:#fff;
  color:var(--clay-text); font:inherit; transition:border-color .2s ease, box-shadow .2s ease, transform .2s ease;
}
.field input::placeholder { color:var(--clay-muted); }
.field input:focus-visible { outline:2px solid var(--clay-focus); outline-offset:2px; border-color:var(--clay-focus); box-shadow:0 0 0 3px rgba(20,110,245,.12); }

.submit-wrap { margin-top:28px; margin-bottom: 24px; display:flex; align-items:flex-end; }
.submit-btn {
  width:100%; min-height:56px; border:1px solid #000; border-radius:999px; background:#000; color:#fff;
  box-shadow:var(--clay-shadow); display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:14px 20px; font:inherit; font-size:16px; font-weight:500; cursor:pointer;
  transition:transform .25s ease, background-color .25s ease, box-shadow .25s ease;
}
.btn-accent { font-size:20px; line-height:1; }
.submit-btn:hover:not(:disabled) { background:var(--clay-ube); transform:translateY(-2px); box-shadow:var(--clay-shadow-hard); }
.submit-btn:focus-visible { outline:2px solid var(--clay-focus); outline-offset:4px; }
.submit-btn:disabled { border-color:var(--clay-border); background:var(--clay-border-light); color:var(--clay-muted); cursor:not-allowed; }

.login-footer { display:flex; justify-content:center; gap:8px; }
.login-link { color:var(--clay-ube); font-weight:600; text-decoration:none; }
.login-link:hover { text-decoration:underline; text-decoration-thickness:1.5px; }

/* 注册特有样式 */
.field-row { display: flex; gap: 16px; }
.field-row .field { flex: 1; }
.optional { font-size: 12px; color: var(--clay-muted); font-weight: normal; text-transform: none; letter-spacing: normal; }
.checkbox-field { flex-direction: row; align-items: center; gap: 8px; margin-top: 4px; }
.checkbox-field input[type="checkbox"] { width: 16px; min-height: 16px; padding: 0; cursor: pointer; }
.checkbox-field label { font-size: 14px; text-transform: none; letter-spacing: normal; color: #55534e; cursor: pointer; }
.error-msg { color: #d32f2f; font-size: 12px; margin-top: -12px; margin-bottom: 4px; padding-left: 4px; }

/* 表单切换动画 */
.form-fade-enter-active,
.form-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.form-fade-enter-from {
  opacity: 0;
  transform: translateX(15px);
}
.form-fade-leave-to {
  opacity: 0;
  transform: translateX(-15px);
}

@media (max-width: 991px) {
  .login-page { padding:24px 16px 40px; }
  .login-grid { grid-template-columns:1fr; }
  .login-card { order:-1; }
  .story-panel, .login-card { padding:28px 24px; border-radius:28px; }
}

@media (max-width: 640px) {
  .hero-title { font-size:40px; }
  .card-title { font-size:44px; }
  .login-footer { flex-direction:column; align-items:center; gap:4px; }
  .submit-wrap { margin-top:16px; margin-bottom:16px; }
  .field-row { flex-direction: column; gap: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .submit-btn, .field input { transition:none; }
  .submit-btn:hover:not(:disabled) { transform:none; box-shadow:var(--clay-shadow); }
  .form-fade-enter-active, .form-fade-leave-active { transition: none; }
}
</style>
