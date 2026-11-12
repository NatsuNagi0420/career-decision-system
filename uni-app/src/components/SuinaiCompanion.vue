<!-- 青穗集 · 穗奈陪伴区：沿用原角色，依据已有状态提示，点击互动只在本地切换。 -->
<template>
  <view
    class="suinai-companion"
    :class="collapsed ? 'suinai-companion--compact' : ''"
  >
    <template v-if="collapsed">
      <button
        :id="buttonRippleId(1)"
        :style="buttonRippleStyle(1)"
        @touchstart="startButtonRipple($event, 1)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="companion-compact qs-tap-target"
        aria-label="展开穗奈陪伴区"
        @click="startButtonRipple($event, 1); emit('toggle')"
      >
        <image
          class="companion-avatar"
          :src="assetPaths.characters.suinaiAvatar"
          mode="aspectFit"
        />
        <text class="companion-compact-copy">我在，随时继续聊。</text>
        <view class="companion-expand" />
      </button>
    </template>
    <template v-else>
      <view class="companion-pixels" aria-hidden="true"
        ><view class="companion-pixel" /><view
          class="companion-pixel companion-pixel--offset" /><view
          class="companion-pixel"
      /></view>
      <view class="companion-copy">
        <text class="companion-title">慢慢来，我陪你。</text>
        <text class="companion-message" aria-live="polite">{{
          reaction || message
        }}</text>
        <button
          :id="buttonRippleId(2)"
          :style="buttonRippleStyle(2)"
          @touchstart="startButtonRipple($event, 2, undefined, loading)"
          hover-class="button-hover"
          hover-stop-propagation
          :hover-start-time="0"
          :hover-stay-time="110"
          class="companion-resume qs-tap-target"
          :disabled="loading"
          @click="startButtonRipple($event, 2, undefined, loading); emit('continue')"
        >
          <text class="companion-resume-text">{{
            loading
              ? "正在同步对话…"
              : conversationTitle
                ? "继续聊 · " + conversationTitle
                : "从一件小事聊起"
          }}</text>
          <text class="companion-resume-arrow">↗</text>
        </button>
      </view>
      <button
        :id="buttonRippleId(3)"
        :style="buttonRippleStyle(3)"
        @touchstart="startButtonRipple($event, 3)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="companion-portrait qs-tap-target"
        aria-label="和穗奈打个招呼"
        @click="startButtonRipple($event, 3); greet()"
      >
        <view class="companion-halo" />
        <image
          class="companion-character"
          :src="
            reaction || thinking
              ? assetPaths.characters.suinaiThink
              : assetPaths.characters.suinaiWave
          "
          mode="aspectFit"
        />
      </button>
      <button
        :id="buttonRippleId(4)"
        :style="buttonRippleStyle(4)"
        @touchstart="startButtonRipple($event, 4)"
        hover-class="button-hover"
        hover-stop-propagation
        :hover-start-time="0"
        :hover-stay-time="110"
        class="companion-fold qs-tap-target"
        aria-label="收起穗奈陪伴区"
        @click="startButtonRipple($event, 4); emit('toggle')"
      >
        <view class="companion-fold-line" />
      </button>
    </template>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { onUnmounted, ref } from "vue";
import { assetPaths } from "../static/assets";
defineProps<{
  message: string;
  conversationTitle?: string;
  collapsed: boolean;
  thinking?: boolean;
  loading?: boolean;
}>();
const emit = defineEmits<{ (e: "toggle"): void; (e: "continue"): void }>();
const reaction = ref("");
const greetings = [
  "我在听。想到什么，就慢慢说。",
  "做过的小事，也可能是值得记录的经历。",
  "不用一次想清楚，我们先走一小步。",
];
let index = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
function greet() {
  clearTimeout(timer);
  reaction.value = greetings[index++ % greetings.length];
  timer = setTimeout(() => {
    reaction.value = "";
  }, 3800);
}
onUnmounted(() => clearTimeout(timer));
</script>
<style lang="scss">
.suinai-companion {
  position: relative;
  min-height: 268rpx;
  overflow: hidden;
  border: 1rpx solid #a28ab7;
  border-radius: 28rpx;
  background: linear-gradient(120deg, #77618f, #9a82af);
  margin-bottom: 18rpx;
}
.companion-copy {
  position: relative;
  z-index: 2;
  width: 67%;
  padding: 30rpx 0 28rpx 28rpx;
}
.companion-title {
  display: block;
  color: #fff9ff;
  font-size: 33rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  line-height: 1.5;
}
.companion-message {
  display: block;
  min-height: 72rpx;
  padding-right: 5rpx;
  margin: 10rpx 0 20rpx;
  color: #f0e6f7;
  font-size: 24rpx;
  line-height: 1.65;
}
.companion-resume {
  display: flex;
  align-items: center;
  gap: 10rpx;
  width: 100%;
  min-height: 58rpx;
  margin: 0;
  padding: 12rpx 17rpx;
  text-align: left;
  background: #fff9ff;
  color: #68507e;
  border: 1rpx solid #f8ecff;
  border-radius: 14rpx;
  font-size: 23rpx;
  line-height: 1.4;
}
.companion-resume-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.companion-resume-arrow {
  flex: none;
  font-size: 27rpx;
}
.companion-portrait {
  position: absolute;
  z-index: 1;
  right: -18rpx;
  bottom: -6rpx;
  width: 248rpx;
  height: 260rpx;
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: visible;
}
.companion-character {
  position: absolute;
  width: 246rpx;
  height: 260rpx;
  bottom: -5rpx;
  right: 0;
}
.companion-halo {
  position: absolute;
  width: 204rpx;
  height: 204rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  right: 0;
  bottom: 8rpx;
  background: rgba(255, 255, 255, 0.08);
}
.companion-fold {
  position: absolute;
  z-index: 3;
  right: 8rpx;
  top: 6rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 64rpx;
  height: 64rpx;
  padding: 0;
  margin: 0;
  background: transparent;
}
.companion-fold-line {
  width: 19rpx;
  height: 2rpx;
  background: #fff3ff;
}
.companion-pixels {
  position: absolute;
  right: 42rpx;
  top: 40rpx;
  display: flex;
  gap: 12rpx;
  transform: rotate(-10deg);
}
.companion-pixel {
  width: 10rpx;
  height: 10rpx;
  background: rgba(250, 238, 255, 0.36);
}
.companion-pixel--offset {
  margin-top: 16rpx;
}
.suinai-companion--compact {
  min-height: 0;
  background: #f0e9f7;
  border-color: #e5dcec;
}
.companion-compact {
  display: flex;
  align-items: center;
  gap: 16rpx;
  width: 100%;
  padding: 13rpx 22rpx;
  margin: 0;
  background: transparent;
  text-align: left;
}
.companion-avatar {
  width: 56rpx;
  height: 60rpx;
  flex: none;
}
.companion-compact-copy {
  flex: 1;
  font-size: 25rpx;
  color: #77618f;
}
.companion-expand {
  width: 12rpx;
  height: 12rpx;
  border-right: 2rpx solid #9b87af;
  border-bottom: 2rpx solid #9b87af;
  transform: rotate(45deg);
  margin-right: 8rpx;
}
</style>
