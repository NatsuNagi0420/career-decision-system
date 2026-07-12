<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Award, BrainCircuit, BriefcaseBusiness, ExternalLink, FileText, Pencil, Plus, Save, ShieldCheck, Sparkles, Trash2, Upload, UserRound } from 'lucide-vue-next'
import { m3Message } from '@/design-system/services/feedback'
import { M3ProgressOverlay } from '@/design-system/components'
import { getProfileApi, saveProfileApi, type UserProfile } from '@/api/profile'
import { listMbtiHistoryApi, type MbtiHistoryItem } from '@/api/mbti'
import {
  createPersonalEvidenceApi,
  deletePersonalEvidenceApi,
  listPersonalEvidenceApi,
  updatePersonalEvidenceApi,
  type PersonalEvidence
} from '@/api/personalEvidence'
import { analyzeResumeTextApi, archiveResumeAnalysisApi, type ResumeAnalysis } from '@/api/resume'

defineOptions({ name: 'ProfilePage' })

const route = useRoute()
const loading = ref(true)
const saving = ref(false)
const profile = ref<UserProfile | null>(null)
const evidence = ref<PersonalEvidence[]>([])
const mbtiHistory = ref<MbtiHistoryItem[]>([])
const showEvidenceForm = ref(false)
const editingEvidenceId = ref<number | null>(null)
const resumeText = ref('')
const resumeAnalysis = ref<ResumeAnalysis | null>(null)
const resumeAnalyzing = ref(false)

const form = reactive({
  displayName: '', school: '', major: '', degree: '', grade: '', graduationDate: '', city: '',
  targetCitiesText: '', expectedSalary: '', currentConfusion: '', existingDirectionsText: '',
  weeklyHours: 0, skillsText: '', certificatesText: '', experiencesText: '', valuesText: '',
  preferredIndustriesText: '', preferredWorkModesText: '', constraintsText: '', externalAiConsent: false
})

const evidenceForm = reactive({
  evidenceType: 'project', title: '', description: '', roleName: '', resultSummary: '', linkUrl: '',
  proficiency: '', lastUsedAt: '', feedback: '', credibility: 'medium' as 'low' | 'medium' | 'high', occurredAt: ''
})

const split = (value: string) => value.split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean)

const hydrate = (data: UserProfile) => {
  profile.value = data
  form.displayName = data.displayName || ''
  form.school = data.school || ''
  form.major = data.major || ''
  form.degree = data.degree || ''
  form.grade = data.grade || ''
  form.graduationDate = data.graduationDate || ''
  form.city = data.city || ''
  form.targetCitiesText = data.targetCities.join('、')
  form.expectedSalary = data.expectedSalary || ''
  form.currentConfusion = data.currentConfusion || ''
  form.existingDirectionsText = data.existingDirections.join('、')
  form.weeklyHours = Math.round((data.weeklyAvailableMinutes || 0) / 60)
  form.skillsText = data.skills.join('、')
  form.certificatesText = data.certificates.join('、')
  form.experiencesText = data.experiences.join('\n')
  form.valuesText = data.values.join('、')
  form.preferredIndustriesText = data.preferredIndustries.join('、')
  form.preferredWorkModesText = data.preferredWorkModes.join('、')
  form.constraintsText = data.constraints.join('\n')
  form.externalAiConsent = data.externalAiConsent
}

const load = async () => {
  loading.value = true
  try {
    const [data, evidenceRows, mbtiRows] = await Promise.all([
      getProfileApi(),
      listPersonalEvidenceApi(),
      listMbtiHistoryApi()
    ])
    hydrate(data)
    evidence.value = evidenceRows
    mbtiHistory.value = mbtiRows
  } finally {
    loading.value = false
  }
}

