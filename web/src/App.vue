<template>
  <div class="app-container">
    <div
      v-if="themeStore.backgroundEnabled"
      class="app-background"
      :style="themeStore.backgroundStyle"
      aria-hidden="true"
    >
      <div class="app-background__scrim"></div>
    </div>
    <div class="app-content">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <MainLayout v-if="!isStandalonePage">
          <Transition name="m3-page" mode="out-in">
            <component :is="Component" :key="viewRoute.name || viewRoute.path" />
          </Transition>
        </MainLayout>
        <Transition v-else name="m3-page" mode="out-in">
          <component :is="Component" :key="viewRoute.name || viewRoute.path" />
        </Transition>
      </RouterView>
    </div>
    <AiAssistant v-if="!isStandalonePage" />
    <M3SnackbarHost />
    <M3ConfirmHost />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import MainLayout from './components/MainLayout.vue'
import AiAssistant from './components/AiAssistant.vue'
import { M3ConfirmHost, M3SnackbarHost } from './design-system/components'
import { useThemeStore } from './stores/theme'

const themeStore = useThemeStore()

const route = useRoute()
const isStandalonePage = computed(() => ['/login', '/onboarding'].includes(route.path))
</script>
