<!--
  页面：综合信息录入页（/entry/comprehensive）。
  职责：支持简历上传与详细表单填写，收集更全面的教育、经历、技能与目标岗位信息，
        以提升后续能力画像、岗位匹配与路径规划的准确度。
-->
<template>
  <div class="comprehensive-entry-page clay-page">
    <div class="page-container">
      <el-row :gutter="24">
        <el-col :xs="24" :md="16">
          <div class="left-section">
            <div class="card section mb-6">
              <div class="section-head">
                <div>
                  <div class="section-title">综合信息录入</div>
                  <div class="text-sub text-sm">
                    填写越完整，后续能力画像、岗位匹配与计划生成越准确
                  </div>
                </div>
              </div>
            </div>

            <EntryResumeUpload @upload="handleFileChange" />

            <EntryBasicInfoForm v-model="form.basic" />

            <EntryJobTargetForm v-model="form.target" :preset-cities="presetCities" />

            <EntrySkillsMaterials
              :skills="form.skills"
              :links="form.links"
              :certificates="form.certificates"
              :experiences="form.experiences"
              @add-skill="form.skills.push($event)"
              @remove-skill="handleCloseTag"
              @update:links="form.links = $event"
              @update-certificate="updateCertificate"
              @add-certificate="addCert"
              @remove-certificate="removeCert"
              @update-experience="updateExperience"
              @add-experience="addExp"
              @remove-experience="removeExp"
            />

            <div class="card section mb-6">
              <div class="section-head">
                <div class="section-title">深度测评问卷</div>
                <div class="text-sub text-sm">
                  包含基础信息、能力自评、职业偏好与价值观等模块，用于支持后续画像与推荐
                </div>
              </div>
              <DeepAssessmentQuestionnaire v-model="form.questionnaireAnswers" />
            </div>

            <EntryCareerValues v-model="form.values" />
          </div>
        </el-col>

        <el-col :xs="24" :md="8">
          <EntryProgressSidebar
            :basic-completion="basicCompletion"
            :target-completion="targetCompletion"
            :material-completion="materialCompletion"
            :questionnaire-completion="questionnaireCompletion"
            :mbti-completion="mbtiProgress"
            :overall-completion="overallCompletion(mbtiProgress)"
            :mbti-result="form.mbtiResult"
            :loading="submitting"
            @open-mbti="openMbti"
            @submit="submitAll"
          />
        </el-col>
      </el-row>

      <EntryMbtiDialog
        :visible="mbtiVisible"
        :started="mbtiStarted"
        :loading="loadingQuestions"
        :manual-input="mbtiManualInput"
        :is-manual-valid="isMbtiManualValid"
        :questions="questions"
        :current-index="currentQIndex"
        :answers="answers"
        @update:visible="mbtiVisible = $event"
        @start="startMbti"
        @manual-submit="applyManualMbti"
        @update:manual-input="mbtiManualInput = $event"
        @select-option="selectOption"
        @prev="prevQuestion"
        @next="nextQuestion"
        @finish="finishMbti"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useComprehensiveEntry, presetCities } from '@/composables/useComprehensiveEntry'
import { useMbtiAssessment } from '@/composables/useMbtiAssessment'
import DeepAssessmentQuestionnaire from '@/components/DeepAssessmentQuestionnaire.vue'
import EntryResumeUpload from '@/components/entry/EntryResumeUpload.vue'
import EntryBasicInfoForm from '@/components/entry/EntryBasicInfoForm.vue'
import EntryJobTargetForm from '@/components/entry/EntryJobTargetForm.vue'
import EntrySkillsMaterials from '@/components/entry/EntrySkillsMaterials.vue'
import EntryCareerValues from '@/components/entry/EntryCareerValues.vue'
import EntryProgressSidebar from '@/components/entry/EntryProgressSidebar.vue'
import EntryMbtiDialog from '@/components/entry/EntryMbtiDialog.vue'

defineOptions({
  name: 'ComprehensiveEntryPage'
})

const {
  form,
  submitting,
  handleCloseTag,
  addCert,
  removeCert,
  addExp,
  removeExp,
  handleFileChange,
  basicCompletion,
  targetCompletion,
  materialCompletion,
  questionnaireCompletion,
  overallCompletion,
  updateCertificate,
  updateExperience,
  submitAll
} = useComprehensiveEntry()

const mbtiResultRef = computed({
  get: () => form.mbtiResult,
  set: (val) => { form.mbtiResult = val }
})

const {
  mbtiVisible,
  mbtiStarted,
  mbtiManualInput,
  loadingQuestions,
  questions,
  currentQIndex,
  answers,
  isMbtiManualValid,
  mbtiProgress,
  openMbti,
  startMbti,
  applyManualMbti,
  selectOption,
  prevQuestion,
  nextQuestion,
  finishMbti
} = useMbtiAssessment(mbtiResultRef, (result: string) => {
  form.mbtiResult = result
})
</script>

<style scoped>
.comprehensive-entry-page {
  min-height: 100vh;
  background: transparent;
}

.section {
  padding: 24px;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  box-shadow: var(--clay-shadow);
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--clay-text);
  line-height: 1.2;
}
</style>
