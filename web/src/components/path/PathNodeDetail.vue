<!--
  组件：路径节点详情
  职责：展示选中节点的详细信息和转换路径
-->
<script setup lang="ts">
import { Info } from 'lucide-vue-next'

interface Props {
  selectedNode: Record<string, unknown> | null
  selectedLink: Record<string, unknown> | null
}

defineProps<Props>()
</script>

<template>
  <section class="node-detail clay-card" v-if="selectedNode">
    <div class="panel-title">
      <Info :size="18" />
      <span>岗位详情</span>
    </div>
    <div class="node-info">
      <div class="node-name">{{ selectedNode.name }}</div>
      <el-tag
        :type="
          selectedNode.type === 'current'
            ? 'success'
            : selectedNode.type === 'target'
              ? 'warning'
              : 'info'
        "
        size="small"
      >
        {{
          selectedNode.type === 'current'
            ? '当前'
            : selectedNode.type === 'target'
              ? '目标'
              : '备选'
        }}
      </el-tag>
    </div>

    <div v-if="selectedLink" class="transition-info">
      <div class="mini-title">晋升/转换路径</div>
      <div class="info-item">
        <span class="label">预计耗时:</span>
        <span class="val">{{ selectedLink.label }}</span>
      </div>
      <div class="mini-title">建议补全技能</div>
      <div class="skill-tags">
        <el-tag
          v-for="s in selectedLink.skills"
          :key="s"
          effect="plain"
          size="small"
        >
          {{ s }}
        </el-tag>
      </div>
    </div>
  </section>
</template>

<style scoped>
.node-detail {
  padding: 20px;
}

.clay-card {
  background: var(--clay-surface);
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  margin-bottom: 16px;
  color: var(--clay-text);
  font-size: 15px;
}

.node-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.node-name {
  font-size: 18px;
  font-weight: 800;
  color: var(--clay-text);
}

.mini-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--clay-text-subtle);
  margin: 16px 0 8px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.info-item .label {
  color: #94a3b8;
}

.info-item .val {
  color: var(--clay-text);
  font-weight: 600;
}

.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
