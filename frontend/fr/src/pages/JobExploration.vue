<!--
  页面：岗位探索页（/job-exploration）。
  职责：提供岗位搜索、筛选与推荐能力，支持选择目标岗位并写入本地/后端，
        为后续能力画像与路径规划提供目标信息。
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as echarts from 'echarts'
import {
  BarChart3,
  SlidersHorizontal,
  Scale,
  MapPin,
  Banknote,
  CheckCircle2,
  X,
  Briefcase
} from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { getJobDetailApi, getJobFacetsApi, listJobsApi, recommendJobsByAiApi, type JobInfo } from '@/api/jobs'
import { loadCapabilityProfileDraft, loadEntryDraft, loadTargetJob, saveTargetJob } from '@/utils/storage'
import { activityMonitor } from '@/utils/activityMonitor'
import ProfilePromptBanner from '@/components/ProfilePromptBanner.vue'

type JobListItem = Pick<
  JobInfo,
  'id' | 'jobName' | 'companyName' | 'location' | 'salaryRange' | 'industry' | 'jobSourceUrl'
>

const router = useRouter()
const route = useRoute()

const filterCity = ref<string[]>([])
const filterKeyword = ref('')
const filterIndustry = ref<string[]>([])
const filterCompanySize = ref<string[]>([])
const filterCompanyType = ref<string[]>([])
const salaryRange = ref<[number, number]>([0, 60])

const activeTab = ref('all')
const selectedIds = ref<string[]>([])
const targetId = ref<string | null>(null)
const activeJobId = ref<string | null>(null)

const userProfile = ref({
  hasEntry: false,
  hasCapability: false,
  isComplete: false
})

