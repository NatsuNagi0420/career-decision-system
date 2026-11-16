<!-- 青穗集 · 职业流程按钮：复用像素控件、触点涟漪与无障碍名称。 -->
<template>
  <button :id="buttonRippleId(1)" :style="buttonRippleStyle(1)" class="qs-button qs-tap-target career-button" :class="primary ? 'qs-button--primary' : ''" :disabled="disabled" :aria-label="label" hover-class="button-hover" hover-stop-propagation :hover-start-time="0" :hover-stay-time="110" @touchstart="startButtonRipple($event, 1, undefined, disabled)" @click="press"><slot /></button>
</template>
<script setup lang="ts">
import { useButtonRipple } from "../services/button-ripple";
const props = defineProps<{ primary?: boolean; disabled?: boolean; label?: string }>();
const emit = defineEmits<{ (event: "click"): void }>();
const { buttonRippleId, buttonRippleStyle, startButtonRipple } = useButtonRipple();
function press(event: unknown) { if (props.disabled) return; startButtonRipple(event, 1); emit("click"); }
</script>
<style lang="scss">
.career-button { width:100%; min-height:78rpx; margin:0; font-size:25rpx; line-height:1.5; }
</style>
