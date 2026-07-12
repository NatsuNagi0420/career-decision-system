<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  FileClock,
  Image,
  LogOut,
  MonitorCog,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  Upload,
  UserRound
} from 'lucide-vue-next'
import { logoutApi } from '@/api/user'
import { M3Button } from '@/design-system/components'
import { m3Confirm, m3Message } from '@/design-system/services/feedback'
import { PRESET_SEED_COLORS } from '@/design-system/theme/materialTheme'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import { clearSession, getStoredUser } from '@/utils/session'

defineOptions({ name: 'SettingsPage' })

const router = useRouter()
const themeStore = useThemeStore()
const user = computed(() => getStoredUser())
const processingImage = ref(false)

const modeOptions: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: MonitorCog }
]

const presetSeeds = PRESET_SEED_COLORS

const handleBackgroundFile = async (file: File) => {
  processingImage.value = true
  try {
    const colors = await themeStore.setBackgroundImage(file)
    m3Message.success(colors.length ? '背景和动态配色已更新' : '背景已更新')
  } catch (error) {
    m3Message.error(error instanceof Error ? error.message : '背景图片处理失败')
  } finally {
    processingImage.value = false
  }
}

const removeBackground = async () => {
  await m3Confirm('移除当前 Web 背景？动态配色可以继续保留。', '移除背景', {
    confirmButtonText: '移除背景',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await themeStore.removeBackground()
  m3Message.success('Web 背景已移除')
}

const resetAppearance = async () => {
  await m3Confirm('恢复品牌动态配色并移除当前 Web 背景？', '恢复默认外观', {
    confirmButtonText: '恢复默认',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await themeStore.resetTheme()
  m3Message.success('已恢复默认外观')
}

const logout = async () => {
  await m3Confirm('退出后需要重新登录才能继续使用，确认退出吗？', '退出登录', {
    confirmButtonText: '退出登录',
    cancelButtonText: '取消',
    type: 'warning'
  })
  try {
    await logoutApi()
  } catch {
    // 本地会话仍需清除，避免失效令牌把用户留在受保护页面。
  } finally {
    clearSession()
    await router.replace('/login')
  }
}
</script>

<template>
  <div class="product-page">
    <div class="product-shell settings-shell">
      <header class="product-header">
        <div><h1>设置</h1><p>管理当前 Web 平台的动态配色、背景和账户。</p></div>
        <M3Button variant="text" @click="resetAppearance"><template #icon><RotateCcw :size="18" /></template>恢复默认</M3Button>
      </header>

      <section class="settings-band">
        <div class="section-label"><Palette :size="22" /><div><h2>动态配色</h2><p>由 Material Color Utilities 生成完整 Light 与 Dark 颜色角色。</p></div></div>
        <div class="section-control">
          <M3Tabs class="segmented-control" aria-label="界面模式">
            <M3Tab
              v-for="option in modeOptions"
              :key="option.value"
              :active="themeStore.themeMode === option.value"
              @click="themeStore.setTheme(option.value)"
            >
              <component :is="option.icon" :size="18" />{{ option.label }}
            </M3Tab>
          </M3Tabs>

          <div class="seed-control">
            <label class="seed-picker">
              <span>自选种子色</span>
              <M3ColorPicker :model-value="themeStore.seedColor" label="选择主题种子色" @update:model-value="themeStore.setSeedColor" />
              <code>{{ themeStore.seedColor }}</code>
            </label>
            <div class="seed-presets" aria-label="主题色预设">
              <M3ColorSwatch
                v-for="preset in presetSeeds"
                :key="preset.value"
                :label="preset.label"
                :color="preset.value"
                :selected="themeStore.seedColor === preset.value"
                @click="themeStore.setSeedColor(preset.value)"
              />
            </div>
          </div>

          <div class="theme-preview" aria-label="当前动态颜色预览">
            <span class="preview-primary">Primary</span>
            <span class="preview-secondary">Secondary</span>
            <span class="preview-tertiary">Tertiary</span>
            <span class="preview-surface">Surface</span>
          </div>

          <label class="range-control">
            <span><strong>对比度</strong><small>{{ themeStore.preferences.contrastLevel.toFixed(1) }}</small></span>
            <M3Slider :model-value="themeStore.preferences.contrastLevel" :min="-0.5" :max="1" :step="0.1" label="主题对比度" @update:model-value="themeStore.setContrastLevel" />
          </label>
        </div>
      </section>

      <section class="settings-band">
        <div class="section-label"><Image :size="22" /><div><h2>Web 背景</h2><p>图片只保存在当前浏览器；取色可以独立保留。</p></div></div>
        <div class="section-control background-control">
          <div v-if="themeStore.backgroundObjectUrl" class="background-preview" :style="themeStore.backgroundStyle">
            <div></div>
            <span>当前 Web 背景</span>
          </div>
          <div v-else class="background-empty"><Image :size="30" /><span>还没有自定义背景</span></div>

          <div class="background-actions">
            <M3FilePicker :label="processingImage ? '正在处理' : '选择图片'" accept="image/jpeg,image/png,image/webp" variant="tonal" :disabled="processingImage" @selected="handleBackgroundFile">
              <template #icon><Upload :size="18" /></template>
            </M3FilePicker>
            <M3Button v-if="themeStore.backgroundObjectUrl" variant="text" @click="removeBackground">移除背景</M3Button>
          </div>

          <label v-if="themeStore.backgroundObjectUrl" class="switch-row">
            <span><strong>显示背景</strong><small>关闭后保留图片和取色结果</small></span>
            <M3Switch :model-value="themeStore.preferences.backgroundEnabled" label="显示背景" @update:model-value="themeStore.setBackgroundEnabled" />
          </label>

          <label v-if="themeStore.backgroundObjectUrl" class="range-control">
            <span><strong>背景遮罩</strong><small>{{ Math.round(themeStore.preferences.backgroundScrim * 100) }}%</small></span>
            <M3Slider :model-value="themeStore.preferences.backgroundScrim" :min="0.2" :max="0.8" :step="0.05" label="背景遮罩" @update:model-value="themeStore.setBackgroundScrim" />
          </label>

          <div v-if="themeStore.paletteCandidates.length" class="image-colors">
            <span>图片候选色</span>
            <M3ColorSwatch
              v-for="color in themeStore.paletteCandidates"
              :key="color"
              :label="`使用候选色 ${color}`"
              :color="color"
              :selected="themeStore.seedColor === color"
              @click="themeStore.setSeedColor(color, 'custom_image')"
            />
          </div>
        </div>
      </section>

      <section class="settings-band">
        <div class="section-label"><UserRound :size="22" /><div><h2>账户</h2><p>{{ user?.username || '当前用户' }}<span v-if="user?.email"> · {{ user.email }}</span></p></div></div>
        <div class="section-control account-actions">
          <M3Button variant="outlined" @click="router.push('/profile')"><template #icon><UserRound :size="18" /></template>个人档案</M3Button>
          <M3Button variant="outlined" @click="router.push('/history')"><template #icon><FileClock :size="18" /></template>历史记录</M3Button>
          <M3Button class="logout-button" variant="text" @click="logout"><template #icon><LogOut :size="18" /></template>退出登录</M3Button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-shell { max-width: 960px; }
.settings-band { display: grid; grid-template-columns: minmax(220px, .8fr) minmax(360px, 1.4fr); gap: 56px; padding: 32px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.section-label { display: flex; align-items: flex-start; gap: 14px; color: var(--md-sys-color-primary); }
.section-label h2 { margin: 0; color: var(--md-sys-color-on-surface); font-size: var(--md-sys-typescale-title-large-size); font-weight: 400; line-height: var(--md-sys-typescale-title-large-line-height); }
.section-label p { margin: 6px 0 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: var(--md-sys-typescale-body-medium-line-height); }
.section-control { display: grid; gap: 20px; }
.segmented-control { width: 100%; }
.seed-control, .seed-picker, .seed-presets, .image-colors, .background-actions, .account-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.seed-control { justify-content: space-between; }
.seed-picker { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-large-size); font-weight: 500; }
.seed-picker code { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.theme-preview { display: grid; grid-template-columns: repeat(4, 1fr); overflow: hidden; border-radius: var(--md-sys-shape-corner-medium); }
.theme-preview span { display: grid; min-height: 72px; place-items: end start; padding: 10px; font-size: var(--md-sys-typescale-label-small-size); font-weight: 500; }
.preview-primary { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.preview-secondary { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.preview-tertiary { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
.preview-surface { background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface); }
.range-control, .switch-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; }
.range-control > span, .switch-row > span { display: grid; }
.range-control strong, .switch-row strong { font-size: var(--md-sys-typescale-label-large-size); font-weight: 500; }
.range-control small, .switch-row small { color: var(--md-sys-color-on-surface-variant); }
.range-control > :last-child { grid-column: 1 / -1; width: 100%; }
.background-preview, .background-empty { position: relative; display: grid; min-height: 190px; overflow: hidden; place-items: end start; border-radius: var(--md-sys-shape-corner-large); background-position: center; background-size: cover; }
.background-preview > div { position: absolute; inset: 0; background: color-mix(in srgb, var(--md-sys-color-scrim) 42%, transparent); }
.background-preview span { position: relative; padding: 16px; color: var(--md-sys-color-inverse-on-surface); font-weight: 500; }
.background-empty { place-items: center; align-content: center; gap: 10px; background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); }
.image-colors > span { width: 100%; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-large-size); }
.logout-button { --md-text-button-label-text-color: var(--md-sys-color-error); }
@media (max-width: 760px) { .settings-band { grid-template-columns: 1fr; gap: 20px; } .theme-preview { grid-template-columns: repeat(2, 1fr); } .account-actions { align-items: stretch; flex-direction: column; } }
</style>
