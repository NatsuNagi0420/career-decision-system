<!-- 青穗集 · 应用入口：界面、正文和输入统一像素字体，代码与简历纸张保留各自的排版。 -->
<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
onLaunch(() => {
  /* 启动逻辑保持轻量，业务状态由页面和后端负责 */
});
</script>
<style lang="scss">
@import "./styles/base.scss";
@import "./styles/motion.scss";
page {
  color: $qingsui-ink;
  font-family: $qingsui-font;
  font-weight: 400;
  font-synthesis: none;
  font-size: $qs-type-body;
  line-height: 1.65;
}
button {
  font-family: $qingsui-font-ui;
  font-weight: 400;
  font-synthesis: none;
}
input,
textarea {
  font-family: $qingsui-font;
}
</style>
