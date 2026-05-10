<!--
  组件：应用根组件 App（使用新的 MainLayout）
  职责：挂载全局布局（导航+侧边栏）、路由视图、页脚与全局 AI 助手组件
-->
<template>
  <div class="app-container">
    <!-- 使用 MainLayout 包裹所有页面（除了登录页） -->
    <MainLayout v-if="!isLoginPage">
      <RouterView />
    </MainLayout>

    <!-- 登录页独立渲染（不需要导航） -->
    <RouterView v-else />

    <!-- 全局页脚 -->
    <AppFooter v-if="!isLoginPage" />

    <!-- 全局 AI 助手 -->
    <AiAssistant />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import MainLayout from './components/MainLayout.vue'
import AiAssistant from './components/AiAssistant.vue'
import AppFooter from './components/AppFooter.vue'
import { useThemeStore } from './stores/theme'

// 初始化主题（从 localStorage 读取并同步到 documentElement）
useThemeStore()

const route = useRoute()

// 判断是否为登录页（登录页不需要导航和布局）
const isLoginPage = computed(() => route.path === '/login')
</script>

<style>
/* 全局重置样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu,
    Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: transparent;
}
</style>
