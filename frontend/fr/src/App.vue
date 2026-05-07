<!--
  组件：应用根组件 App。
  职责：挂载全局路由视图、页脚与全局 AI 助手组件，作为前端单页应用的根容器。
-->
<template>
  <div class="app-container">
    <div class="app-content">
      <RouterView />
    </div>
    <AppFooter />
    <AiAssistant />
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import AiAssistant from './components/AiAssistant.vue'
import AppFooter from './components/AppFooter.vue'
import { useThemeStore } from './stores/theme'

// 初始化主题（从 localStorage 读取并同步到 documentElement）
useThemeStore()
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
</style>
