/** 青穗集 · 小程序应用入口：保留轻量启动生命周期，业务状态由页面和后端负责。 */
<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
onLaunch(() => { console.info("QINGSUI mini program launched"); });
</script>
<style lang="scss">
@import "./uni.scss";
page { background: $qingsui-bg; color: $qingsui-ink; font-family: $qingsui-font; }
button { font-family: $qingsui-font; }
</style>
