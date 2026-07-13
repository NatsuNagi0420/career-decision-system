<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bookmark, BookmarkCheck, BriefcaseBusiness, Building2, CalendarClock, ChevronRight, Compass,
  Database, FileSearch, GitCompareArrows, GraduationCap, Heart, HeartOff, Layers3, MapPin,
  Plus, Search, SlidersHorizontal, Target, Timer, TriangleAlert, X
} from 'lucide-vue-next'
import { m3Message } from '@/design-system/services/feedback'
import { M3Dialog, M3ProgressOverlay } from '@/design-system/components'
import CareerVisual from '@/components/CareerVisual.vue'
import { getCareerAsset } from '@/content/careerAssets'
import {
  createCareerDirectionApi,
  favoriteCareerDirectionApi,
  listCareerDirectionsApi,
  unfavoriteCareerDirectionApi,
  type CareerDirection
} from '@/api/careerDirections'
import {
  addFavoriteJobApi,
  getJobDetailApi,
  getJobFacetsApi,
  addTargetJobApi,
  listFavoriteJobsApi,
  listTargetJobsApi,
  listJobsApi,
  removeFavoriteJobApi,
  removeTargetJobApi,
  type JobInfo
} from '@/api/jobs'
import {
  addDecisionCandidateApi,
  addProjectJobSampleApi,
  getDecisionProjectApi,
  listDecisionProjectsApi,
  type DecisionCandidate,
  type DecisionProjectSummary
} from '@/api/decisionProjects'
import { listPersonalEvidenceApi, type PersonalEvidence } from '@/api/personalEvidence'
import { collectJobRequirements, compareResumeToJob, matchEvidence } from '@/utils/careerInsights'

defineOptions({ name: 'CareerExplorePage' })

const route = useRoute()
const router = useRouter()
const activeTab = ref(route.query.tab === 'jobs' ? 'jobs' : 'directions')
const loading = ref(false)
const keyword = ref('')
const category = ref('')
const majorFilter = ref('')
const industryFilter = ref('')
const workTypeFilter = ref('')
const interestFilter = ref('')
const directions = ref<CareerDirection[]>([])
const directionCatalog = ref<CareerDirection[]>([])
const selectedDirection = ref<CareerDirection | null>(null)
const comparedDirectionIds = ref<number[]>([])

const jobs = ref<JobInfo[]>([])
const jobTotal = ref(0)
const page = ref(1)
const pageSize = 12
const city = ref('')
const jobDirection = ref('')
const salaryBand = ref('')
const experienceLevel = ref('')
const cities = ref<string[]>([])
const jobDirections = ref<string[]>([])
const selectedJob = ref<JobInfo | null>(null)
const comparedJobs = ref<JobInfo[]>([])
const favoriteJobIds = ref(new Set<number>())
const targetJobIds = ref(new Set<number>())
const personalEvidence = ref<PersonalEvidence[]>([])
const showResumeCompareDialog = ref(false)
const resumeCompareText = ref('')

const projects = ref<DecisionProjectSummary[]>([])
const showDirectionDialog = ref(false)
const showJobDialog = ref(false)
const targetProjectId = ref<number | null>(null)
const targetCandidateId = ref<number | null>(null)
const targetCandidates = ref<DecisionCandidate[]>([])
const targetProjectVersion = ref<number | null>(null)
const savingLink = ref(false)
const showCustomDirectionDialog = ref(false)
const savingDirection = ref(false)
const customDirectionForm = ref({
  name: '', category: '', summary: '', typicalWork: '', commonSkills: '', growthPath: '',
  misconceptions: '', majorTags: '', industryTags: '', workTypes: ''
})

const categories = computed(() => Array.from(new Set(directionCatalog.value.map((item) => item.category))))
const majorTags = computed(() => Array.from(new Set(directionCatalog.value.flatMap((item) => item.majorTags))).sort())
const industryTags = computed(() => Array.from(new Set(directionCatalog.value.flatMap((item) => item.industryTags))).sort())
const workTypes = computed(() => Array.from(new Set(directionCatalog.value.flatMap((item) => item.workTypes))).sort())
const visibleDirections = computed(() => directions.value.filter((item) =>
  (!majorFilter.value || item.majorTags.includes(majorFilter.value))
  && (!industryFilter.value || item.industryTags.includes(industryFilter.value))
  && (!workTypeFilter.value || item.workTypes.includes(workTypeFilter.value))
  && (!interestFilter.value || [item.name, item.summary, ...item.typicalWork, ...item.commonSkills, ...item.workTypes]
    .join(' ').toLocaleLowerCase().includes(interestFilter.value.trim().toLocaleLowerCase()))
))
const comparedDirections = computed(() => comparedDirectionIds.value
  .map((id) => directionCatalog.value.find((item) => item.id === id))
  .filter((item): item is CareerDirection => Boolean(item)))
const totalPages = computed(() => Math.max(1, Math.ceil(jobTotal.value / pageSize)))
const jobEvidenceMatch = computed(() => {
  const job = selectedJob.value
  if (!job) return { existing: [], missing: [], uncertain: [] }
  const requirements = collectJobRequirements(job)
  const matches = matchEvidence(requirements, personalEvidence.value)
  const existing = matches
    .filter((item) => item.evidence)
    .map((item) => `${item.requirement}：${item.confidence === 'direct' ? '直接关联' : '可能关联'}个人证据“${item.evidence!.title}”`)
  const missing = matches
    .filter((item) => !item.evidence)
    .map((item) => `${item.requirement}：档案中暂未找到直接证据`)
  const uncertain: string[] = []
  if (!personalEvidence.value.length) uncertain.push('尚未录入个人证据，当前不能判断你是否具备岗位要求。')
  if (job.experienceLevel) uncertain.push(`经验要求“${job.experienceLevel}”需要结合经历内容逐条核对。`)
  if (job.education) uncertain.push(`学历要求“${job.education}”只表示招聘条件，不代表实际录用概率。`)
  if (!(job.requirements || []).length) uncertain.push('岗位没有结构化要求字段，不能从原始描述自动推断完整能力清单。')
  if (!requirements.length) uncertain.push('岗位没有结构化技能或要求，当前无法可靠拆解技能缺口。')
  return { existing, missing, uncertain }
})
const resumeComparison = computed(() => selectedJob.value && resumeCompareText.value.trim()
  ? compareResumeToJob(resumeCompareText.value, selectedJob.value)
  : null)
