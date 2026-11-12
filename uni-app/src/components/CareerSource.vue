<!-- 青穗集 · 职业资料来源选择器：不隐式合并电脑与云端的数据。 -->
<template>
  <picker
    :range="options.map((item) => item.name)"
    :value="index"
    @change="change"
  >
    <view hover-class="qs-pressed" :hover-start-time="0" :hover-stay-time="110" class="qs-source-select qs-press">
      {{ options[index]?.name || "云端资料" }}
      <text>⌄</text>
    </view>
  </picker>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { hubApi, type HubDevice } from "../services/api";
import { careerSource, setCareerSource } from "../services/career-context";
const emit = defineEmits<{ (e: "change", source: string): void }>();
const devices = ref<HubDevice[]>([]);
const source = ref(careerSource());
const options = computed(() => [
  { id: "cloud", name: "云端资料" },
  ...devices.value
    .filter((d) => d.status === "active")
    .map((d) => ({ id: d.id, name: `${d.name} · 已同步资料` })),
]);
const index = computed(() =>
  Math.max(
    0,
    options.value.findIndex((o) => o.id === source.value),
  ),
);
onMounted(async () => {
  try {
    devices.value = await hubApi.devices();
    if (!options.value.some((o) => o.id === source.value)) {
      source.value = "cloud";
      setCareerSource("cloud");
      emit("change", "cloud");
    }
  } catch {
    /* 保留当前来源，不切换到其他设备数据。 */
  }
});
function change(event: unknown) {
  const selected =
    options.value[
      Number((event as { detail: { value: string } }).detail.value)
    ];
  if (!selected) return;
  source.value = selected.id;
  setCareerSource(selected.id);
  emit("change", selected.id);
}
</script>
