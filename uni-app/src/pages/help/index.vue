<!-- 青穗集 · 帮助与反馈：说明真实执行边界，反馈通过用户主动复制提交。 -->
<template>
  <view :class="pageMotionClass" class="qs-page">
    <view
      v-for="(item, index) in questions"
      :key="item.title"
      class="help-item qs-card qs-motion-block"
    >
      <button :id="buttonRippleId(1, [item.title])" :style="buttonRippleStyle(1, [item.title])" @touchstart="startButtonRipple($event, 1, [item.title])" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" class="qs-tap-target" @click="startButtonRipple($event, 1, [item.title]); expanded = expanded === index ? -1 : index">
        <text>{{ item.title }}</text>
        <text
          class="qs-disclosure-chevron"
          :class="expanded === index ? 'qs-disclosure-chevron--open' : ''"
        >
          ⌄
        </text>
      </button>
      <text v-if="expanded === index" class="help-answer qs-reveal">
        {{ item.answer }}
      </text>
    </view>
    <text class="qs-section-title">整理反馈</text>
    <textarea
      v-model="feedback"
      class="feedback-input"
      maxlength="3000"
      placeholder="描述遇到的问题、出现在哪个页面，以及希望怎样改进…"
    />
    <button
      :id="buttonRippleId(2)"
      :style="buttonRippleStyle(2)"
      @touchstart="startButtonRipple($event, 2, undefined, !feedback.trim())"
      hover-class="button-hover"
      hover-stop-propagation
      :hover-start-time="0"
      :hover-stay-time="110"
      class="qs-button qs-button--primary qs-bottom-action qs-tap-target"
      :disabled="!feedback.trim()"
      @click="startButtonRipple($event, 2, undefined, !feedback.trim()); copy()"
    >
      复制反馈内容
    </button>
    <text class="qs-inline-note">
      复制后可发给项目维护者。这里不会自动上传你的对话或设备日志。
    </text>
  </view>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../../services/button-ripple";
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
import { usePageMotion } from "../../services/page-motion";
import { ref } from "vue";
const pageMotionClass = usePageMotion();
const expanded = ref(0),
  feedback = ref("");
const questions = [
  {
    title: "手机、电脑和云端怎样配合？",
    answer:
      "登录同一官方账号，在电脑端打开“设备与同步”，再用小程序扫码绑定。同步会话需要电脑允许同步。手机可以继续电脑会话，也可以使用独立云端会话。",
  },
  {
    title: "电脑离线后，任务会怎样？",
    answer:
      "发给电脑的任务会等待电脑上线并允许远程执行。任务仍在原电脑执行，不会自动转移到云端。",
  },
  {
    title: "手机能使用哪些电脑权限？",
    answer:
      "只能使用电脑已经授权的项目、模型和读写范围。已有会话保留原来的项目与模型，完全访问需要在电脑端确认。",
  },
  {
    title: "职业画像会自动确认吗？",
    answer:
      "穗奈整理的建议需要你确认后才能作为事实使用。电脑和云端资料按来源显示，不静默合并矛盾信息。",
  },
  {
    title: "怎样查看文件和简历？",
    answer:
      "点击对话或任务里的文件名进入预览。文档可以调用微信系统预览，并通过文档菜单保存；不支持直接预览的格式可以下载后打开。",
  },
];
function copy() {
  uni.setClipboardData({
    data: feedback.value.trim(),
    success: () => uni.showToast({ title: "反馈已复制", icon: "none" }),
  });
}
</script>
<style lang="scss">
.help-item {
  padding: 18rpx 25rpx;
  margin-bottom: 20rpx;
}
.help-item > button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  font-size: 27rpx;
  text-align: left;
  background: transparent;
  line-height: 1.7;
  padding: 12rpx 0;
  color: var(--qs-ink);
}
.help-answer {
  display: block;
  margin: 15rpx 0;
  font-size: 26rpx;
  line-height: 1.9;
  color: var(--qs-muted);
}
.feedback-input {
  width: 100%;
  min-height: 240rpx;
  box-sizing: border-box;
  border: 1rpx solid var(--qs-lilac);
  border-radius: 18rpx;
  padding: 24rpx;
  background: var(--qs-paper);
  font-size: 26rpx;
  line-height: 1.8;
}
</style>
