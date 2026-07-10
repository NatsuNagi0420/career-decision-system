/**
 * useJobExploration - 岗位探索 Composable
 *
 * 职责：
 * - 岗位数据获取和筛选
 * - 推荐岗位加载
 * - 岗位对比和目标设置
 * - 筛选条件管理
 */
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  addTargetJobApi,
  getJobDetailApi,
  getJobFacetsApi,
  listTargetJobsApi,
  listJobsApi,
  recommendJobsByAiApi,
  type JobInfo
} from '@/api/jobs'
import {
  loadCapabilityProfileDraft,
  loadEntryDraft,
  loadTargetJob,
  saveTargetJob
} from '@/utils/storage'
import { activityMonitor } from '@/utils/activityMonitor'

export type JobListItem = Pick<
  JobInfo,
  'id' | 'jobName' | 'companyName' | 'location' | 'salaryRange' | 'industry' | 'jobSourceUrl'
>

export function useJobExploration() {
  const router = useRouter()
  const route = useRoute()

  // 筛选条件
  const filterCity = ref<string[]>([])
  const filterKeyword = ref('')
  const filterIndustry = ref<string[]>([])
  const filterCompanySize = ref<string[]>([])
  const filterCompanyType = ref<string[]>([])
  const salaryRange = ref<[number, number]>([0, 60])

  // 状态
  const activeTab = ref('all')
  const selectedIds = ref<string[]>([])
  const targetId = ref<string | null>(null)
  const activeJobId = ref<string | null>(null)

  // 用户画像状态
  const userProfile = ref({
    hasEntry: false,
    hasCapability: false,
    isComplete: false
  })

  // 岗位数据
  const jobs = ref<JobListItem[]>([])
  const recommendedJobs = ref<JobListItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  const page = ref(1)
  const pageSize = ref(12)

  // 筛选选项
  const facetLocations = ref<string[]>([])
  const facetIndustries = ref<string[]>([])
  const facetCompanySizes = ref<string[]>([])
  const facetCompanyTypes = ref<string[]>([])

  // 岗位详情
  const activeJobDetail = ref<JobInfo | null>(null)

  const toTargetJobPayload = (job: JobListItem | JobInfo, detail?: JobInfo | null) => ({
    id: String(job.id),
    jobName: job.jobName,
    companyName: job.companyName,
    city: job.location,
    salary: job.salaryRange,
    matchRate: 90,
    keyRequirements: extractRequirements(detail?.jobDetails || `${job.jobName} ${job.industry ?? ''}`),
    description: detail?.jobDetails || ''
  })

  // 计算属性
  const cities = computed(() => facetLocations.value)
  const industries = computed(() => facetIndustries.value)
  const companySizes = computed(() => facetCompanySizes.value)
  const companyTypes = computed(() => facetCompanyTypes.value)

  // 提取岗位要求关键词
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

  // 解析薪资范围
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

  // 判断薪资是否匹配
  const isSalaryMatched = (salary: string | undefined) => {
    if (!salary) return false
    const parsed = parseSalaryK(salary)
    if (parsed.min <= 0 && parsed.max <= 0) return true

    const [selectedMin, selectedMax] = salaryRange.value
    return parsed.max >= selectedMin && parsed.min <= selectedMax
  }

  // 过滤后的岗位
  const filteredJobs = computed(() => jobs.value.filter(j => isSalaryMatched(j.salaryRange)))
  const filteredRecommendedJobs = computed(() =>
    recommendedJobs.value.filter(j => isSalaryMatched(j.salaryRange))
  )

  // 优先岗位ID集合
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

  // 已选择的岗位
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

  // 当前激活的岗位
  const activeJob = computed(() => {
    const id = activeJobId.value
    if (!id) return null
    return (
      recommendedJobs.value.find(j => String(j.id) === id) ||
      jobs.value.find(j => String(j.id) === id) ||
      null
    )
  })

  // 是否为对比模式
  const isCompareMode = computed(() => selectedIds.value.length >= 2)

  // 高频技能（用于总览）
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

  // 设置激活岗位
  const setActive = (id: string) => {
    activeJobId.value = id
  }

  // 切换对比
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

  // 设置目标岗位
  const setTarget = async (job: JobListItem) => {
    targetId.value = String(job.id)
    const detail = await getJobDetailApi(job.id)
    const payload = toTargetJobPayload(job, detail)

    try {
      await addTargetJobApi(job.id)
    } catch (e) {
      console.warn('Failed to sync target job to backend:', e)
    }

    saveTargetJob(payload)
    activityMonitor.recordAction('选定目标岗位', { targetJobSelected: true })
    ElMessage.success('已设为目标岗位')
  }

  // 跳转到路径规划
  const gotoPlanning = () => {
    if (!targetId.value) {
      ElMessage.warning('请先确认一个目标岗位')
      return
    }
    router.push('/path-planning')
  }

  // 获取筛选选项
  const fetchFacets = async () => {
    const res = await getJobFacetsApi()
    facetLocations.value = res.locations
    facetIndustries.value = res.industries
    facetCompanySizes.value = res.companySizes
    facetCompanyTypes.value = res.companyTypes
  }

  // 获取岗位列表
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

  // 获取推荐岗位
  const fetchRecommendedJobs = async () => {
    const draft = loadCapabilityProfileDraft()
    const entry = loadEntryDraft()

    if (!draft) {
      recommendedJobs.value = []
      return
    }

    const fallback = (draft?.recommendedJobs ?? []) as Array<Record<string, unknown>>
    const preferredJobIds = fallback
      .map(j => Number(j?.id))
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

    recommendedJobs.value = fallback.map(j => ({
      id: j.id as number,
      jobName: j.jobName as string,
      companyName: j.companyName as string,
      location: j.location as string,
      salaryRange: j.salaryRange as string,
      industry: j.industry as string | undefined,
      jobSourceUrl: (j.jobSourceUrl as string | undefined) || ''
    }))
  }

  // 初始化
  const initialize = async () => {
    // 检测用户状态
    const draft = loadEntryDraft()
    const capability = loadCapabilityProfileDraft()

    userProfile.value = {
      hasEntry: !!draft,
      hasCapability: !!capability,
      isComplete: !!draft && !!capability
    }

    // 加载岗位数据
    await fetchFacets()
    await fetchJobs()

    // 只有完整画像才加载推荐
    if (userProfile.value.isComplete) {
      fetchRecommendedJobs()
    }

    try {
      const backendTargets = await listTargetJobsApi()
      const latestTarget = backendTargets[0]
      if (latestTarget) {
        targetId.value = String(latestTarget.id)
        saveTargetJob(toTargetJobPayload(latestTarget))
        return
      }
    } catch (e) {
      console.warn('Failed to load target jobs from backend:', e)
    }

    // 加载本地目标岗位
    const local = loadTargetJob()
    if (local?.id) {
      targetId.value = String(local.id)
    }
  }

  // 监听筛选条件变化
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

  // 监听分页变化
  watch(
    () => page.value,
    () => {
      fetchJobs()
    }
  )

  // 监听激活岗位变化
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

  return {
    // 筛选条件
    filterCity,
    filterKeyword,
    filterIndustry,
    filterCompanySize,
    filterCompanyType,
    salaryRange,

    // 状态
    activeTab,
    selectedIds,
    targetId,
    activeJobId,
    userProfile,

    // 数据
    jobs,
    recommendedJobs,
    total,
    loading,
    page,
    pageSize,

    // 筛选选项
    cities,
    industries,
    companySizes,
    companyTypes,

    // 计算属性
    filteredJobs,
    filteredRecommendedJobs,
    preferredIdSet,
    selectedJobs,
    activeJob,
    activeJobDetail,
    isCompareMode,
    overviewSkills,

    // 方法
    extractRequirements,
    setActive,
    toggleCompare,
    setTarget,
    gotoPlanning,
    initialize
  }
}