const salaryBands: Record<string, { label: string; min?: number; max?: number }> = {
  any: { label: '全部薪资' },
  under15: { label: '15k 以下', max: 15000 },
  from15to25: { label: '15k - 25k', min: 15000, max: 25000 },
  from25to35: { label: '25k - 35k', min: 25000, max: 35000 },
  over35: { label: '35k 以上', min: 35000 }
}
const experienceOptions = ['不限', '应届生', '在校/应届', '1年以内', '1-3年', '3-5年', '5-10年', '10年以上']

const loadProjects = async () => {
  projects.value = await listDecisionProjectsApi()
  const current = projects.value.find((item) => item.current) || projects.value[0]
  targetProjectId.value = current?.id || null
}

const loadDirections = async () => {
  loading.value = true
  try {
    const result = await listCareerDirectionsApi({
      keyword: keyword.value.trim() || undefined,
      category: category.value || undefined
    })
    directions.value = result
    if (!keyword.value.trim() && !category.value) directionCatalog.value = result
    if (selectedDirection.value) {
      selectedDirection.value = directions.value.find((item) => item.id === selectedDirection.value?.id) || null
    }
  } finally {
    loading.value = false
  }
}

const loadJobs = async () => {
  loading.value = true
  try {
    const result = await listJobsApi({
      keyword: keyword.value.trim() || undefined,
      location: city.value || undefined,
      industry: jobDirection.value || undefined,
      salaryMin: salaryBands[salaryBand.value || 'any']?.min,
      salaryMax: salaryBands[salaryBand.value || 'any']?.max,
      experienceLevel: experienceLevel.value || undefined,
      page: page.value,
      pageSize
    })
    jobs.value = result.list
    jobTotal.value = result.total
  } finally {
    loading.value = false
  }
}

const initialize = async () => {
  const [facets, favorites, targets, evidenceRows] = await Promise.all([
    getJobFacetsApi(),
    listFavoriteJobsApi(),
    listTargetJobsApi(),
    listPersonalEvidenceApi(),
    loadProjects()
  ])
  cities.value = facets.locations
  jobDirections.value = facets.industries
  favoriteJobIds.value = new Set(favorites.map((item) => item.id))
  targetJobIds.value = new Set(targets.map((item) => item.id))
  personalEvidence.value = evidenceRows
  await Promise.all([loadDirections(), loadJobs()])

  const directionId = Number(route.query.directionId)
  if (Number.isFinite(directionId)) {
    const target = directionCatalog.value.find((item) => item.id === directionId)
    if (target) {
      selectedDirection.value = target
      if (route.query.action === 'add') openDirectionDialog(target)
    }
  }

  const jobId = Number(route.query.jobId)
  if (route.query.tab === 'jobs' && Number.isFinite(jobId)) {
    selectedJob.value = await getJobDetailApi(jobId)
  }
}

onMounted(initialize)

watch(activeTab, (tab) => {
  router.replace({ query: tab === 'jobs' ? { tab: 'jobs' } : {} })
  keyword.value = ''
})

watch([city, jobDirection, salaryBand, experienceLevel], () => {
  page.value = 1
  loadJobs()
})

watch(page, loadJobs)

const search = () => {
  page.value = 1
  if (activeTab.value === 'directions') loadDirections()
  else loadJobs()
}

const scrollDirectionCategories = (event: WheelEvent) => {
  const strip = event.currentTarget as HTMLElement
  const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth)
  if (!maxScrollLeft) return

  const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY
  if (!dominantDelta) return

  const deltaScale = event.deltaMode === 1
    ? 16
    : event.deltaMode === 2
      ? strip.clientWidth
      : 1
  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, strip.scrollLeft + dominantDelta * deltaScale)
  )
  if (nextScrollLeft === strip.scrollLeft) return

  event.preventDefault()
  strip.scrollLeft = nextScrollLeft
}

const toggleDirectionFavorite = async (item: CareerDirection) => {
  const updated = item.favorite
    ? await unfavoriteCareerDirectionApi(item.id)
    : await favoriteCareerDirectionApi(item.id)
  directions.value = directions.value.map((row) => row.id === item.id ? updated : row)
  directionCatalog.value = directionCatalog.value.map((row) => row.id === item.id ? updated : row)
  if (selectedDirection.value?.id === item.id) selectedDirection.value = updated
}

const openDirectionDialog = (item: CareerDirection) => {
  selectedDirection.value = item
  showDirectionDialog.value = true
}

const openDirectionDetail = (item: CareerDirection) => router.push(`/explore/directions/${item.id}`)

const toggleDirectionCompare = (item: CareerDirection) => {
  if (comparedDirectionIds.value.includes(item.id)) {
    comparedDirectionIds.value = comparedDirectionIds.value.filter((id) => id !== item.id)
    return
  }
  if (comparedDirectionIds.value.length >= 3) {
    m3Message.warning('最多同时比较 3 个职业方向')
    return
  }
  comparedDirectionIds.value = [...comparedDirectionIds.value, item.id]
}

const openDirectionComparison = () => {
  if (comparedDirectionIds.value.length < 2) {
    m3Message.warning('请至少选择 2 个职业方向')
    return
  }
  router.push({ path: '/explore/compare', query: { directions: comparedDirectionIds.value.join(',') } })
}

const addDirectionToProject = async () => {
  if (!selectedDirection.value || !targetProjectId.value) {
    m3Message.warning(projects.value.length ? '请选择决策项目' : '请先创建一个决策项目')
    return
  }
  savingLink.value = true
  try {
    const currentProject = await getDecisionProjectApi(targetProjectId.value)
    const updated = await addDecisionCandidateApi(targetProjectId.value, {
      directionId: selectedDirection.value.id,
      name: selectedDirection.value.name,
      recommendationReason: `从职业目录加入：${selectedDirection.value.summary}`,
      uncertainties: '尚未结合个人证据和真实岗位样本完成验证。',
      validationActions: ['至少分析 5 个真实招聘岗位'],
      sourceType: 'catalog',
      expectedVersion: currentProject.version
    })
    targetProjectVersion.value = updated.version
    showDirectionDialog.value = false
    m3Message.success('已加入决策项目')
  } finally {
    savingLink.value = false
  }
}