const jobs = ref<JobListItem[]>([])
const recommendedJobs = ref<JobListItem[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(12)

const facetLocations = ref<string[]>([])
const facetIndustries = ref<string[]>([])
const facetCompanySizes = ref<string[]>([])
const facetCompanyTypes = ref<string[]>([])

const cities = computed(() => facetLocations.value)
const industries = computed(() => facetIndustries.value)
const companySizes = computed(() => facetCompanySizes.value)
const companyTypes = computed(() => facetCompanyTypes.value)

const extractRequirements = (jobDesc: string) => {
  const raw = jobDesc
    .replace(/\d+、/g, ' ')
    .replace(/[；;。.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const parts = raw
    .split(/[,，\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
  const keep = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    if (p.length < 2) continue
    if (p.length > 14) continue
    if (keep.has(p)) continue
    keep.add(p)
    out.push(p)
    if (out.length >= 10) break
  }
  return out
}

const parseSalaryK = (salary: string) => {
  const s = salary.trim()
  const mk = s.match(/(\d+(?:\.\d+)?)\s*[kK]\s*[-~]\s*(\d+(?:\.\d+)?)\s*[kK]/)
  if (mk) return { min: Number(mk[1]), max: Number(mk[2]) }

  const mw = s.match(/(\d+(?:\.\d+)?)\s*[-~]\s*(\d+(?:\.\d+)?)\s*万/)
  if (mw) return { min: Number(mw[1]) * 10, max: Number(mw[2]) * 10 }

  const my = s.match(/(\d+)\s*[-~]\s*(\d+)\s*元/)
  if (my) return { min: Number(my[1]) / 1000, max: Number(my[2]) / 1000 }

  return { min: 0, max: 0 }
}

const isSalaryMatched = (salary: string | undefined) => {
  if (!salary) return false
  const parsed = parseSalaryK(salary)
  // 无法解析时不过滤，避免误伤（如“面议”）
  if (parsed.min <= 0 && parsed.max <= 0) return true

  const [selectedMin, selectedMax] = salaryRange.value
  return parsed.max >= selectedMin && parsed.min <= selectedMax
}

const filteredJobs = computed(() => jobs.value.filter(j => isSalaryMatched(j.salaryRange)))
const filteredRecommendedJobs = computed(() =>
  recommendedJobs.value.filter(j => isSalaryMatched(j.salaryRange))
)

const preferredIdSet = computed(() => {
  const set = new Set<string>()
  const preferred = route.query.preferred
  if (typeof preferred === 'string' && preferred.trim()) {
    preferred
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(id => set.add(id))
  }
  recommendedJobs.value.forEach(j => set.add(String(j.id)))
  return set
})

const selectedJobs = computed(() => {
  const set = new Set(selectedIds.value)
  const combined = [...recommendedJobs.value, ...jobs.value]
  const result: JobListItem[] = []
  const added = new Set<string>()
  combined.forEach(j => {
    const id = String(j.id)
    if (set.has(id) && !added.has(id)) {
      result.push(j)
      added.add(id)
    }
  })
  return result
})

const activeJobDetail = ref<JobInfo | null>(null)

const activeJob = computed(() => {
  const id = activeJobId.value
  if (!id) return null
  return (
    recommendedJobs.value.find(j => String(j.id) === id) ||
    jobs.value.find(j => String(j.id) === id) ||
    null
  )
})

const setActive = (id: string) => {
  activeJobId.value = id
}

const toggleCompare = (job: JobListItem) => {
  const id = String(job.id)
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
    if (activeJobId.value === id) activeJobId.value = null
    return
  }
  if (selectedIds.value.length >= 3) {
    ElMessage.warning('最多对比 3 个岗位')
    return
  }
  selectedIds.value.push(id)
  activeJobId.value = id
}

const setTarget = async (job: JobListItem) => {
  targetId.value = String(job.id)
  const detail = await getJobDetailApi(job.id)
  const payload = {
    id: String(job.id),
    jobName: job.jobName,
    companyName: job.companyName,
    city: job.location,
    salary: job.salaryRange,
    matchRate: 90,
    keyRequirements: extractRequirements(detail.jobDetails || ''),
    description: detail.jobDetails || ''
  }
  // 本地缓存
  saveTargetJob(payload)
  activityMonitor.recordAction('选定目标岗位', { targetJobSelected: true })
  ElMessage.success('已设为目标岗位')
}

const gotoPlanning = () => {
  if (!targetId.value) {
    ElMessage.warning('请先确认一个目标岗位')
    return
  }
  router.push('/path-planning')
}

const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const initChart = () => {
  if (!chartRef.value) return
  if (chart) chart.dispose()
  chart = echarts.init(chartRef.value)
  chart.setOption({
    grid: { left: 24, right: 16, top: 24, bottom: 24 },
    xAxis: {
      type: 'category',
      data: ['1月', '2月', '3月', '4月', '5月', '6月'],
      axisLabel: { color: '#64748b' },
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    series: [
      {
        type: 'line',
        data: [42, 50, 47, 58, 62, 70],
        smooth: true,
        lineStyle: { color: '#c1b0ff', width: 2 },
        itemStyle: { color: '#43089f' },
        areaStyle: { color: 'rgba(193, 176, 255, 0.2)' }
      }
    ]
  })
}

watch(
  () => [chartRef.value, selectedIds.value.length, activeJobId.value],
  () => {
    setTimeout(() => {
      initChart()
      chart?.resize()
    }, 0)
  },
  { immediate: true }
)

const fetchFacets = async () => {
  const res = await getJobFacetsApi()
  facetLocations.value = res.locations
  facetIndustries.value = res.industries
  facetCompanySizes.value = res.companySizes
  facetCompanyTypes.value = res.companyTypes
}

const fetchJobs = async () => {
  loading.value = true
  try {
    const res = await listJobsApi({
      keyword: filterKeyword.value.trim() || undefined,
      locations: filterCity.value.length ? filterCity.value : undefined,
      industry: filterIndustry.value.length ? filterIndustry.value[0] : undefined,
      companySize: filterCompanySize.value.length ? filterCompanySize.value[0] : undefined,
      companyType: filterCompanyType.value.length ? filterCompanyType.value[0] : undefined,
      page: page.value,
      pageSize: pageSize.value
    })
    jobs.value = res.list
    total.value = res.total
  } catch (e: unknown) {
    jobs.value = []
    total.value = 0
    ElMessage.error((e as Error)?.message || '获取岗位失败')
  } finally {
    loading.value = false
  }
}

const fetchRecommendedJobs = async () => {
  const draft = loadCapabilityProfileDraft()
  const entry = loadEntryDraft()

  if (!draft) {
    recommendedJobs.value = []
    return
  }

  const fallback = (draft?.recommendedJobs ?? []) as Array<any>
  const preferredJobIds = fallback
    .map((j: any) => Number(j?.id))
    .filter(id => !Number.isNaN(id))

  try {
    const res = await recommendJobsByAiApi({
      entry: entry ?? undefined,
      capabilityProfile: draft as Record<string, unknown>,
      preferredJobIds,
      locations: entry?.target?.cities ?? undefined,
      limit: 6
    })

    const list = res?.jobs ?? []
    if (list.length > 0) {
      recommendedJobs.value = list.map((j: JobInfo) => ({
        id: j.id,
        jobName: j.jobName,
        companyName: j.companyName,
        location: j.location,
        salaryRange: j.salaryRange,
        industry: j.industry as string | undefined,
        jobSourceUrl: (j.jobSourceUrl as string | undefined) || ''
      }))
      return
    }
  } catch {
    // 使用本地推荐兜底
  }

  recommendedJobs.value = fallback.map((j: any) => ({
    id: j.id,
    jobName: j.jobName,
    companyName: j.companyName,
    location: j.location,
    salaryRange: j.salaryRange,
    industry: j.industry as string | undefined,
    jobSourceUrl: (j.jobSourceUrl as string | undefined) || ''
  }))
}

watch(
  () => [
    filterKeyword.value,
    filterCity.value.join('|'),
    filterIndustry.value.join('|'),
    filterCompanySize.value.join('|'),
    filterCompanyType.value.join('|')
  ],
  () => {
    page.value = 1
    fetchJobs()
  }
)

watch(
  () => page.value,
  () => {
    fetchJobs()
  }
)

watch(
  () => activeJobId.value,
  async id => {
    if (!id) {
      activeJobDetail.value = null
      return
    }
    activeJobDetail.value = await getJobDetailApi(Number(id))
    activityMonitor.recordAction('浏览岗位详情')
    activityMonitor.updatePageState({ browsedJobCount: selectedIds.value.length })
  }
)

onMounted(async () => {
  // 检测用户状态
  const draft = loadEntryDraft()
  const capability = loadCapabilityProfileDraft()

  userProfile.value = {
    hasEntry: !!draft,
    hasCapability: !!capability,
    isComplete: !!draft && !!capability
  }

  // 无论状态如何，都加载岗位数据
  await fetchFacets()
  await fetchJobs()

  // 只有完整画像才加载推荐
  if (userProfile.value.isComplete) {
    fetchRecommendedJobs()
  }

  // 仅使用本地目标岗位
  const local = loadTargetJob()
  if (local?.id) {
    targetId.value = String(local.id)
  }
})

const overviewSkills = computed(() => {
  const map = new Map<string, number>()
  jobs.value.forEach(j => {
    const base = `${j.jobName} ${j.industry ?? ''}`
    extractRequirements(base).forEach(s => map.set(s, (map.get(s) || 0) + 1))
  })
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([k]) => k)
})

const isCompareMode = computed(() => selectedIds.value.length >= 2)

// 根据用户状态设置默认标签页
watch(
  () => userProfile.value.isComplete,
  isComplete => {
    if (isComplete) {
      activeTab.value = 'recommended'
    } else {
      activeTab.value = 'all'
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="job-page clay-page">
    <div class="page-container">
      <div class="header mb-6">
        <div class="title-row">
          <SlidersHorizontal :size="22" class="title-icon" />
          <h1 class="title">岗位探索</h1>
          <span class="step-tag">第3步</span>
        </div>
        <p class="text-sub">筛选岗位、对比差异，并确认你的目标岗位</p>
      </div>

      <!-- 状态提示横幅 -->
      <ProfilePromptBanner
        v-if="!userProfile.hasEntry"
        level="info"
        icon="💡"
        title="完善信息，获得个性化推荐"
        message="当前显示的是通用岗位列表。完善你的能力画像后，我们将为你推荐最匹配的岗位。"
        action-text="去完善信息"
        action-path="/assessment/mbti"
      />

      <ProfilePromptBanner
        v-else-if="!userProfile.hasCapability"
        level="info"
        icon="🎯"
        title="生成能力画像，解锁推荐功能"
        message="你已完成信息录入。生成能力画像后，即可查看为你量身定制的岗位推荐。"
        action-text="生成能力画像"
        action-path="/capability-profile"
      />

      <div class="layout">
        <aside class="sidebar">
          <div class="panel filter-panel">
            <div class="panel-title">
              <SlidersHorizontal :size="18" />
              <span>筛选条件</span>
            </div>

            <div class="field">
              <div class="label">
                <MapPin :size="16" /> 城市
              </div>
              <el-select v-model="filterCity" multiple placeholder="不限" class="w-full">
                <el-option v-for="c in cities" :key="c" :label="c" :value="c" />
              </el-select>
            </div>

            <div class="field">
              <div class="label">
                <SlidersHorizontal :size="16" /> 行业
              </div>
              <el-select v-model="filterIndustry" multiple placeholder="不限" class="w-full">
                <el-option v-for="i in industries" :key="i" :label="i" :value="i" />
              </el-select>
            </div>

            <div class="field">
              <div class="label">
                <Scale :size="16" /> 公司规模
              </div>
              <el-select v-model="filterCompanySize" multiple placeholder="不限" class="w-full">
                <el-option v-for="s in companySizes" :key="s" :label="s" :value="s" />
              </el-select>
            </div>

            <div class="field">
              <div class="label">
                <CheckCircle2 :size="16" /> 公司类型
              </div>
              <el-select v-model="filterCompanyType" multiple placeholder="不限" class="w-full">
                <el-option v-for="t in companyTypes" :key="t" :label="t" :value="t" />
              </el-select>
            </div>

            <div class="field">
              <div class="label">
                <SlidersHorizontal :size="16" /> 关键词
              </div>
              <el-input v-model="filterKeyword" placeholder="如：前端、产品、数据" clearable />
            </div>

            <div class="field">
              <div class="label">
                <Banknote :size="16" /> 薪资区间（k）
              </div>
              <el-slider v-model="salaryRange" range :min="0" :max="60" :step="1" />
              <div class="text-mute text-xs">
                {{ salaryRange[0] }}k - {{ salaryRange[1] }}k
              </div>
            </div>
          </div>

          <div class="panel detail-panel">
            <div class="panel-title">
              <BarChart3 :size="18" />
              <span>{{ isCompareMode ? '多岗位对比' : activeJob ? '岗位详情' : '社会需求总览' }}</span>
            </div>

            <div v-if="isCompareMode" class="compare">
              <div class="compare-list mb-4">
                <div v-for="j in selectedJobs" :key="j.id" class="compare-item">
                  <div class="compare-name">{{ j.jobName }}</div>
                  <button
                    class="icon-btn"
                    type="button"
                    @click="toggleCompare(j)"
                  >
                    <X :size="16" />
                  </button>
                </div>
              </div>
              <div class="mini-title">行业趋势（示意）</div>
              <div ref="chartRef" class="chart"></div>
              <el-button
                class="w-full mt-4 clay-btn-primary"
                type="primary"
                @click="gotoPlanning"
                :disabled="!targetId"
              >
                进入路径规划
              </el-button>
            </div>

            <div v-else-if="activeJob" class="detail">
              <div class="detail-title">
                {{ activeJobDetail?.jobName ?? activeJob.jobName }}
              </div>
              <div class="detail-sub text-sub">
                {{ activeJobDetail?.companyName ?? activeJob.companyName }} ·
                {{ activeJobDetail?.location ?? activeJob.location }}
              </div>
              <div class="detail-salary">
                {{ activeJobDetail?.salaryRange ?? activeJob.salaryRange }}
              </div>
              <div class="mini-title">关键要求</div>
              <div class="tags mb-4">
                <el-tag
                  v-for="s in extractRequirements(activeJobDetail?.jobDetails ?? '').slice(0, 8)"
                  :key="s"
                  effect="plain"
                >
                  {{ s }}
                </el-tag>
              </div>
              <div class="mini-title">岗位描述</div>
              <div class="desc text-sub">
                {{ activeJobDetail?.jobDetails ?? '' }}
              </div>
              <div class="btn-row mt-4">
                <el-button
                  class="w-full submit-main-btn"
                  type="primary"
                  @click="setTarget(activeJob)"
                >
                  确认该岗位为目标
                </el-button>
                <el-button
                  class="w-full"
                  plain
                  @click="gotoPlanning"
                  :disabled="!targetId"
                >
                  进入路径规划
                </el-button>
              </div>
            </div>

            <div v-else class="overview">
              <div class="mini-title">行业趋势（示意）</div>
              <div ref="chartRef" class="chart"></div>
              <div class="mini-title mt-4">高频技能（示意）</div>
              <div class="tags">
                <el-tag
                  v-for="s in overviewSkills"
                  :key="s"
                  effect="plain"
                >
                  {{ s }}
                </el-tag>
              </div>
              <div class="mt-4 text-mute text-xs">
                选择岗位后将展示详情；选择 2 个以上可进入对比模式
              </div>
            </div>
          </div>
        </aside>

        <main class="list">
          <el-tabs v-model="activeTab" class="job-tabs">
            <el-tab-pane
              v-if="userProfile.isComplete"
              label="推荐岗位"
              name="recommended"
            >
              <section class="zone">
                <div class="zone-head">
                  <div>
                    <div class="zone-title">为你优选</div>
                    <div class="zone-sub">大模型根据你的测评与问卷推荐</div>
                  </div>
                  <div class="zone-meta" v-if="filteredRecommendedJobs.length">
                    {{ filteredRecommendedJobs.length }} 个
                  </div>
                </div>

                <div v-if="filteredRecommendedJobs.length" class="shop-grid">
                  <div
                    v-for="job in filteredRecommendedJobs"
                    :key="`recommended-${job.id}`"
                    class="shop-card"
                    :class="{ active: String(job.id) === activeJobId }"
                    @click="setActive(String(job.id))"
                  >
                    <div class="shop-header">
                      <div class="shop-price">{{ job.salaryRange }}</div>
                      <div class="shop-badge">智能匹配</div>
                    </div>
                    <div class="shop-body">
                      <div class="shop-title">{{ job.jobName }}</div>
                      <div class="shop-company">
                        <Briefcase :size="14" class="icon-gray" />
                        <span>{{ job.companyName }}</span>
                      </div>
                      <div class="shop-location">
                        <MapPin :size="14" class="icon-gray" />
                        <span>{{ job.location }}</span>
                      </div>
                      <div class="shop-tags">
                        <span
                          v-for="s in extractRequirements(`${job.jobName} ${job.industry ?? ''}`).slice(0, 3)"
                          :key="s"
                          class="tag-mini"
                        >
                          {{ s }}
                        </span>
                      </div>
                      <div class="shop-divider"></div>
                      <div class="shop-footer">
                        <button
                          class="action-btn compare-btn"
                          :class="{ 'is-selected': selectedIds.includes(String(job.id)) }"
                          @click.stop="toggleCompare(job)"
                        >
                          <Scale :size="14" />
                          <span>{{
                            selectedIds.includes(String(job.id)) ? '取消' : '对比'
                          }}</span>
                        </button>
                        <button
                          class="action-btn target-btn"
                          @click.stop="setTarget(job)"
                        >
                          <CheckCircle2 :size="14" />
                          <span>设为目标</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="zone-empty text-sub"
                >
                  先完成能力画像分析后，这里会展示你的高匹配岗位。
                </div>
              </section>
            </el-tab-pane>

            <el-tab-pane label="所有岗位" name="all">
              <section class="zone">
                <div class="zone-head mb-3">
                  <div>
                    <div class="zone-title">自由探索</div>
                    <div class="zone-sub">基于数据库岗位库筛选与浏览</div>
                  </div>
                  <div class="zone-meta">共 {{ filteredJobs.length }} 个</div>
                </div>

                <div class="chips mb-3">
                  <div
                    class="chip"
                    :class="{ active: selectedIds.length === 0 }"
                    @click="selectedIds = []"
                  >
                    未对比
                  </div>
                  <div
                    class="chip"
                    :class="{ active: selectedIds.length >= 2 }"
                    @click="selectedIds.length < 2 && jobs[0] && toggleCompare(jobs[0])"
                  >
                    对比模式
                  </div>
                </div>

                <div v-loading="loading" class="shop-grid">
                  <div
                    v-for="job in filteredJobs"
                    :key="job.id"
                    class="shop-card"
                    :class="{ active: String(job.id) === activeJobId }"
                    @click="setActive(String(job.id))"
                  >
                    <div class="shop-header">
                      <div class="shop-price">{{ job.salaryRange }}</div>
                      <div
                        class="shop-badge secondary"
                        v-if="preferredIdSet.has(String(job.id))"
                      >
                        优先
                      </div>
                    </div>
                    <div class="shop-body">
                      <div class="shop-title">{{ job.jobName }}</div>
                      <div class="shop-company">
                        <Briefcase :size="14" class="icon-gray" />
                        <span>{{ job.companyName }}</span>
                      </div>
                      <div class="shop-location">
                        <MapPin :size="14" class="icon-gray" />
                        <span>{{ job.location }}</span>
                      </div>
                      <div class="shop-tags">
                        <span
                          v-for="s in extractRequirements(`${job.jobName} ${job.industry ?? ''}`).slice(0, 3)"
                          :key="s"
                          class="tag-mini"
                        >
                          {{ s }}
                        </span>
                      </div>
                      <div class="shop-divider"></div>
                      <div class="shop-footer">
                        <button
                          class="action-btn compare-btn"
                          :class="{ 'is-selected': selectedIds.includes(String(job.id)) }"
                          @click.stop="toggleCompare(job)"
                        >
                          <Scale :size="14" />
                          <span>{{
                            selectedIds.includes(String(job.id)) ? '取消' : '对比'
                          }}</span>
                        </button>
                        <button
                          class="action-btn target-btn"
                          @click.stop="setTarget(job)"
                        >
                          <CheckCircle2 :size="14" />
                          <span>设为目标</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="pagination-row mt-6">
                  <el-pagination
                    v-model:current-page="page"
                    :page-size="pageSize"
                    :total="total"
                    layout="total, prev, pager, next, jumper"
                    background
                  />
                </div>
              </section>
            </el-tab-pane>
          </el-tabs>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.job-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}

.job-tabs :deep(.el-tabs__item) {
  font-size: 16px;
  font-weight: 700;
  color: var(--clay-text-subtle);
}

.job-tabs :deep(.el-tabs__item.is-active) {
  color: var(--clay-ube-800);
}

.job-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--clay-ube-800);
}

.pagination-row {
  display: flex;
  justify-content: center;
}

.job-page {
  min-height: 100vh;
  background: transparent;
}

.header {
  text-align: left;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
  color: var(--clay-text);
}

.title-icon {
  color: var(--clay-ube-800);
}

.step-tag {
  font-size: 12px;
  color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  border: 1px solid var(--clay-border-subtle);
  padding: 2px 10px;
  border-radius: 999px;
}

.layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 24px;
  align-items: start;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: 80px;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
  padding-right: 4px;
}

.sidebar::-webkit-scrollbar {
  width: 4px;
}

.sidebar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 4px;
}

.panel {
  padding: 20px;
  border-radius: var(--clay-radius-card);
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  margin-bottom: 20px;
  color: var(--clay-text);
  font-size: 15px;
}

.field {
  margin-bottom: 20px;
}

.label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--clay-text);
  margin-bottom: 10px;
  font-weight: 600;
}

