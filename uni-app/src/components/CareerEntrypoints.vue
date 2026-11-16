<!-- 青穗集 · 成长工具入口：沿用现有图标和卡片，将新增能力放在成长页内。 -->
<template>
  <view class="career-entries qs-motion-block">
    <button v-for="item in entries" :key="item.path" class="career-entry qs-card qs-press" hover-class="qs-pressed" @click="open(item.path)"><image class="career-entry-icon" :src="item.icon" /><text>{{ item.title }}</text><text class="qs-chevron">›</text></button>
  </view>
</template>
<script setup lang="ts">
import { assetPaths } from "../static/assets";
import { setCareerSource } from "../services/career-context";
const props = defineProps<{ source: string }>();
const entries = [
  { title: "学习路线", path: "learning", icon: assetPaths.prototype.books },
  { title: "练习与面试", path: "preparation", icon: assetPaths.prototype.navChat },
  { title: "求职任务", path: "career-task", icon: assetPaths.prototype.resume },
  { title: "本周回顾", path: "weekly", icon: assetPaths.prototype.navGrowth },
];
function open(path: string) { setCareerSource(props.source); uni.navigateTo({ url: `/pages/${path}/index` }); }
</script>
<style lang="scss">
.career-entries { display:grid; grid-template-columns:1fr 1fr; gap:16rpx; margin:24rpx 0; }
.career-entry { display:flex; align-items:center; gap:12rpx; margin:0; padding:24rpx 18rpx; color:var(--qs-ink); font-size:25rpx; line-height:1.5; }
.career-entry-icon { width:38rpx; height:38rpx; flex-shrink:0; }
.career-entry .qs-chevron { margin-left:auto; }
</style>