const openJob = async (job: JobInfo) => {
  selectedJob.value = await getJobDetailApi(job.id)
  await router.replace({ query: { ...route.query, tab: 'jobs', jobId: String(job.id) } })
}

const closeJob = async () => {
  selectedJob.value = null
  const query = { ...route.query }
  delete query.jobId
  await router.replace({ query })
}

const toggleJobFavorite = async (job: JobInfo) => {
  if (favoriteJobIds.value.has(job.id)) {
    await removeFavoriteJobApi(job.id)
    favoriteJobIds.value.delete(job.id)
  } else {
    await addFavoriteJobApi(job.id)
    favoriteJobIds.value.add(job.id)
  }
  favoriteJobIds.value = new Set(favoriteJobIds.value)
}

const toggleTargetJob = async (job: JobInfo) => {
  const targets = targetJobIds.value.has(job.id)
    ? await removeTargetJobApi(job.id)
    : await addTargetJobApi(job.id)
  targetJobIds.value = new Set(targets.map((item) => item.id))
  m3Message.success(targetJobIds.value.has(job.id) ? '已设为目标岗位' : '已取消目标岗位')
}

const toggleCompare = async (job: JobInfo) => {
  const exists = comparedJobs.value.some((item) => item.id === job.id)
  if (exists) {
    comparedJobs.value = comparedJobs.value.filter((item) => item.id !== job.id)
    return
  }
  if (comparedJobs.value.length >= 3) {
    m3Message.warning('最多同时比较 3 个岗位')
    return
  }
  const detail = await getJobDetailApi(job.id)
  comparedJobs.value.push(detail)
}

const sourceDate = (job: JobInfo) => {
  const raw = job.sourceUpdatedAt || job.sourceUpdatedText || job.updateDate || ''
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
    : raw
}
const sourceLabel = (job: JobInfo) => job.sourcePlatform || '来源未提供'
const sourceWarning = (job: JobInfo) => {
  const raw = job.sourceUpdatedAt || job.updateDate
  if (!raw) return '源数据未提供更新时间，使用前请重新核实岗位是否仍有效。'
  const timestamp = new Date(raw).getTime()
  if (!Number.isFinite(timestamp)) return ''
  return Date.now() - timestamp > 180 * 86400000 ? '该岗位数据超过 180 天，可能已经过期。' : ''
}
const compactJobText = (job: JobInfo) => {
  const source = [...(job.responsibilities || []), ...(job.requirements || [])].join('；') || job.jobDetails || ''
  return source.length > 140 ? `${source.slice(0, 140)}…` : source || '原始岗位描述未提供'
}

const openJobDialog = async (job: JobInfo) => {
  selectedJob.value = job
  showJobDialog.value = true
  if (!targetProjectId.value) return
  const project = await getDecisionProjectApi(targetProjectId.value)
  targetCandidates.value = project.candidates
  targetProjectVersion.value = project.version
  targetCandidateId.value = project.candidates[0]?.id || null
}

watch(targetProjectId, async (id) => {
  if (!showJobDialog.value || !id) return
  const project = await getDecisionProjectApi(id)
  targetCandidates.value = project.candidates
  targetProjectVersion.value = project.version
  targetCandidateId.value = project.candidates[0]?.id || null
})

const addJobToProject = async () => {
  if (!selectedJob.value || !targetProjectId.value || !targetCandidateId.value) {
    m3Message.warning('请选择项目和该岗位用于验证的候选方向')
    return
  }
  savingLink.value = true
  try {
    const updated = await addProjectJobSampleApi(targetProjectId.value, {
      candidateId: targetCandidateId.value,
      jobId: selectedJob.value.id,
      note: '从职业探索加入的真实岗位样本',
      expectedVersion: targetProjectVersion.value || undefined
    })
    targetProjectVersion.value = updated.version
    showJobDialog.value = false
    m3Message.success('岗位已加入项目证据')
  } finally {
    savingLink.value = false
  }
}

const createProject = () => router.push('/decision-projects/new')
const splitValues = (value: string) => value.split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean)
const saveCustomDirection = async () => {
  const form = customDirectionForm.value
  if (!form.name.trim() || !form.category.trim() || !form.summary.trim()) {
    m3Message.warning('方向名称、分类和简介不能为空')
    return
  }
  savingDirection.value = true
  try {
    const created = await createCareerDirectionApi({
      name: form.name.trim(),
      category: form.category.trim(),
      summary: form.summary.trim(),
      typicalWork: splitValues(form.typicalWork),
      commonSkills: splitValues(form.commonSkills),
      growthPath: splitValues(form.growthPath),
      misconceptions: splitValues(form.misconceptions),
      majorTags: splitValues(form.majorTags),
      industryTags: splitValues(form.industryTags),
      workTypes: splitValues(form.workTypes)
    })
    directionCatalog.value = [
      ...directionCatalog.value.filter((item) => item.id !== created.id),
      created
    ]
    await loadDirections()
    selectedDirection.value = created
    showCustomDirectionDialog.value = false
    customDirectionForm.value = { name: '', category: '', summary: '', typicalWork: '', commonSkills: '', growthPath: '', misconceptions: '', majorTags: '', industryTags: '', workTypes: '' }
    m3Message.success('自定义职业方向已保存')
  } finally {
    savingDirection.value = false
  }
}
</script>