.list {
  min-width: 0;
}

.zone {
  padding: 24px;
  border-radius: var(--clay-radius-section);
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
}

.zone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.zone-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--clay-text);
  line-height: 1.2;
}

.zone-sub {
  font-size: 13px;
  color: var(--clay-text-subtle);
  margin-top: 6px;
}

.zone-meta {
  font-size: 12px;
  color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  border: 1px solid var(--clay-border-subtle);
  padding: 6px 14px;
  border-radius: 10px;
  font-weight: 700;
}

.zone-empty {
  padding: 18px 8px;
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 16px;
}

.shop-card {
  overflow: hidden;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  position: relative;
}

.shop-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--clay-shadow-hard);
}

.shop-card.active {
  border-color: var(--clay-ube-800);
  box-shadow: var(--clay-shadow-hard);
}

.shop-header {
  padding: 16px 16px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.shop-price {
  font-size: 18px;
  font-weight: 800;
  color: var(--clay-text);
}

.shop-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  border: 1px solid var(--clay-border-subtle);
  padding: 2px 8px;
  border-radius: 6px;
}

.shop-badge.secondary {
  color: #43089f;
  background: var(--clay-ube-light, #f1eafe);
  border-color: var(--clay-border-light, #e2d7ff);
}

.shop-body {
  padding: 0 16px 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.shop-title {
  font-weight: 800;
  color: var(--clay-text);
  font-size: 16px;
  line-height: 1.4;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.shop-company,
.shop-location {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--clay-text-subtle);
  margin-bottom: 4px;
}

.icon-gray {
  color: #94a3b8;
}

.shop-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.tag-mini {
  font-size: 11px;
  color: var(--clay-text);
  background: var(--clay-surface-variant);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--clay-border-subtle);
}

.shop-divider {
  height: 1px;
  background: var(--clay-border-subtle);
  margin: 16px 0;
}

.shop-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  background: transparent;
}

.compare-btn {
  background: var(--clay-surface-variant);
  color: var(--clay-text);
  border-color: var(--clay-border-subtle);
}

.compare-btn:hover {
  background: var(--clay-border-subtle);
}

.compare-btn.is-selected {
  background: var(--clay-ube-light, #f1eafe);
  color: #43089f;
  border-color: var(--clay-border-light, #e2d7ff);
}

.target-btn {
  background: #000000;
  color: #fff;
}

.target-btn:hover {
  background: var(--clay-ube-800);
  box-shadow: var(--clay-shadow-hard);
}

.chips {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.chip {
  padding: 8px 16px;
  border-radius: 12px;
  border: 1px solid var(--clay-border-subtle);
  background: var(--clay-surface);
  font-size: 13px;
  color: var(--clay-text-subtle);
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 600;
}

.chip:hover {
  background: var(--clay-surface-variant);
}

.chip.active {
  background: #000000;
  border-color: #000000;
  color: #fff;
}

.chart {
  width: 100%;
  height: 220px;
  background: var(--clay-surface-variant);
  border-radius: 16px;
  padding: 12px;
}

.mini-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--clay-text);
  margin: 20px 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-title::before {
  content: '';
  width: 4px;
  height: 14px;
  background: var(--clay-ube-800);
  border-radius: 2px;
}

.detail-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--clay-text);
  line-height: 1.4;
}

.detail-sub {
  font-size: 14px;
  color: var(--clay-text-subtle);
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-salary {
  margin-top: 16px;
  font-size: 24px;
  font-weight: 800;
  color: var(--clay-text);
  border-bottom: 1px dashed var(--clay-border-subtle);
  padding-bottom: 16px;
}

.desc {
  font-size: 14px;
  line-height: 1.8;
  color: var(--clay-text);
  background: var(--clay-surface-variant);
  padding: 16px;
  border-radius: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.btn-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.compare-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--clay-border);
  border-radius: 12px;
  background: var(--clay-surface);
}

.compare-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--clay-text);
}

.icon-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: background 0.2s ease;
}

.icon-btn:hover {
  background: var(--clay-surface-variant);
}

.submit-main-btn {
  border-radius: var(--clay-radius-pill);
  background: #000000;
  border-color: #000000;
}

.submit-main-btn:hover {
  background: var(--clay-ube-800);
  border-color: var(--clay-ube-800);
}

@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .shop-grid {
    grid-template-columns: 1fr;
  }
}
</style>
