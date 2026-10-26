/** 青穗集 · 小程序首页：用清晰的主次入口把对话、画像和成长路线串起来。 */
<template>
  <view class="qs-page home-page qs-stagger">
    <view class="home-topline">
      <view>
        <text class="qs-eyebrow">QINGSUI / CAREER GROWTH</text>
        <text class="home-greeting">你好，今天也慢慢来。</text>
      </view>
    </view>

    <view class="home-hero qs-card">
      <image class="hero-scene" :src="assets.characters.deskComputerScene" mode="aspectFill" />
      <view class="hero-wash" />
      <view class="hero-copy">
        <text class="qs-eyebrow">穗奈在这里</text>
        <text class="qs-title">把迷茫，变成下一步。</text>
        <text class="qs-subtitle">不用先填表。说说你最近在想什么，穗奈会陪你把经历、方向和目标慢慢整理出来。</text>
        <button class="qs-button qs-button--primary hero-action qs-ripple" @click="openChat">
          <image :src="assets.icons.chat" mode="aspectFit" />
          <text>开始聊聊</text>
        </button>
      </view>
      <image class="hero-avatar qs-avatar-float" :src="assets.characters.suinaiWave" mode="aspectFit" />
    </view>

    <view class="section-heading"><text>从一件小事开始</text></view>
    <view class="entry-stack qs-stagger">
      <button class="entry-card entry-card--primary qs-card qs-ripple" @click="openChat">
        <view class="entry-icon entry-icon--large"><image :src="assets.icons.chat" mode="aspectFit" /></view>
        <view class="entry-copy"><text class="entry-title">聊聊现在</text><text class="entry-desc">说出最近的困惑，穗奈会帮你整理出下一步</text></view>
        <image class="entry-arrow" :src="assets.icons.forward" mode="aspectFit" />
      </button>
      <view class="entry-secondary-row">
        <button class="entry-card entry-card--secondary qs-card qs-ripple" @click="switchTab('/pages/profile/index')">
          <view class="entry-icon"><image :src="assets.icons.resourcesPanel" mode="aspectFit" /></view>
          <text class="entry-title">看看画像</text>
          <text class="entry-desc">确认穗奈记住了什么</text>
        </button>
        <button class="entry-card entry-card--secondary qs-card qs-ripple" @click="switchTab('/pages/growth/index')">
          <view class="entry-icon"><image :src="assets.icons.growth" mode="aspectFit" /></view>
          <text class="entry-title">找到下一步</text>
          <text class="entry-desc">岗位、能力和行动计划</text>
        </button>
      </view>
    </view>

    <view class="home-note qs-card">
      <image :src="assets.icons.sprout" mode="aspectFit" />
      <text>真实经历由你确认，穗奈不会把猜测当成事实。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { assetPaths } from "../../static/assets";
const assets = assetPaths;
function openChat() { uni.switchTab({ url: "/pages/chat/index" }); }
function switchTab(url: string) { uni.switchTab({ url }); }
</script>

<style lang="scss">
.home-topline { display: flex; align-items: flex-start; }
.home-greeting { display: block; margin-top: 12rpx; color: $qingsui-ink; font-size: 29rpx; }

.home-hero { position: relative; min-height: 510rpx; margin-top: 26rpx; padding: 38rpx 32rpx; overflow: hidden; }
.hero-scene, .hero-wash { position: absolute; inset: 0; width: 100%; height: 100%; }
.hero-scene { opacity: .23; filter: saturate(.8); }
.hero-wash { background: linear-gradient(90deg, rgba(255,250,255,.99) 0%, rgba(255,250,255,.91) 52%, rgba(255,250,255,.2) 100%); }
.hero-copy { position: relative; z-index: 1; width: 62%; }
.hero-copy .qs-title { display: block; font-size: 42rpx; line-height: 1.34; }
.hero-copy .qs-subtitle { max-width: 440rpx; margin-top: 12rpx; font-size: 22rpx; line-height: 1.65; }
.hero-action { display: flex; gap: 10rpx; width: 250rpx; min-height: 72rpx; margin: 30rpx 0 0; font-size: 23rpx; }
.hero-action image { width: 30rpx; height: 30rpx; filter: brightness(0) invert(1); }
.hero-avatar { position: absolute; z-index: 1; right: -24rpx; bottom: -42rpx; width: 382rpx; height: 450rpx; opacity: .96; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; margin: 32rpx 4rpx 16rpx; color: $qingsui-ink; font-size: 29rpx; }
.section-meta { color: $qingsui-faint; font-size: 20rpx; }
.entry-stack { display: flex; flex-direction: column; gap: 16rpx; }
.entry-secondary-row { display: flex; gap: 16rpx; }
.entry-card { color: $qingsui-ink; text-align: left; }
.entry-card--primary { display: flex; align-items: center; min-height: 142rpx; padding: 24rpx; }
.entry-card--secondary { display: flex; flex: 1; flex-direction: column; align-items: flex-start; min-height: 184rpx; padding: 22rpx; }
.entry-icon { display: flex; align-items: center; justify-content: center; width: 58rpx; height: 58rpx; flex: none; border-radius: 17rpx; background: $qingsui-primary-soft; }
.entry-icon--large { width: 70rpx; height: 70rpx; border-radius: 20rpx; }
.entry-icon image { width: 40rpx; height: 40rpx; }
.entry-icon--large image { width: 48rpx; height: 48rpx; }
.entry-copy { min-width: 0; margin-left: 18rpx; }
.entry-title { display: block; color: $qingsui-ink; font-size: 26rpx; }
.entry-desc { display: block; margin-top: 9rpx; color: $qingsui-muted; font-size: 19rpx; line-height: 1.5; }
.entry-card--primary .entry-desc { max-width: 390rpx; }
.entry-card--secondary .entry-title { margin-top: 19rpx; }
.entry-card--secondary .entry-desc { min-height: 54rpx; }
.entry-arrow { width: 32rpx; height: 32rpx; margin-left: auto; }
.home-note { display: flex; align-items: center; gap: 12rpx; margin-top: 22rpx; padding: 18rpx 20rpx; color: $qingsui-muted; font-size: 19rpx; line-height: 1.55; }
.home-note image { flex: none; width: 32rpx; height: 32rpx; }
</style>