<template>
  <div class="product-page">
    <div class="product-shell explore-shell">
      <header class="product-header">
        <div>
          <h1>职业探索</h1>
          <p>先理解职业方向，再用真实招聘岗位验证要求、地域和薪资。岗位数据不完整时会明确显示未知。</p>
        </div>
      </header>

      <M3Tabs class="explore-tabs" aria-label="探索类型">
        <M3Tab :active="activeTab === 'directions'" @click="activeTab = 'directions'"><template #icon><Compass :size="18" /></template>职业方向</M3Tab>
        <M3Tab :active="activeTab === 'jobs'" @click="activeTab = 'jobs'"><template #icon><BriefcaseBusiness :size="18" /></template>招聘岗位</M3Tab>
      </M3Tabs>

      <div class="search-row">
        <label class="search-box">
          <Search :size="18" />
          <M3TextField v-model="keyword" :placeholder="activeTab === 'directions' ? '搜索职业方向或工作内容' : '搜索岗位、公司或技能'" aria-label="搜索关键词" @keyup.enter="search" />
        </label>
        <M3Button type="button" @click="search">搜索</M3Button>
      </div>

      <Transition name="explore-fade-through" mode="out-in">
        <div v-if="activeTab === 'directions'" key="directions" class="explore-view" data-explore-view="directions">
        <div class="filter-strip explore-motion-group" role="group" aria-label="职业方向分类" @wheel="scrollDirectionCategories">
          <SlidersHorizontal :size="16" />
          <M3Chip label="全部" type="filter" :selected="!category" @click="category = ''; loadDirections()" />
          <M3Chip v-for="item in categories" :key="item" :label="item" type="filter" :selected="category === item" @click="category = item; loadDirections()" />
        </div>
        <M3Card tag="div" class="direction-filters explore-motion-group">
          <label>专业<M3Select v-model="majorFilter"><option value="">全部专业</option><option v-for="item in majorTags" :key="item">{{ item }}</option></M3Select></label>
          <label>行业<M3Select v-model="industryFilter"><option value="">全部行业</option><option v-for="item in industryTags" :key="item">{{ item }}</option></M3Select></label>
          <label>工作方式<M3Select v-model="workTypeFilter"><option value="">全部方式</option><option v-for="item in workTypes" :key="item">{{ item }}</option></M3Select></label>
          <label>兴趣<M3TextField v-model="interestFilter" placeholder="例如：分析、创作" /></label>
          <M3Button v-if="majorFilter || industryFilter || workTypeFilter || interestFilter" variant="text" @click="majorFilter = ''; industryFilter = ''; workTypeFilter = ''; interestFilter = ''">清除筛选</M3Button>
          <M3Button variant="outlined" type="button" @click="showCustomDirectionDialog = true"><Plus :size="16" />自定义方向</M3Button>
        </M3Card>

        <div class="direction-explore-layout explore-motion-group">
          <TransitionGroup name="direction-list" tag="section" class="direction-grid loading-host">
            <M3ProgressOverlay key="direction-loading" :visible="loading" label="正在加载职业方向" />
            <M3Card tag="article" v-for="item in visibleDirections" :key="item.id" class="direction-card" :class="{ compared: comparedDirectionIds.includes(item.id) }">
              <div class="card-head">
                <span>{{ item.category }}<template v-if="item.custom"> · 自定义</template></span>
                <div class="direction-card-tools">
                  <M3IconButton :label="comparedDirectionIds.includes(item.id) ? `移出对比：${item.name}` : `加入对比：${item.name}`" :selected="comparedDirectionIds.includes(item.id)" @click="toggleDirectionCompare(item)"><GitCompareArrows :size="18" /></M3IconButton>
                  <M3IconButton :label="item.favorite ? '取消收藏' : '收藏方向'" :selected="item.favorite" @click="toggleDirectionFavorite(item)">
                    <BookmarkCheck v-if="item.favorite" :size="18" />
                    <Bookmark v-else :size="18" />
                  </M3IconButton>
                </div>
              </div>
              <CareerVisual class="direction-card-visual" :visual="getCareerAsset(item.category).visual" :label="item.name" compact />
              <h2>{{ item.name }}</h2>
              <p>{{ item.summary }}</p>
              <div class="tag-row"><span v-for="skill in item.commonSkills.slice(0, 3)" :key="skill">{{ skill }}</span></div>
              <footer>
                <M3Button variant="text" @click="openDirectionDetail(item)">查看详情<ChevronRight :size="15" /></M3Button>
                <M3Button variant="outlined" type="button" class="compact" @click="openDirectionDialog(item)"><Plus :size="15" />加入项目</M3Button>
              </footer>
            </M3Card>
          </TransitionGroup>
        </div>
        <M3Card v-if="comparedDirections.length" tag="section" variant="elevated" class="direction-compare-bar" aria-label="已选职业方向对比">
          <div class="direction-compare-selection">
            <span>快速对比</span>
            <div><M3Chip v-for="item in comparedDirections" :key="item.id" :label="item.name" /></div>
          </div>
          <div class="direction-compare-actions">
            <M3Button variant="text" type="button" @click="comparedDirectionIds = []">清空</M3Button>
            <M3Button type="button" :disabled="comparedDirections.length < 2" @click="openDirectionComparison"><GitCompareArrows :size="17" />对比 {{ comparedDirections.length }} 个方向</M3Button>
          </div>
        </M3Card>
        </div>

        <div v-else key="jobs" class="explore-view" data-explore-view="jobs">
        <M3Card tag="div" class="job-filters explore-motion-group">
          <label><MapPin :size="16" /><M3Select v-model="city"><option value="">全部城市</option><option v-for="item in cities" :key="item">{{ item }}</option></M3Select></label>
          <label><SlidersHorizontal :size="16" /><M3Select v-model="jobDirection"><option value="">全部岗位方向</option><option v-for="item in jobDirections" :key="item">{{ item }}</option></M3Select></label>
          <label><M3Select v-model="salaryBand"><option v-for="(item, key) in salaryBands" :key="key" :value="key === 'any' ? '' : key">{{ item.label }}</option></M3Select></label>
          <label><M3Select v-model="experienceLevel"><option value="">全部经验</option><option v-for="item in experienceOptions" :key="item">{{ item }}</option></M3Select></label>
          <span>共 {{ jobTotal }} 个岗位样本</span>
        </M3Card>

        <div class="jobs-layout explore-motion-group">
          <M3Card tag="section" class="job-list loading-host">
            <M3ProgressOverlay :visible="loading" label="正在加载招聘岗位" />
            <article v-for="job in jobs" :key="job.id" :class="{ selected: selectedJob?.id === job.id }" @click="openJob(job)">
              <div class="job-main"><div><h2>{{ job.jobName }}</h2><p>{{ job.companyName }} · {{ job.location || '地点未知' }}</p></div><strong>{{ job.salaryRange || '薪资未知' }}</strong></div>
              <div class="tag-row"><span v-for="tag in (job.tags || []).slice(0, 4)" :key="tag">{{ tag }}</span><span v-if="job.industry">{{ job.industry }}</span></div>
              <div class="job-actions" @click.stop>
                <M3IconButton :label="favoriteJobIds.has(job.id) ? '取消收藏' : '收藏岗位'" :selected="favoriteJobIds.has(job.id)" @click="toggleJobFavorite(job)"><HeartOff v-if="favoriteJobIds.has(job.id)" :size="17" /><Heart v-else :size="17" /></M3IconButton>
                <M3Button :variant="targetJobIds.has(job.id) ? 'tonal' : 'text'" @click="toggleTargetJob(job)"><Target :size="16" />{{ targetJobIds.has(job.id) ? '目标岗位' : '设为目标' }}</M3Button>
                <M3Button :variant="comparedJobs.some((item) => item.id === job.id) ? 'tonal' : 'text'" @click="toggleCompare(job)"><GitCompareArrows :size="16" />比较</M3Button>
                <M3Button variant="text" @click="openJobDialog(job)"><Plus :size="16" />加入项目</M3Button>
              </div>
            </article>
            <M3Pagination v-model:page="page" class="pagination" :total-pages="totalPages" label="招聘岗位分页" />
          </M3Card>

          <M3Card tag="aside" variant="outlined" class="detail-pane job-detail-pane">
            <template v-if="selectedJob">
              <header class="job-detail-header">
                <div class="job-title-copy">
                  <span class="job-kicker">招聘岗位</span>
                  <h2>{{ selectedJob.jobName }}</h2>
                  <p><span><Building2 :size="15" />{{ selectedJob.companyName }}</span><span><MapPin :size="15" />{{ selectedJob.location || '地点未知' }}</span></p>
                </div>
                <M3IconButton label="关闭详情" @click="closeJob"><X :size="18" /></M3IconButton>
              </header>
              <div v-if="selectedJob.tags?.length" class="job-detail-tags"><span v-for="tag in selectedJob.tags.slice(0, 5)" :key="tag">{{ tag }}</span></div>
              <section class="job-fact-grid" aria-label="岗位条件">
                <div class="salary-fact"><span>薪资范围</span><strong>{{ selectedJob.salaryRange || '未知' }}</strong></div>
                <div><span><Layers3 :size="15" />职业方向</span><strong>{{ selectedJob.industry || '未知' }}</strong></div>
                <div><span><Timer :size="15" />经验要求</span><strong>{{ selectedJob.experienceLevel || '未知' }}</strong></div>
                <div><span><GraduationCap :size="15" />学历要求</span><strong>{{ selectedJob.education || '未知' }}</strong></div>
              </section>
              <section class="job-source-panel">
                <header><div><Database :size="17" /><strong>数据来源</strong></div><span :class="{ stale: sourceWarning(selectedJob) }">{{ sourceWarning(selectedJob) ? '建议复核' : '当前样本' }}</span></header>
                <div class="source-details">
                  <div><span>来源平台</span><a v-if="selectedJob.jobSourceUrl" :href="selectedJob.jobSourceUrl" target="_blank" rel="noopener noreferrer">{{ sourceLabel(selectedJob) }}</a><strong v-else>{{ sourceLabel(selectedJob) }}</strong></div>
                  <div><span><CalendarClock :size="14" />更新时间</span><time>{{ sourceDate(selectedJob) || '未提供' }}</time></div>
                </div>
              </section>
              <p v-if="sourceWarning(selectedJob)" class="source-warning"><TriangleAlert :size="17" />{{ sourceWarning(selectedJob) }}</p>
              <section class="match-breakdown">
                <h3>个人证据匹配</h3>
                <div class="match-groups">
                  <article class="match-existing"><strong>已有证据</strong><ul v-if="jobEvidenceMatch.existing.length"><li v-for="item in jobEvidenceMatch.existing" :key="item">{{ item }}</li></ul><p v-else>暂未发现与结构化技能标签直接对应的个人证据。</p></article>
                  <article class="match-missing"><strong>缺少证据</strong><ul v-if="jobEvidenceMatch.missing.length"><li v-for="item in jobEvidenceMatch.missing" :key="item">{{ item }}</li></ul><p v-else>当前没有可明确列出的结构化技能缺口。</p></article>
                  <article class="match-uncertain"><strong>尚不确定</strong><ul><li v-for="item in jobEvidenceMatch.uncertain" :key="item">{{ item }}</li></ul></article>
                </div>
              </section>
              <section><h3>招聘原始描述</h3><p class="job-copy">{{ selectedJob.jobDetails || '该样本未提供完整岗位描述，不能据此推断职责或要求。' }}</p></section>
              <M3Button class="full-button" variant="outlined" type="button" @click="showResumeCompareDialog = true"><FileSearch :size="16" />使用简历对照这份 JD</M3Button>
              <M3Button class="full-button" type="button" @click="openJobDialog(selectedJob)"><Plus :size="16" />作为岗位样本加入项目</M3Button>
            </template>
            <div v-else class="empty-detail"><BriefcaseBusiness :size="28" /><strong>选择一个招聘岗位</strong><span>查看职责、要求、来源和更新时间。</span></div>
          </M3Card>
        </div>

        <M3Card tag="section" v-if="comparedJobs.length" class="compare-tray explore-motion-group">
          <header><div><GitCompareArrows :size="18" /><strong>岗位比较</strong><span>{{ comparedJobs.length }} / 3</span></div><M3IconButton label="清空比较" @click="comparedJobs = []"><X :size="17" /></M3IconButton></header>
          <div class="compare-table" :style="{ '--compare-count': comparedJobs.length }">
            <div class="compare-labels"><span>岗位</span><span>公司</span><span>城市</span><span>薪资</span><span>学历</span><span>经验</span><span>技能标签</span><span>职责/岗位原文</span></div>
            <div v-for="job in comparedJobs" :key="job.id" class="compare-column"><strong>{{ job.jobName }}</strong><span>{{ job.companyName }}</span><span>{{ job.location || '未知' }}</span><span>{{ job.salaryRange || '未知' }}</span><span>{{ job.education || '未知' }}</span><span>{{ job.experienceLevel || '未知' }}</span><span>{{ (job.tags || []).slice(0, 6).join('、') || '未知' }}</span><span>{{ compactJobText(job) }}</span></div>
          </div>
        </M3Card>
        </div>
      </Transition>
    </div>

    <M3Dialog v-model="showDirectionDialog" title="加入决策项目">
      <div v-if="projects.length" class="dialog-form">
        <p>将“{{ selectedDirection?.name }}”作为候选方向加入：</p>
        <label class="field-label">决策项目<M3Select v-model="targetProjectId" ><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.title }}</option></M3Select></label>
      </div>
      <div v-else class="dialog-empty"><p>你还没有决策项目。</p><M3Button type="button" @click="createProject">创建第一个项目</M3Button></div>
      <template #actions><M3Button variant="outlined" type="button" @click="showDirectionDialog = false">取消</M3Button><M3Button v-if="projects.length" type="button" :disabled="savingLink" @click="addDirectionToProject">确认加入</M3Button></template>
    </M3Dialog>

    <M3Dialog v-model="showJobDialog" title="加入岗位样本">
      <div v-if="projects.length" class="dialog-form">
        <p>“{{ selectedJob?.jobName }}”将用于验证某个候选方向。</p>
        <label class="field-label">决策项目<M3Select v-model="targetProjectId" ><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.title }}</option></M3Select></label>
        <label class="field-label">验证候选<M3Select v-model="targetCandidateId" ><option v-for="candidate in targetCandidates" :key="candidate.id" :value="candidate.id">{{ candidate.name }}</option></M3Select></label>
        <p v-if="!targetCandidates.length" class="warning-note">这个项目还没有候选方向，请先在职业方向标签中加入候选。</p>
      </div>
      <div v-else class="dialog-empty"><p>你还没有决策项目。</p><M3Button type="button" @click="createProject">创建第一个项目</M3Button></div>
      <template #actions><M3Button variant="outlined" type="button" @click="showJobDialog = false">取消</M3Button><M3Button v-if="projects.length" type="button" :disabled="savingLink || !targetCandidateId" @click="addJobToProject">确认加入</M3Button></template>
    </M3Dialog>

    <M3Dialog v-model="showResumeCompareDialog" title="简历与目标 JD 对照">
      <div class="resume-compare-dialog">
        <p>当前岗位：<strong>{{ selectedJob?.jobName }}</strong><template v-if="selectedJob"> · {{ selectedJob.companyName }}</template></p>
        <M3TextArea v-model="resumeCompareText" class="resume-text-area" :rows="9" maxlength="20000" label="粘贴简历文本" placeholder="粘贴简历中的技能、项目和经历。内容只在当前页面本地对照，不会自动保存。" />
        <section v-if="resumeComparison" class="resume-compare-result">
          <header><div><span>结构化要求覆盖</span><strong>{{ resumeComparison.score }}%</strong></div><p>仅表示简历文字是否出现对应要求，不代表实际能力或录用概率。</p></header>
          <div class="resume-match-columns">
            <article><h3>简历中已出现</h3><div class="tag-row"><span v-for="item in resumeComparison.matched" :key="item">{{ item }}</span><p v-if="!resumeComparison.matched.length">暂未发现直接关键词。</p></div></article>
            <article><h3>建议核对或补充</h3><div class="tag-row missing-tags"><span v-for="item in resumeComparison.missing" :key="item">{{ item }}</span><p v-if="!resumeComparison.missing.length">结构化要求均有文字命中，请继续核对证据强度。</p></div></article>
          </div>
        </section>
      </div>
      <template #actions><M3Button type="button" @click="showResumeCompareDialog = false">完成对照</M3Button></template>
    </M3Dialog>

    <M3Dialog v-model="showCustomDirectionDialog" title="自定义职业方向">
      <div class="dialog-grid two-column-dialog">
        <label class="field-label">方向名称<M3TextField v-model="customDirectionForm.name"  placeholder="例如：科研软件工程" /></label>
        <label class="field-label">所属分类<M3TextField v-model="customDirectionForm.category"  placeholder="例如：技术研发" /></label>
        <label class="field-label full-dialog-field">方向简介<M3TextArea v-model="customDirectionForm.summary"  placeholder="说明这个方向解决什么问题，不确定的信息可以明确写待验证"></M3TextArea></label>
        <label class="field-label">典型工作<M3TextField v-model="customDirectionForm.typicalWork"  placeholder="用逗号分隔" /></label>
        <label class="field-label">常见能力<M3TextField v-model="customDirectionForm.commonSkills"  placeholder="用逗号分隔" /></label>
        <label class="field-label">成长路径<M3TextField v-model="customDirectionForm.growthPath"  placeholder="用逗号分隔" /></label>
        <label class="field-label">常见误区<M3TextField v-model="customDirectionForm.misconceptions"  placeholder="用逗号分隔" /></label>
        <label class="field-label">适合专业标签<M3TextField v-model="customDirectionForm.majorTags"  placeholder="用逗号分隔" /></label>
        <label class="field-label">行业标签<M3TextField v-model="customDirectionForm.industryTags"  placeholder="用逗号分隔" /></label>
        <label class="field-label full-dialog-field">工作方式标签<M3TextField v-model="customDirectionForm.workTypes"  placeholder="例如：工程、研究、协作" /></label>
      </div>
      <template #actions><M3Button variant="outlined" type="button" @click="showCustomDirectionDialog = false">取消</M3Button><M3Button type="button" :disabled="savingDirection" @click="saveCustomDirection">保存方向</M3Button></template>
    </M3Dialog>
  </div>