const focusRequestedSection = async () => {
  await nextTick()
  const id = route.query.section === 'resume'
    ? 'resume-section'
    : route.query.section === 'experience' ? 'experience-section' : ''
  if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(async () => {
  await load()
  await focusRequestedSection()
})

const selectResumeFile = async (file: File) => {
  if (!/\.(txt|md)$/i.test(file.name)) {
    m3Message.warning('首版仅支持 txt 或 md 文本文件')
    return
  }
  const text = (await file.text()).trim()
  if (!text) {
    m3Message.warning('文件中没有可读取的文本')
    return
  }
  resumeText.value = text.slice(0, 20000)
}

const analyzeResume = async () => {
  if (!resumeText.value.trim()) {
    m3Message.warning('请先粘贴简历文本或选择 txt/md 文件')
    return
  }
  resumeAnalyzing.value = true
  try {
    const analysis = await analyzeResumeTextApi(resumeText.value)
    await archiveResumeAnalysisApi(resumeText.value, analysis, profile.value?.targetRole)
    resumeAnalysis.value = analysis
    m3Message.success('简历分析已保存到历史记录')
  } finally {
    resumeAnalyzing.value = false
  }
}

const save = async () => {
  saving.value = true
  try {
    const data = await saveProfileApi({
      displayName: form.displayName || null,
      identityType: 'student',
      school: form.school || null,
      major: form.major || null,
      degree: form.degree || null,
      grade: form.grade || null,
      graduationDate: form.graduationDate || null,
      city: form.city || null,
      targetCities: split(form.targetCitiesText),
      expectedSalary: form.expectedSalary || null,
      currentConfusion: form.currentConfusion || null,
      existingDirections: split(form.existingDirectionsText),
      weeklyAvailableMinutes: Math.max(0, form.weeklyHours * 60),
      skills: split(form.skillsText),
      certificates: split(form.certificatesText),
      experiences: form.experiencesText.split('\n').map((item) => item.trim()).filter(Boolean),
      values: split(form.valuesText),
      preferredIndustries: split(form.preferredIndustriesText),
      preferredWorkModes: split(form.preferredWorkModesText),
      constraints: form.constraintsText.split('\n').map((item) => item.trim()).filter(Boolean),
      externalAiConsent: form.externalAiConsent,
      expectedVersion: profile.value?.profileVersion
    })
    hydrate(data)
    m3Message.success('个人档案已保存')
  } finally {
    saving.value = false
  }
}

const addEvidence = async () => {
  if (!evidenceForm.title.trim()) {
    m3Message.warning('请填写证据标题')
    return
  }
  const payload = {
    evidenceType: evidenceForm.evidenceType,
    title: evidenceForm.title.trim(),
    description: evidenceForm.description || null,
    roleName: evidenceForm.roleName || null,
    resultSummary: evidenceForm.resultSummary || null,
    linkUrl: evidenceForm.linkUrl || null,
    proficiency: evidenceForm.proficiency || null,
    lastUsedAt: evidenceForm.lastUsedAt || null,
    feedback: evidenceForm.feedback || null,
    sourceType: 'user',
    credibility: evidenceForm.credibility,
    occurredAt: evidenceForm.occurredAt || null
  }
  const wasEditing = editingEvidenceId.value !== null
  const saved = editingEvidenceId.value
    ? await updatePersonalEvidenceApi(editingEvidenceId.value, payload)
    : await createPersonalEvidenceApi(payload)
  evidence.value = [saved, ...evidence.value.filter((item) => item.id !== saved.id)]
  resetEvidenceForm()
  showEvidenceForm.value = false
  m3Message.success(wasEditing ? '证据已更新' : '证据已添加')
}

const resetEvidenceForm = () => {
  editingEvidenceId.value = null
  Object.assign(evidenceForm, {
    evidenceType: 'project', title: '', description: '', roleName: '', resultSummary: '', linkUrl: '',
    proficiency: '', lastUsedAt: '', feedback: '', credibility: 'medium', occurredAt: ''
  })
}

const openNewEvidence = () => {
  resetEvidenceForm()
  showEvidenceForm.value = true
}

const editEvidence = (item: PersonalEvidence) => {
  editingEvidenceId.value = item.id
  Object.assign(evidenceForm, {
    evidenceType: item.evidenceType,
    title: item.title,
    description: item.description || '',
    roleName: item.roleName || '',
    resultSummary: item.resultSummary || '',
    linkUrl: item.linkUrl || '',
    proficiency: item.proficiency || '',
    lastUsedAt: item.lastUsedAt || '',
    feedback: item.feedback || '',
    credibility: item.credibility,
    occurredAt: item.occurredAt || ''
  })
  showEvidenceForm.value = true
}

const removeEvidence = async (id: number) => {
  await deletePersonalEvidenceApi(id)
  evidence.value = evidence.value.filter((item) => item.id !== id)
}

const sourceLabel: Record<string, string> = {
  user: '用户填写', assessment: '测评', resume: '简历解析', task_result: '任务成果', ai: 'AI 推断'
}

const formatAssessmentTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(new Date(value))
</script>

<template>
  <div class="product-page">
    <div class="product-shell profile-shell">
      <header class="product-header">
        <div>
          <h1>个人档案</h1>
          <p>这些信息会作为职业比较和行动计划的依据。AI 推断不会自动覆盖你确认过的事实。</p>
        </div>
        <M3Button type="button" :disabled="saving" @click="save">
          <Save :size="17" />{{ saving ? '保存中' : '保存档案' }}
        </M3Button>
      </header>

      <main class="profile-layout loading-host">
        <M3ProgressOverlay :visible="loading" label="正在加载个人档案" />
        <div class="profile-main">
          <section id="resume-section" class="profile-section resume-section">
            <div class="section-title"><FileText :size="19" /><div><h2>简历文本分析</h2><p>可粘贴文本或读取 txt/md；原文不会作为附件保存。</p></div></div>
            <div class="resume-input-row">
              <M3TextArea v-model="resumeText" class="resume-textarea" maxlength="20000" placeholder="粘贴简历文本"></M3TextArea>
              <div class="resume-actions">
                <M3FilePicker label="选择 txt/md" accept=".txt,.md,text/plain,text/markdown" @selected="selectResumeFile"><template #icon><Upload :size="16" /></template></M3FilePicker>
                <M3Button type="button" :disabled="resumeAnalyzing || !resumeText.trim()" @click="analyzeResume"><Sparkles :size="16" />{{ resumeAnalyzing ? '分析中' : '分析并归档' }}</M3Button>
              </div>
            </div>
            <div v-if="resumeAnalysis" class="resume-result">
              <dl><div><dt>综合</dt><dd>{{ resumeAnalysis.score }}</dd></div><div><dt>ATS</dt><dd>{{ resumeAnalysis.ats_score }}</dd></div><div><dt>关键词</dt><dd>{{ resumeAnalysis.keyword_match }}</dd></div></dl>
              <div><strong>待优化项</strong><ul><li v-for="item in resumeAnalysis.issues" :key="item">{{ item }}</li></ul></div>
              <div><strong>建议</strong><ul><li v-for="item in resumeAnalysis.suggestions" :key="item">{{ item }}</li></ul></div>
            </div>
          </section>

          <section class="profile-section">
            <div class="section-title"><UserRound :size="19" /><div><h2>基础情况</h2><p>用于理解你的教育阶段和现实约束。</p></div></div>
            <div class="form-grid two-columns">
              <label class="field-label">称呼<M3TextField v-model="form.displayName"  /></label>
              <label class="field-label">学校<M3TextField v-model="form.school"  /></label>
              <label class="field-label">专业<M3TextField v-model="form.major"  /></label>
              <label class="field-label">学历<M3TextField v-model="form.degree"  placeholder="例如：本科" /></label>
              <label class="field-label">年级
                <M3Select v-model="form.grade" ><option value="">未填写</option><option>大一</option><option>大二</option><option>大三</option><option>大四</option><option>研一</option><option>研二</option><option>研三</option><option>已毕业</option></M3Select>
              </label>
              <label class="field-label">毕业时间<M3DatePicker v-model="form.graduationDate" /></label>
              <label class="field-label">所在城市<M3TextField v-model="form.city"  /></label>
              <label class="field-label">目标城市<M3TextField v-model="form.targetCitiesText"  placeholder="用逗号分隔" /></label>
            </div>
          </section>

          <section class="profile-section">
            <div class="section-title"><BriefcaseBusiness :size="19" /><div><h2>职业偏好与约束</h2><p>记录你真正关心的条件，而不是替你直接做决定。</p></div></div>
            <div class="form-grid">
              <label class="field-label">当前困惑<M3TextArea v-model="form.currentConfusion" ></M3TextArea></label>
              <div class="form-grid two-columns">
                <label class="field-label">已有方向<M3TextField v-model="form.existingDirectionsText"  placeholder="最多 5 个，用逗号分隔" /></label>
                <label class="field-label">期望薪资<M3TextField v-model="form.expectedSalary"  placeholder="可留空" /></label>
                <label class="field-label">每周可投入时间<M3TextField v-model.number="form.weeklyHours"  type="number" min="0" max="168" /></label>
                <label class="field-label">价值观<M3TextField v-model="form.valuesText"  placeholder="成长、稳定、影响力等" /></label>
                <label class="field-label">偏好行业<M3TextField v-model="form.preferredIndustriesText"  placeholder="互联网、制造、教育等" /></label>
                <label class="field-label">偏好工作方式<M3TextField v-model="form.preferredWorkModesText"  placeholder="协作、研究、远程、现场等" /></label>
                <label class="field-label full-column">现实约束<M3TextArea v-model="form.constraintsText"  placeholder="每行一条，例如地域、经济、家庭或继续深造安排"></M3TextArea></label>
              </div>
            </div>
          </section>

          <section class="profile-section">
            <div class="section-title"><ShieldCheck :size="19" /><div><h2>AI 数据授权</h2><p>关闭时仍可使用本地规则建议，个人上下文不会发送给外部模型服务商。</p></div></div>
            <label class="consent-setting">
              <M3Switch v-model="form.externalAiConsent" label="允许调用外部 AI 模型" />
              <span><strong>允许调用外部 AI 模型</strong><small>仅发送当前功能所需的最小档案、决策或计划上下文；不会发送密码、Token 或未选中的完整资料。</small></span>
            </label>
          </section>

          <section id="experience-section" class="profile-section">
            <div class="section-title"><Award :size="19" /><div><h2>能力与经历摘要</h2><p>填写可验证的内容，具体证据可以在右侧单独维护。</p></div></div>
            <div class="form-grid two-columns">
              <label class="field-label">技能<M3TextField v-model="form.skillsText"  placeholder="Java、SQL、写作等" /></label>
              <label class="field-label">证书<M3TextField v-model="form.certificatesText"  /></label>
              <label class="field-label full-column">经历摘要<M3TextArea v-model="form.experiencesText"  placeholder="每行一条项目、实习或实践经历"></M3TextArea></label>
            </div>
          </section>

          <section class="profile-section">
            <div class="section-title"><BrainCircuit :size="19" /><div><h2>辅助测评</h2><p>测评只是理解偏好的补充信号，不会直接决定职业目标。</p></div></div>
            <div v-if="mbtiHistory.length" class="assessment-list">
              <article v-for="(item, index) in mbtiHistory" :key="item.id">
                <div><span>{{ index === 0 ? '最近结果' : '历史结果' }}</span><strong>MBTI · {{ item.type }}</strong><p>{{ item.description }}</p></div>
                <time :datetime="item.submittedAt">{{ formatAssessmentTime(item.submittedAt) }}</time>
              </article>
            </div>
            <div v-else class="assessment-empty"><span>还没有已保存的测评结果。</span><M3Button variant="outlined" href="/assessment/mbti">开始 MBTI 测评</M3Button></div>
          </section>
        </div>

        <M3Card tag="aside" class="evidence-panel">
          <div class="evidence-head">
            <div><h2>个人证据</h2><p>可在多个决策项目中复用。</p></div>
            <M3IconButton label="添加个人证据" @click="openNewEvidence"><Plus :size="18" /></M3IconButton>
          </div>

          <form v-if="showEvidenceForm" class="evidence-form" @submit.prevent="addEvidence">
            <h3>{{ editingEvidenceId ? '编辑个人证据' : '添加个人证据' }}</h3>
            <label class="field-label">类型<M3Select v-model="evidenceForm.evidenceType" ><option value="project">项目</option><option value="skill">技能</option><option value="internship">实习/实践</option><option value="course">课程</option><option value="certificate">证书</option><option value="award">获奖</option><option value="feedback">他人反馈</option><option value="constraint">现实约束</option></M3Select></label>
            <label class="field-label">标题<M3TextField v-model="evidenceForm.title"  /></label>
            <label class="field-label">过程或依据<M3TextArea v-model="evidenceForm.description" class="small-textarea"></M3TextArea></label>
            <label class="field-label">角色/职责<M3TextField v-model="evidenceForm.roleName"  placeholder="例如：后端开发、课程组长" /></label>
            <label class="field-label">结果摘要<M3TextArea v-model="evidenceForm.resultSummary" class="small-textarea" placeholder="产出了什么、解决了什么问题"></M3TextArea></label>
            <label class="field-label">成果链接<M3TextField v-model="evidenceForm.linkUrl"  type="url" placeholder="https://" /></label>
            <label class="field-label">技能熟练度<M3TextField v-model="evidenceForm.proficiency"  placeholder="入门、熟悉、熟练等，并在说明中写依据" /></label>
            <label class="field-label">最近使用时间<M3DatePicker v-model="evidenceForm.lastUsedAt" /></label>
            <label class="field-label">反馈<M3TextField v-model="evidenceForm.feedback"  placeholder="老师、同事或用户反馈" /></label>
            <label class="field-label">发生时间<M3DatePicker v-model="evidenceForm.occurredAt" /></label>
            <label class="field-label">可信度<M3Select v-model="evidenceForm.credibility" ><option value="high">高</option><option value="medium">中</option><option value="low">低</option></M3Select></label>
            <div class="evidence-form-actions"><M3Button variant="outlined" type="button" @click="showEvidenceForm = false">取消</M3Button><M3Button type="submit">{{ editingEvidenceId ? '保存修改' : '添加' }}</M3Button></div>
          </form>

          <div v-if="evidence.length" class="evidence-list">
            <article v-for="item in evidence" :key="item.id" class="evidence-item">
              <div class="evidence-meta"><span>{{ item.evidenceType }}</span><span>{{ sourceLabel[item.sourceType] || item.sourceType }}</span></div>
              <strong>{{ item.title }}</strong>
              <p v-if="item.description">{{ item.description }}</p>
              <p v-if="item.roleName"><strong>角色：</strong>{{ item.roleName }}</p>
              <p v-if="item.resultSummary"><strong>结果：</strong>{{ item.resultSummary }}</p>
              <p v-if="item.proficiency"><strong>熟练度：</strong>{{ item.proficiency }}<template v-if="item.lastUsedAt"> · 最近使用 {{ item.lastUsedAt }}</template></p>
              <p v-if="item.feedback"><strong>反馈：</strong>{{ item.feedback }}</p>
              <a v-if="item.linkUrl" :href="item.linkUrl" target="_blank" rel="noopener noreferrer">查看成果<ExternalLink :size="13" /></a>
              <div class="evidence-footer"><span>可信度：{{ item.credibility }}</span><span class="evidence-actions"><M3IconButton label="编辑证据" @click="editEvidence(item)"><Pencil :size="15" /></M3IconButton><M3IconButton class="destructive-icon" label="删除证据" @click="removeEvidence(item.id)"><Trash2 :size="15" /></M3IconButton></span></div>
            </article>
          </div>
          <p v-else class="empty-note">还没有个人证据。可先记录一个课程项目或实践成果。</p>
        </M3Card>
      </main>
    </div>
  </div>
</template>

<style scoped>
.profile-shell { max-width: 1180px; }
.profile-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; align-items: start; margin-top: 28px; }
.profile-main { display: grid; gap: 32px; }
.profile-section { padding-bottom: 30px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.resume-input-row { display: grid; gap: 10px; }
.resume-textarea { min-height: 180px; }
.resume-actions { display: flex; justify-content: flex-end; gap: 9px; }
.resume-result { display: grid; grid-template-columns: 180px repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 18px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 18px; }
.resume-result dl { display: grid; gap: 1px; margin: 0; background: var(--md-sys-color-outline-variant); }
.resume-result dl div { display: flex; justify-content: space-between; gap: 12px; background: var(--md-sys-color-surface-container-lowest); padding: 8px 0; }
.resume-result dt { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.resume-result dd { margin: 0; font-weight: 500; }
.resume-result strong { font-size: var(--md-sys-typescale-body-medium-size); }
.resume-result ul { display: grid; gap: 5px; margin: 8px 0 0; padding-left: 18px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.section-title { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 20px; color: var(--md-sys-color-primary); }
.section-title h2, .evidence-head h2 { margin: 0; color: var(--md-sys-color-on-surface); font-size: var(--md-sys-typescale-title-medium-size); }
.section-title p, .evidence-head p { margin: 5px 0 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; }
.form-grid { display: grid; gap: 16px; }
.two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.full-column { grid-column: 1 / -1; }
.consent-setting { display: flex; align-items: flex-start; gap: 11px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); padding: 15px; cursor: pointer; }
.consent-setting span { display: grid; gap: 5px; }
.consent-setting small { color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
.evidence-panel { position: sticky; top: 88px; padding: 20px; }
.evidence-head { display: flex; justify-content: space-between; gap: 16px; }
.evidence-form { display: grid; gap: 12px; margin-top: 18px; padding: 16px; background: var(--md-sys-color-surface-container); border-radius: var(--md-sys-shape-corner-small); }
.evidence-form h3 { margin: 0; font-size: var(--md-sys-typescale-title-medium-size); }
.evidence-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
.small-textarea { min-height: 78px; }
.evidence-list { display: grid; gap: 1px; margin-top: 18px; background: var(--md-sys-color-outline-variant); }
.evidence-item { display: grid; gap: 7px; padding: 14px 0; background: var(--md-sys-color-surface-container-lowest); }
.evidence-meta, .evidence-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.evidence-item p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; }
.evidence-item > a { display: inline-flex; align-items: center; gap: 4px; color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); text-decoration: none; }
.evidence-actions { display: inline-flex; gap: 4px; }
.destructive-icon { --md-icon-button-icon-color: var(--md-sys-color-error); }
.empty-note { margin-top: 22px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.6; }
.assessment-list { display: grid; gap: 1px; background: var(--md-sys-color-outline-variant); }
.assessment-list article { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 15px 0; background: var(--md-sys-color-surface-container-lowest); }
.assessment-list article > div { display: grid; gap: 5px; }
.assessment-list span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); }
.assessment-list p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; }
.assessment-list time { flex: none; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.assessment-empty { display: flex; align-items: center; justify-content: space-between; gap: 14px; color: var(--md-sys-color-on-surface-variant); }
@media (max-width: 900px) { .profile-layout { grid-template-columns: 1fr; } .evidence-panel { position: static; } }
@media (max-width: 620px) { .two-columns, .resume-result { grid-template-columns: 1fr; } .full-column { grid-column: auto; } .resume-actions { align-items: stretch; flex-direction: column; } .assessment-list article, .assessment-empty { align-items: flex-start; flex-direction: column; } }
</style>
