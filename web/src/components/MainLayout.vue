<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Compass, GitCompareArrows, LayoutDashboard, ListChecks } from 'lucide-vue-next'
import MainNavbar from './MainNavbar.vue'
import NavigationMagneticCursor from './NavigationMagneticCursor.vue'
import { primaryNavItems, getActivePrimaryNav } from '@/config/navigation'
import { vMagnetic } from '@/design-system/directives/magnetic'

defineOptions({ name: 'MainLayout' })

const route = useRoute()
const activeNav = computed(() => getActivePrimaryNav(route.path))

const navIcons = {
  'layout-dashboard': LayoutDashboard,
  compass: Compass,
  'git-compare': GitCompareArrows,
  'list-checks': ListChecks
}
</script>

<template>
  <div class="main-layout">
    <MainNavbar />

    <M3NavigationRail class="navigation-rail" aria-label="主要导航">
      <router-link
        v-for="item in primaryNavItems"
        v-magnetic="{ group: 'primary-navigation' }"
        :key="item.id"
        :to="item.path"
        class="rail-destination"
        :class="{ active: activeNav === item.id }"
        :aria-current="activeNav === item.id ? 'page' : undefined"
      >
        <span class="rail-indicator">
          <component :is="navIcons[item.icon]" :size="22" aria-hidden="true" />
        </span>
        <span class="rail-label">{{ item.label }}</span>
      </router-link>
    </M3NavigationRail>

    <main class="main-content">
      <slot />
    </main>

    <M3NavigationBar class="navigation-bar" aria-label="主要导航">
      <router-link
        v-for="item in primaryNavItems"
        v-magnetic="{ group: 'primary-navigation' }"
        :key="item.id"
        :to="item.path"
        class="bar-destination"
        :class="{ active: activeNav === item.id }"
        :aria-current="activeNav === item.id ? 'page' : undefined"
      >
        <span class="bar-indicator">
          <component :is="navIcons[item.icon]" :size="22" aria-hidden="true" />
        </span>
        <span>{{ item.shortLabel }}</span>
      </router-link>
    </M3NavigationBar>

    <NavigationMagneticCursor target-group="primary-navigation" :reset-key="route.fullPath" />
  </div>
</template>

<style scoped>
.main-layout {
  --career-navigation-width: 220px;
  min-height: 100vh;
  background: color-mix(in srgb, var(--md-sys-color-surface) var(--career-background-canvas-tint-opacity), transparent);
}

.main-content {
  min-height: 100vh;
  margin-left: var(--career-navigation-width);
  padding-top: 64px;
}

.navigation-rail {
  position: fixed;
  z-index: 90;
  top: 64px;
  bottom: 0;
  left: 0;
  display: flex;
  width: var(--career-navigation-width);
  flex-direction: column;
  gap: 4px;
  border-right: 1px solid var(--md-sys-color-outline-variant);
  padding: 16px 12px;
  background: color-mix(in srgb, var(--md-sys-color-surface-container-low) 94%, transparent);
  backdrop-filter: blur(16px);
}

.rail-destination {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  min-height: 56px;
  align-items: center;
  border-radius: var(--md-sys-shape-corner-full);
  padding: 0 12px 0 4px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: 500;
  line-height: var(--md-sys-typescale-label-large-line-height);
  text-decoration: none;
  transition: background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard), color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

.rail-destination:hover,
.rail-destination[data-magnetic-active='true'] { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
.rail-destination.active { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.rail-indicator { display: grid; width: 56px; height: 40px; place-items: center; border-radius: var(--md-sys-shape-corner-full); }
.navigation-bar { display: none; }

.rail-destination > *, .bar-destination > * { pointer-events: none; }

@media (min-width: 600px) and (max-width: 839px) {
  .main-layout { --career-navigation-width: 80px; }
  .navigation-rail { align-items: center; width: 80px; padding: 12px 8px; }
  .rail-destination { display: flex; width: 64px; min-height: 64px; align-items: center; justify-content: center; flex-direction: column; gap: 2px; border-radius: var(--md-sys-shape-corner-medium); padding: 4px 0; font-size: var(--md-sys-typescale-label-small-size); }
  .rail-indicator { width: 56px; height: 32px; }
  .rail-destination.active { background: transparent; color: var(--md-sys-color-on-surface); }
  .rail-destination.active .rail-indicator { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
}

@media (max-width: 599px) {
  .main-layout { --career-navigation-width: 0px; }
  .navigation-rail { display: none; }
  .main-content { min-height: calc(100vh - 80px); margin-left: 0; padding-top: 64px; padding-bottom: 80px; }
  .navigation-bar {
    position: fixed;
    z-index: 100;
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    min-height: 80px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    padding: 8px max(4px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(4px, env(safe-area-inset-left));
    background: color-mix(in srgb, var(--md-sys-color-surface-container) 96%, transparent);
    backdrop-filter: blur(16px);
  }
  .bar-destination { display: flex; min-width: 0; align-items: center; justify-content: center; flex-direction: column; gap: 2px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-medium-size); font-weight: 500; line-height: var(--md-sys-typescale-label-medium-line-height); text-decoration: none; }
  .bar-indicator { display: grid; width: 64px; height: 32px; place-items: center; border-radius: var(--md-sys-shape-corner-full); }
  .bar-destination.active { color: var(--md-sys-color-on-surface); }
  .bar-destination.active .bar-indicator { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
}

</style>
