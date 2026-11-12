<!-- 青穗集 · 消息安全排版：只生成受控文本标签，原始 HTML 始终转义。 -->
<template>
  <view class="rich-message">
    <rich-text :nodes="html" :user-select="true" />
    <view
      hover-class="qs-pressed"
      :hover-start-time="0"
      :hover-stay-time="110"
      v-for="link in links"
      :key="link.url"
      class="message-link qs-press"
      @click="copyLink(link.url)"
    >
      {{ link.label }} ↗
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ content: string }>();
function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function inline(value: string) {
  return escape(value)
    .replace(
      /`([^`]+)`/g,
      '<code style="background:rgba(128,101,175,.1);padding:1px 3px;border-radius:3px;">$1</code>',
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1");
}
const html = computed(() => {
  let code = false;
  return (
    props.content
      .split("\n")
      .map((line) => {
        if (line.startsWith("```")) {
          code = !code;
          return code
            ? '<div style="font-family:monospace;background:rgba(128,101,175,.08);padding:10px;white-space:pre-wrap;">'
            : "</div>";
        }
        if (code) return escape(line) + "<br/>";
        if (/^#{1,4}\s/.test(line))
          return `<div style="font-weight:600;margin:12px 0 6px;">${inline(line.replace(/^#{1,4}\s/, ""))}</div>`;
        if (/^[-*]\s/.test(line))
          return `<div style="padding-left:8px;margin:4px 0;">• ${inline(line.slice(2))}</div>`;
        return line
          ? `<div style="min-height:1em;">${inline(line)}</div>`
          : '<div style="height:8px;"></div>';
      })
      .join("") + (code ? "</div>" : "")
  );
});
const links = computed(() =>
  Array.from(props.content.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g))
    .map((match) => ({ label: match[1], url: match[2] }))
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.url === item.url) === index,
    ),
);
function copyLink(url: string) {
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: "链接已复制", icon: "none" }),
  });
}
</script>
<style lang="scss">
.rich-message {
  font-size: var(--qs-chat-size, 28rpx);
  line-height: 1.85;
  word-break: break-word;
}
.message-link {
  font-size: 24rpx;
  color: #8064af;
  border-top: 1rpx solid var(--qs-lilac);
  padding-top: 12rpx;
  margin-top: 14rpx;
  word-break: break-all;
}
</style>
