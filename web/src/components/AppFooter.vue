<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const isHidden = computed(() => {
  return route.path === '/login'
})

const openFaq = () => {
  window.alert('FAQ 将在后续版本上线')
}

const openSupport = () => {
  window.alert('客服入口将接入在线咨询')
}
</script>

<template>
  <footer v-if="!isHidden" class="app-footer">
    <div class="footer-inner">
      <div class="footer-links">
        <button class="link" type="button" @click="openFaq">常见问题</button>
        <button class="link" type="button" @click="openSupport">在线客服</button>
      </div>
      <div class="copyright">© 2026 职业规划平台 版权所有</div>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  width: 100%;
  background: var(--clay-bg);
  border-top: 1px solid var(--clay-border-subtle);
}

.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 8px;
}

.link {
  border: none;
  background: transparent;
  padding: 6px 12px;
  border-radius: var(--clay-radius-pill);
  cursor: pointer;
  color: var(--clay-text-subtle);
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.link:hover {
  background: var(--clay-border-subtle);
  color: var(--clay-text);
  transform: translateY(-1px);
}

.copyright {
  color: var(--clay-text-subtle);
}

@media (max-width: 768px) {
  .footer-inner {
    padding: 14px 16px;
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
