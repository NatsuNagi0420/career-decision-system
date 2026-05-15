<!--
  页面：能力画像页（/capability-profile）。
  职责：基于信息录入与深度问卷数据调用大模型生成能力画像，
        并通过图表展示能力雷达、竞争力评分和推荐岗位等结果。
-->
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCapabilityGeneration } from '@/composables/useCapabilityGeneration'
import CapabilityHeader from '@/components/capability/CapabilityHeader.vue'
import CapabilityLoadingOverlay from '@/components/capability/CapabilityLoadingOverlay.vue'
import CapabilityRadarChart from '@/components/capability/CapabilityRadarChart.vue'
import CapabilityMatchChart from '@/components/capability/CapabilityMatchChart.vue'
import CapabilityTraits from '@/components/capability/CapabilityTraits.vue'
import CapabilityJobRecommendation from '@/components/capability/CapabilityJobRecommendation.vue'
import CapabilitySuggestions from '@/components/capability/CapabilitySuggestions.vue'

const router = useRouter()
const { loadingState, profile, initializeGeneration } = useCapabilityGeneration()

// 推荐岗位（取前3个）
const recommendedJobs = computed(() => {
  return (profile.value?.recommendedJobs ?? []).slice(0, 3)
})

// 匹配度分数
const matchScores = computed(() => {
  const fromApi = profile.value?.matchScores
  if (Array.isArray(fromApi) && fromApi.length >= recommendedJobs.value.length) {
    return fromApi.slice(0, recommendedJobs.value.length)
  }
  const base = 92
  return recommendedJobs.value.map((_job, idx) => Math.max(60, base - idx * 7))
})

// 主推荐岗位
const primaryRecommended = computed(() => {
  const p = profile.value
  if (!p) return null
  const titles = Array.isArray((p as Record<string, unknown>).recommendedJobTitles)
    ? (p as Record<string, unknown>).recommendedJobTitles as string[]
    : []
  const jobs = Array.isArray(p.recommendedJobs) ? p.recommendedJobs : []
  const title = titles.length > 0 ? titles[0] : jobs[0]?.jobName
  const job = jobs[0]
  if (!title || !job) return null
  return { title, job }
})

// 处理跳转到岗位探索
const handleExplore = (jobIds: string) => {
  router.push({
    path: '/job-exploration',
    query: {
      preferred: jobIds || (profile.value?.recommendedJobs ?? [])
        .map(j => j.id)
        .join(',')
    }
  })
}

onMounted(async () => {
  await initializeGeneration()
})
</script>

<template>
  <div class="profile-page clay-page">
    <!-- 加载进度提示 -->
    <CapabilityLoadingOverlay
      :loading="loadingState.isLoading"
      :step="loadingState.step"
      :total="loadingState.total"
      :summary="loadingState.summary"
    />

    <div class="profile-container">
      <!-- 顶部标题 -->
      <CapabilityHeader />

      <el-row :gutter="24">
        <!-- 左侧：图表分析 -->
        <el-col :span="14">
          <CapabilityRadarChart
            :indicators="profile?.radar?.indicators"
            :values="profile?.radar?.values"
            class="mb-6"
          />
          <CapabilityMatchChart
            :jobs="recommendedJobs"
            :scores="matchScores"
          />
        </el-col>

        <!-- 右侧：推荐与建议 -->
        <el-col :span="10">
          <!-- 核心特质 -->
          <CapabilityTraits
            :tags="profile?.tags ?? []"
            :description="profile?.suggestions?.shortTerm"
            class="mb-6"
          />

          <!-- 推荐岗位 -->
          <CapabilityJobRecommendation
            :job="primaryRecommended?.job"
            :title="primaryRecommended?.title"
            :match-score="matchScores[0]"
            @explore="handleExplore"
          />
        </el-col>
      </el-row>

      <!-- 发展建议 -->
      <CapabilitySuggestions
        :short-term="profile?.suggestions?.shortTerm"
        :long-term="profile?.suggestions?.longTerm"
      />
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  min-height: 100vh;
  background-color: transparent;
}

.profile-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 104px 24px 60px;
}

.mb-6 {
  margin-bottom: 24px;
}
</style>