</template>

<style scoped>
.explore-shell { max-width: 1280px; }
.explore-tabs { margin-top: 24px; }
.explore-view { min-width: 0; }
.explore-fade-through-enter-active { animation: explore-fade-through-enter var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate) both; }
.explore-fade-through-leave-active { animation: explore-fade-through-leave var(--md-sys-motion-duration-short2) var(--md-sys-motion-easing-emphasized-accelerate) both; }
.explore-fade-through-enter-active .explore-motion-group { animation: explore-motion-group-enter var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized-decelerate) both; }
.explore-fade-through-enter-active .explore-motion-group:nth-child(2) { animation-delay: 40ms; }
.explore-fade-through-enter-active .explore-motion-group:nth-child(3) { animation-delay: 80ms; }
@keyframes explore-fade-through-enter { from { opacity: 0; } to { opacity: 1; } }
@keyframes explore-fade-through-leave { from { opacity: 1; } to { opacity: 0; } }
@keyframes explore-motion-group-enter { from { transform: translateY(var(--career-spacing-2)); } to { transform: translateY(0); } }
.search-row { display: flex; gap: 10px; max-width: 720px; margin: 22px 0; }
.search-box { display: grid; flex: 1; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 9px; min-width: 0; }
.filter-strip { display: flex; align-items: center; gap: 8px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-inline: contain; margin-bottom: 18px; padding-bottom: 4px; scrollbar-width: thin; }
.filter-strip > * { flex: 0 0 auto; }
.direction-filters { display: flex; align-items: center; gap: 10px; margin: -4px 0 18px; padding: 11px 12px; }
.direction-filters label { display: flex; align-items: center; gap: 7px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.direction-filters label > :last-child { min-width: 140px; }
.direction-filters > :last-child { margin-left: auto; }
.explore-layout, .jobs-layout { display: grid; gap: 22px; align-items: start; }
.jobs-layout { grid-template-columns: minmax(0, 1fr) 420px; }
.direction-explore-layout { min-width: 0; padding-bottom: 96px; }
.direction-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.direction-list-enter-active, .direction-list-leave-active, .direction-list-move { transition: opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized-decelerate), transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate); }
.direction-list-enter-from, .direction-list-leave-to { opacity: 0; transform: translateY(var(--career-spacing-2)); }
.direction-card { display: grid; min-height: 290px; gap: 12px; padding: 18px; }
.direction-card.compared { outline: 2px solid var(--md-sys-color-primary); outline-offset: -2px; background: var(--md-sys-color-primary-container); }
.direction-card-tools { display: flex; align-items: center; gap: 2px; }
.direction-card-visual { margin: 0 -2px; }
.card-head, .detail-title, .compare-tray header, .job-main, .job-actions, .pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.card-head { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.direction-card h2, .job-list h2 { margin: 0; font-size: var(--md-sys-typescale-title-medium-size); }
.direction-card p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.6; }
.tag-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tag-row span { border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); padding: 4px 7px; font-size: var(--md-sys-typescale-label-small-size); }
.direction-card footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; }
.direction-compare-bar { position: fixed; z-index: 82; right: 96px; bottom: 24px; left: 244px; display: flex; min-width: 0; max-width: 1120px; align-items: center; justify-content: space-between; gap: 18px; margin: 0 auto; border: 1px solid var(--md-sys-color-outline-variant); padding: 12px 14px; }
.direction-compare-selection { display: flex; min-width: 0; align-items: center; gap: 12px; }
.direction-compare-selection > span { flex: none; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-large-size); font-weight: 600; }
.direction-compare-selection > div { display: flex; min-width: 0; gap: 6px; overflow-x: auto; scrollbar-width: thin; }
.direction-compare-actions { display: flex; flex: none; align-items: center; gap: 6px; }
.compact { min-height: 34px; padding: 0 10px; font-size: var(--md-sys-typescale-body-small-size); }
.detail-pane { position: sticky; top: 86px; min-height: 420px; padding: 20px; }
.detail-title span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); }
.detail-title h2 { margin: 4px 0 0; font-size: var(--md-sys-typescale-title-large-size); }
.detail-summary, .detail-pane > p { color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
.detail-pane section { margin-top: 22px; }
.detail-pane h3 { margin: 0 0 9px; font-size: var(--md-sys-typescale-body-medium-size); }
.detail-pane ul, .detail-pane ol { display: grid; gap: 7px; margin: 0; padding-left: 20px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; }
.full-button { width: 100%; margin-top: 24px; }
.empty-detail { display: flex; min-height: 370px; align-items: center; justify-content: center; flex-direction: column; gap: 10px; color: var(--md-sys-color-on-surface-variant); text-align: center; }
.empty-detail span { max-width: 240px; font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; }
.job-filters { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px; }
.job-filters label { display: flex; align-items: center; gap: 7px; border-right: 1px solid var(--md-sys-color-outline-variant); padding-right: 12px; }
.job-filters label > :last-child { width: 180px; }
.job-filters > span { margin-left: auto; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.job-list { overflow: hidden; }
.job-list article { display: grid; gap: 12px; padding: 17px 18px; border-bottom: 1px solid var(--md-sys-color-outline-variant); cursor: pointer; }
.job-list article:hover, .job-list article.selected { background: var(--md-sys-color-surface-container); }
.job-main p { margin: 5px 0 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); }
.job-main > strong { color: var(--md-sys-color-tertiary); font-size: var(--md-sys-typescale-body-medium-size); }
.job-actions { justify-content: flex-end; gap: 4px; }
.pagination { justify-content: center; padding: 16px; }
.pagination span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.job-detail-pane { overflow: hidden; padding-right: 76px; background: color-mix(in srgb, var(--md-sys-color-surface) 88%, transparent); }
.job-detail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.job-title-copy { min-width: 0; }
.job-kicker { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-medium-size); font-weight: 600; }
.job-title-copy h2 { margin: 6px 0 9px; font-size: var(--md-sys-typescale-headline-small-size); line-height: var(--md-sys-typescale-headline-small-line-height); overflow-wrap: anywhere; }
.job-title-copy p { display: flex; flex-wrap: wrap; gap: 7px 13px; margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.job-title-copy p span { display: inline-flex; align-items: center; gap: 5px; }
.job-detail-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
.job-detail-tags span { border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); padding: 4px 7px; font-size: var(--md-sys-typescale-label-small-size); }
.job-detail-pane .job-fact-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; margin-top: 20px; border-top: 1px solid var(--md-sys-color-outline-variant); border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.job-fact-grid > div { display: grid; min-width: 0; gap: 5px; padding: 14px 12px 14px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.job-fact-grid > div:nth-child(odd) { border-right: 1px solid var(--md-sys-color-outline-variant); }
.job-fact-grid > div:nth-child(even) { padding-right: 0; padding-left: 14px; }
.job-fact-grid > div:nth-last-child(-n + 2) { border-bottom: 0; }
.job-fact-grid span { display: flex; align-items: center; gap: 5px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.job-fact-grid strong { overflow-wrap: anywhere; font-size: var(--md-sys-typescale-body-medium-size); font-weight: 600; }
.job-fact-grid .salary-fact strong { color: var(--md-sys-color-tertiary); font-size: var(--md-sys-typescale-title-medium-size); }
.job-detail-pane .job-source-panel { margin-top: 20px; }
.job-source-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.job-source-panel > header > div { display: flex; align-items: center; gap: 7px; }
.job-source-panel > header > span { border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); padding: 4px 8px; font-size: var(--md-sys-typescale-label-small-size); }
.job-source-panel > header > span.stale { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
.source-details { display: grid; gap: 9px; margin-top: 11px; }
.source-details > div { display: flex; align-items: center; justify-content: space-between; gap: 14px; font-size: var(--md-sys-typescale-body-small-size); }
.source-details span { display: inline-flex; align-items: center; gap: 5px; color: var(--md-sys-color-on-surface-variant); }
.source-details a { color: var(--md-sys-color-primary); font-weight: 600; overflow-wrap: anywhere; }
.source-details time, .source-details strong { font-weight: 500; text-align: right; }
.source-warning { display: flex; align-items: flex-start; gap: 8px; margin: 16px 0 0; border-left: 3px solid var(--md-sys-color-tertiary); background: var(--md-sys-color-tertiary-container); padding: 11px 12px; color: var(--md-sys-color-on-tertiary-container); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.source-warning svg { flex: none; margin-top: 1px; }
.job-copy { max-height: 240px; overflow-y: auto; white-space: pre-line; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.65; }
.match-breakdown { border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 18px; }
.match-groups { display: grid; gap: 13px; }
.match-groups article { border-left: 3px solid var(--md-sys-color-outline-variant); padding-left: 11px; }
.match-groups article.match-existing { border-left-color: var(--career-sys-color-success); }
.match-groups article.match-missing { border-left-color: var(--md-sys-color-error); }
.match-groups article.match-uncertain { border-left-color: var(--md-sys-color-tertiary); }
.match-groups strong { font-size: var(--md-sys-typescale-body-small-size); }
.match-groups ul { margin-top: 7px; }
.match-groups p { margin: 7px 0 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.55; }
.compare-tray { margin-top: 22px; padding: 18px; }
.compare-tray header > div { display: flex; align-items: center; gap: 8px; }
.compare-tray header span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.compare-table { display: grid; grid-template-columns: 120px repeat(var(--compare-count), minmax(180px, 1fr)); overflow-x: auto; margin-top: 16px; border: 1px solid var(--md-sys-color-outline-variant); }
.compare-labels, .compare-column { display: grid; grid-template-rows: repeat(8, minmax(48px, auto)); }
.compare-labels > *, .compare-column > * { display: flex; align-items: center; border-bottom: 1px solid var(--md-sys-color-outline-variant); padding: 10px; font-size: var(--md-sys-typescale-body-small-size); line-height: 1.45; }
.compare-labels { background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); }
.compare-column { border-left: 1px solid var(--md-sys-color-outline-variant); }
.dialog-form { display: grid; gap: 16px; }
.dialog-form p, .dialog-empty p, .warning-note { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.dialog-empty { display: grid; justify-items: start; gap: 14px; }
.dialog-form .warning-note { color: var(--md-sys-color-error); font-size: var(--md-sys-typescale-body-medium-size); }
.dialog-grid { display: grid; gap: 14px; }
.resume-compare-dialog { display: grid; width: min(560px, calc(100vw - 80px)); max-width: 100%; min-width: 0; gap: 18px; }
.resume-compare-dialog > *, .resume-text-area { min-width: 0; max-width: 100%; }
.resume-compare-dialog > p, .resume-compare-result header p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
.resume-compare-result { display: grid; gap: 16px; padding-top: 16px; border-top: 1px solid var(--md-sys-color-outline-variant); }
.resume-compare-result header { display: grid; gap: 5px; }
.resume-compare-result header > div { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.resume-compare-result header span { color: var(--md-sys-color-on-surface-variant); }
.resume-compare-result header strong { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-headline-small-size); }
.resume-match-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.resume-match-columns article { padding: 14px; background: var(--md-sys-color-surface-container); border-radius: var(--md-sys-shape-corner-small); }
.resume-match-columns h3 { margin: 0 0 10px; font-size: var(--md-sys-typescale-title-small-size); }
.resume-match-columns p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.missing-tags span { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
.two-column-dialog { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.full-dialog-field { grid-column: 1 / -1; }
@media (max-width: 1100px) { .direction-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .direction-compare-bar { left: 104px; } }
@media (max-width: 980px) { .explore-layout, .jobs-layout { grid-template-columns: 1fr; } .detail-pane { position: static; min-height: 0; } .job-detail-pane { padding-right: 20px; } }
@media (max-width: 680px) { .direction-grid { grid-template-columns: 1fr; } .search-row { align-items: stretch; } .direction-filters { align-items: stretch; flex-direction: column; } .direction-filters label { justify-content: space-between; } .direction-filters label > :last-child { flex: 1; } .direction-filters > :last-child { align-self: flex-start; margin-left: 0; } .direction-compare-bar { right: 16px; bottom: 96px; left: 16px; align-items: stretch; flex-direction: column; gap: 10px; } .direction-compare-selection { align-items: flex-start; flex-direction: column; gap: 6px; } .direction-compare-selection > div { width: 100%; } .direction-compare-actions { justify-content: space-between; } .job-filters { align-items: stretch; flex-direction: column; } .job-filters label { border-right: 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); padding: 8px 0; } .job-filters label > :last-child { width: 100%; } .job-filters > span { margin-left: 0; } .job-main { align-items: flex-start; flex-direction: column; } .job-actions { justify-content: flex-start; flex-wrap: wrap; } .two-column-dialog, .resume-match-columns { grid-template-columns: 1fr; } .full-dialog-field { grid-column: auto; } .resume-compare-dialog { min-width: 0; } }
@media (prefers-reduced-motion: reduce) {
  .explore-fade-through-enter-active,
  .explore-fade-through-leave-active,
  .explore-fade-through-enter-active .explore-motion-group { animation: none; }
  .direction-list-enter-active, .direction-list-leave-active, .direction-list-move { transition: none; }
  .direction-list-enter-from, .direction-list-leave-to { opacity: 1; transform: none; }
}
</style>
