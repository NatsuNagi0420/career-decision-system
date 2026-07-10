package com.careerdecision.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.careerdecision.mobile.network.ArchivedPathPlan
import com.careerdecision.mobile.network.CareerApi
import com.careerdecision.mobile.network.CareerApiFactory
import com.careerdecision.mobile.network.CareerReport
import com.careerdecision.mobile.network.CareerReportRequest
import com.careerdecision.mobile.network.JobMatch
import com.careerdecision.mobile.network.JobRecommendationRequest
import com.careerdecision.mobile.network.JobSummary
import com.careerdecision.mobile.network.LoginRequest
import com.careerdecision.mobile.network.MbtiQuestion
import com.careerdecision.mobile.network.MbtiResult
import com.careerdecision.mobile.network.MbtiSubmitRequest
import com.careerdecision.mobile.network.PathPlan
import com.careerdecision.mobile.network.PathPlanArchiveRequest
import com.careerdecision.mobile.network.PathPlanRequest
import com.careerdecision.mobile.network.PathPlanSnapshot
import com.careerdecision.mobile.network.PathTaskStatusRequest
import com.careerdecision.mobile.network.RegisterRequest
import com.careerdecision.mobile.network.ReportArchiveRequest
import com.careerdecision.mobile.network.ReportSnapshot
import com.careerdecision.mobile.network.RefreshTokenRequest
import com.careerdecision.mobile.network.ResumeAnalysis
import com.careerdecision.mobile.network.ResumeAnalysisArchivePayload
import com.careerdecision.mobile.network.ResumeAnalysisArchiveRequest
import com.careerdecision.mobile.network.ResumeAnalysisRequest
import com.careerdecision.mobile.network.ResumeAnalysisSnapshot
import com.careerdecision.mobile.network.UserInfo
import com.careerdecision.mobile.network.UserProfile
import com.careerdecision.mobile.network.UserProfileRequest
import com.careerdecision.mobile.network.ApiException
import com.careerdecision.mobile.network.ArchivedResumeAnalysis
import com.careerdecision.mobile.network.normalizeNetworkError
import com.careerdecision.mobile.network.requireSuccess
import com.careerdecision.mobile.network.runApiCatching
import com.careerdecision.mobile.network.unwrap
import kotlinx.coroutines.launch

private val Cyan = Color(0xFF39C5BB)
private val Deep = Color(0xFF050B0D)
private val Panel = Color(0xFF10272A)
private val Warm = Color(0xFFFFCF5A)
private val MobileSampleResume = """
    AI 职业规划系统项目，使用 Kotlin Jetpack Compose、Vue 3、Spring Boot 和 Python FastAPI。
    负责移动端报告展示、岗位短名单、路径计划任务勾选，以及 Web 端职业画像和简历诊断流程。
    熟悉 Retrofit、MyBatis、MySQL、LLM 接口编排和结构化 JSON 输出，能把用户画像、岗位信息和行动计划串成完整闭环。
""".trimIndent()

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CareerTheme {
                Surface(color = Deep, modifier = Modifier.fillMaxSize()) {
                    CareerDecisionApp()
                }
            }
        }
    }
}

data class MobileState(
    val user: UserInfo? = null,
    val token: String? = null,
    val refreshToken: String? = null,
    val profile: UserProfile? = null,
    val jobs: List<JobSummary> = emptyList(),
    val favoriteJobs: List<JobSummary> = emptyList(),
    val targetJobs: List<JobSummary> = emptyList(),
    val recommendedJobs: List<JobMatch> = emptyList(),
    val questions: List<MbtiQuestion> = emptyList(),
    val mbtiResult: MbtiResult? = null,
    val report: CareerReport? = null,
    val archivedReport: ReportSnapshot? = null,
    val reports: List<ReportSnapshot> = emptyList(),
    val pathPlan: PathPlan? = null,
    val archivedPathPlan: ArchivedPathPlan? = null,
    val pathPlans: List<PathPlanSnapshot> = emptyList(),
    val resumeAnalysis: ResumeAnalysis? = null,
    val archivedResumeAnalysis: ArchivedResumeAnalysis? = null,
    val resumeAnalyses: List<ResumeAnalysisSnapshot> = emptyList(),
    val message: String = "连接后端后开始全链路体验",
    val loading: Boolean = false
)

class CareerViewModel(
    private val sessionStore: SessionGateway,
    apiFactory: (tokenProvider: () -> String?) -> CareerApi = CareerApiFactory::create
) : ViewModel() {
    private val savedSession = sessionStore.load()

    var state by mutableStateOf(
        MobileState(
            user = savedSession?.user,
            token = savedSession?.token,
            refreshToken = savedSession?.refreshToken,
            message = savedSession?.user?.let { "已恢复登录 ${it.username}" } ?: "连接后端后开始全链路体验"
        )
    )
        private set

    val answers = mutableStateMapOf<Int, String>()
    private val api = apiFactory { state.token }

    init {
        refreshCatalog()
    }

    fun refreshCatalog() = viewModelScope.launch {
        state = state.copy(loading = true, message = "同步岗位和题库")
        runApiCatching {
            val jobs = api.jobs(size = 8).unwrap().items
            val profile = authenticatedOrNull { api.profile().unwrap() }
            val favoriteJobs = authenticatedList { api.favoriteJobs().unwrap() }
            val targetJobs = authenticatedList { api.targetJobs().unwrap() }
            val reports = authenticatedReportPage()
            val pathPlans = authenticatedList { api.pathPlans().unwrap() }
            val resumeAnalyses = authenticatedList { api.resumeAnalyses().unwrap() }
            val recommendedJobs = api.recommendJobs(
                JobRecommendationRequest(
                    profile = mapOf(
                        "target_role" to "AI",
                        "skills" to listOf("Kotlin", "Spring Boot", "Python", "SQL")
                    ),
                    limit = 4
                )
            ).unwrap()
            val questions = api.mbtiQuestions().unwrap()
            state = state.copy(profile = profile, jobs = jobs, favoriteJobs = favoriteJobs, targetJobs = targetJobs, reports = reports, pathPlans = pathPlans, resumeAnalyses = resumeAnalyses, recommendedJobs = recommendedJobs, questions = questions, loading = false, message = "后端同步完成")
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "同步失败")
        }
    }

    fun registerAndLogin(username: String, password: String, confirmPassword: String, email: String?) {
        val cleanUsername = username.trim()
        val cleanEmail = email?.trim()?.takeIf { it.isNotBlank() }
        CareerValidators.validateRegistration(cleanUsername, password, confirmPassword, cleanEmail)?.let {
            state = state.copy(message = it)
            return
        }
        viewModelScope.launch {
            state = state.copy(loading = true, message = "注册中")
            runApiCatching {
                api.register(RegisterRequest(cleanUsername, password, confirmPassword, cleanEmail)).unwrap()
                val login = api.login(LoginRequest(cleanUsername, password)).unwrap()
                saveSession(login.token, login.refreshToken, login.user)
                state = state.copy(message = "同步收藏岗位")
                val profile = api.profile().unwrap()
                val favoriteJobs = api.favoriteJobs().unwrap()
                val targetJobs = api.targetJobs().unwrap()
                val reports = api.reports(type = "career_report").unwrap().items
                val pathPlans = api.pathPlans().unwrap()
                val resumeAnalyses = api.resumeAnalyses().unwrap()
                state = state.copy(profile = profile, favoriteJobs = favoriteJobs, targetJobs = targetJobs, reports = reports, pathPlans = pathPlans, resumeAnalyses = resumeAnalyses, loading = false, message = "已登录 ${login.user.username}")
            }.onFailure {
                state = state.copy(loading = false, message = it.message ?: "注册失败")
            }
        }
    }

    fun login(username: String, password: String) {
        val cleanUsername = username.trim()
        CareerValidators.validateLogin(cleanUsername, password)?.let {
            state = state.copy(message = it)
            return
        }
        viewModelScope.launch {
            state = state.copy(loading = true, message = "登录中")
            runApiCatching {
                val login = api.login(LoginRequest(cleanUsername, password)).unwrap()
                saveSession(login.token, login.refreshToken, login.user)
                state = state.copy(message = "同步收藏岗位")
                val profile = api.profile().unwrap()
                val favoriteJobs = api.favoriteJobs().unwrap()
                val targetJobs = api.targetJobs().unwrap()
                val reports = api.reports(type = "career_report").unwrap().items
                val pathPlans = api.pathPlans().unwrap()
                val resumeAnalyses = api.resumeAnalyses().unwrap()
                state = state.copy(profile = profile, favoriteJobs = favoriteJobs, targetJobs = targetJobs, reports = reports, pathPlans = pathPlans, resumeAnalyses = resumeAnalyses, loading = false, message = "已登录 ${login.user.username}")
            }.onFailure {
                state = state.copy(loading = false, message = it.message ?: "登录失败")
            }
        }
    }

    fun logout() = viewModelScope.launch {
        try {
            if (!state.token.isNullOrBlank()) {
                api.logout()
            }
        } catch (_: Exception) {
            // Local state is cleared even if the backend token is already invalid.
        } finally {
            sessionStore.clear()
            state = state.copy(
                user = null,
                token = null,
                refreshToken = null,
                profile = null,
                archivedReport = null,
                reports = emptyList(),
                archivedPathPlan = null,
                archivedResumeAnalysis = null,
                favoriteJobs = emptyList(),
                targetJobs = emptyList(),
                pathPlans = emptyList(),
                resumeAnalyses = emptyList(),
                loading = false,
                message = "已退出登录"
            )
        }
    }

    fun saveProfile(displayName: String, targetRole: String, skills: String) {
        if (state.user == null) {
            state = state.copy(message = "请先登录后保存画像")
            return
        }
        val cleanDisplayName = displayName.trim()
        val cleanTargetRole = targetRole.trim()
        val cleanSkills = CareerValidators.splitValues(skills)
        CareerValidators.validateProfile(cleanDisplayName, cleanTargetRole, cleanSkills)?.let {
            state = state.copy(message = it)
            return
        }
        viewModelScope.launch {
            state = state.copy(loading = true, message = "保存职业画像")
            runApiCatching {
                val profile = authenticated {
                    api.saveProfile(
                        UserProfileRequest(
                            displayName = cleanDisplayName.ifBlank { state.user?.username },
                            identityType = state.profile?.identityType ?: "student",
                            targetRole = cleanTargetRole.ifBlank { null },
                            skills = cleanSkills
                        )
                    ).unwrap()
                }
                state = state.copy(profile = profile, loading = false, message = "职业画像已保存")
            }.onFailure {
                state = state.copy(loading = false, message = it.message ?: "画像保存失败")
            }
        }
    }

    fun submitMbti() {
        if (state.questions.isEmpty()) {
            state = state.copy(message = "题库还没有加载完成")
            return
        }
        if (answers.size < state.questions.size) {
            state = state.copy(message = "请先完成所有 MBTI 题目")
            return
        }
        viewModelScope.launch {
            state = state.copy(loading = true, message = "提交 MBTI")
            runApiCatching {
                val result = api.submitMbti(MbtiSubmitRequest(answers.toMap(), state.user?.id)).unwrap()
                state = state.copy(mbtiResult = result, loading = false, message = "MBTI ${result.type} 已生成")
            }.onFailure {
                state = state.copy(loading = false, message = it.message ?: "测评失败")
            }
        }
    }

    fun analyzeResume(resumeText: String) {
        val cleanResume = resumeText.trim()
        CareerValidators.validateResume(cleanResume)?.let {
            state = state.copy(message = it)
            return
        }
        viewModelScope.launch {
            val user = state.user
            val targetJob = preferredTargetJob()
            val target = preferredTargetRole(targetJob)
            state = state.copy(loading = true, message = "分析简历")
            runApiCatching {
                val analysis = api.analyzeResume(
                    ResumeAnalysisRequest(
                        requestId = "android-resume-${System.currentTimeMillis()}",
                        userId = user?.id?.toString(),
                        targetRole = target,
                        resumeText = cleanResume
                    )
                ).unwrap()
                val resumeAnalyses = if (user != null) {
                    val archiveResult = authenticated {
                        val archivedResumeAnalysis = api.archiveResumeAnalysis(
                            ResumeAnalysisArchiveRequest(
                                targetRole = target,
                                resumeText = cleanResume,
                                agentRunId = analysis.agentRunId,
                                analysis = ResumeAnalysisArchivePayload(
                                    score = analysis.score,
                                    atsScore = analysis.atsScore,
                                    keywordMatch = analysis.keywordMatch,
                                    issues = analysis.issues,
                                    suggestions = analysis.suggestions,
                                    improvedFragments = analysis.improvedFragments
                                )
                            )
                        ).unwrap()
                        archivedResumeAnalysis to api.resumeAnalyses().unwrap()
                    }
                    state = state.copy(archivedResumeAnalysis = archiveResult.first)
                    archiveResult.second
                } else {
                    state.resumeAnalyses
                }
                state = state.copy(resumeAnalysis = analysis, resumeAnalyses = resumeAnalyses, loading = false, message = "简历诊断已生成${if (user != null) "并归档" else ""}")
            }.onFailure {
                state = state.copy(loading = false, message = it.message ?: "简历诊断失败")
            }
        }
    }

    fun toggleFavorite(jobId: Long) = viewModelScope.launch {
        if (state.user == null) {
            state = state.copy(message = "请先登录后收藏岗位")
            return@launch
        }
        state = state.copy(loading = true, message = "更新收藏岗位")
        runApiCatching {
            val isFavorite = state.favoriteJobs.any { it.id == jobId }
            val favoriteJobs = authenticated {
                if (isFavorite) {
                    api.removeFavoriteJob(jobId).unwrap()
                } else {
                    api.addFavoriteJob(jobId).unwrap()
                }
            }
            state = state.copy(favoriteJobs = favoriteJobs, loading = false, message = if (isFavorite) "已移出短名单" else "已加入短名单")
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "收藏更新失败")
        }
    }

    fun toggleTarget(jobId: Long) = viewModelScope.launch {
        if (state.user == null) {
            state = state.copy(message = "请先登录后设置目标岗位")
            return@launch
        }
        state = state.copy(loading = true, message = "更新目标岗位")
        runApiCatching {
            val isTarget = state.targetJobs.any { it.id == jobId }
            val targetJobs = authenticated {
                if (isTarget) {
                    api.removeTargetJob(jobId).unwrap()
                } else {
                    api.addTargetJob(jobId).unwrap()
                }
            }
            state = state.copy(targetJobs = targetJobs, loading = false, message = if (isTarget) "已移出目标岗位" else "已设为目标岗位")
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "目标岗位更新失败")
        }
    }

    fun answer(questionId: Int, code: String) {
        answers[questionId] = code
    }

    fun generateReport() = viewModelScope.launch {
        val user = state.user
        val targetJob = preferredTargetJob()
        val target = preferredTargetRole(targetJob)
        state = state.copy(loading = true, message = "生成 AI 报告")
        runApiCatching {
            val report = api.generateReport(
                CareerReportRequest(
                    requestId = "android-${System.currentTimeMillis()}",
                    userId = user?.id?.toString(),
                    profile = agentProfile(target, targetJob),
                    assessment = mapOf(
                        "mbti_type" to (state.mbtiResult?.type ?: "INTJ"),
                        "strengths" to listOf("行动目标清晰", "愿意持续迭代")
                    )
                )
            ).unwrap()
            var archivedReport: ReportSnapshot? = null
            val reports = if (user != null) {
                val archiveResult = authenticated {
                    val archived = api.archiveReport(
                        ReportArchiveRequest(
                            type = "career_report",
                            title = "${target}移动端报告",
                            summary = report.summary,
                            content = CareerApiFactory.gson.toJson(report),
                            agentRunId = report.agentRunId
                        )
                    ).unwrap()
                    archived to api.reports(type = "career_report").unwrap().items
                }
                archivedReport = archiveResult.first
                archiveResult.second
            } else {
                state.reports
            }
            state = state.copy(report = report, archivedReport = archivedReport, reports = reports, loading = false, message = "报告已生成${if (user != null) "并归档" else ""}")
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "报告生成失败")
        }
    }

    fun openArchivedReport(id: String) = viewModelScope.launch {
        if (state.user == null) {
            state = state.copy(message = "请先登录后查看归档报告")
            return@launch
        }
        state = state.copy(loading = true, message = "打开归档报告")
        runApiCatching {
            val archivedReport = authenticated { api.report(id).unwrap() }
            val report = CareerApiFactory.gson.fromJson(archivedReport.content, CareerReport::class.java)
            state = state.copy(report = report, archivedReport = archivedReport, loading = false, message = "已打开 ${archivedReport.title}")
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "归档报告打开失败")
        }
    }

    fun deleteArchivedReport(id: String) = viewModelScope.launch {
        if (state.user == null) {
            state = state.copy(message = "请先登录后删除归档报告")
            return@launch
        }
        state = state.copy(loading = true, message = "删除归档报告")
        runApiCatching {
            val reports = authenticated {
                api.deleteReport(id).requireSuccess()
                api.reports(type = "career_report").unwrap().items
            }
            val selectedDeleted = state.archivedReport?.id == id
            state = state.copy(
                archivedReport = if (selectedDeleted) null else state.archivedReport,
                reports = reports,
                loading = false,
                message = "归档报告已删除"
            )
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "归档报告删除失败")
        }
    }

    fun generatePathPlan() = viewModelScope.launch {
        val user = state.user
        val targetJob = preferredTargetJob()
        val target = preferredTargetRole(targetJob)
        state = state.copy(loading = true, message = "生成路径计划")
        runApiCatching {
            val plan = api.generatePathPlan(
                PathPlanRequest(
                    requestId = "android-path-${System.currentTimeMillis()}",
                    userId = user?.id?.toString(),
                    profile = agentProfile(target, targetJob),
                    targetRole = target
                )
            ).unwrap()
            var archivedPathPlan: ArchivedPathPlan? = null
            val pathPlans = if (user != null) {
                val archiveResult = authenticated {
                    val archived = api.archivePathPlan(
                        PathPlanArchiveRequest(
                            targetRole = plan.targetRole,
                            overview = plan.overview,
                            agentRunId = plan.agentRunId,
                            milestones = plan.milestones,
                            checkpoints = plan.checkpoints
                        )
                    ).unwrap()
                    archived to api.pathPlans().unwrap()
                }
                archivedPathPlan = archiveResult.first
                archiveResult.second
            } else {
                state.pathPlans
            }
            state = state.copy(pathPlan = plan, archivedPathPlan = archivedPathPlan, pathPlans = pathPlans, loading = false, message = "路径计划已生成${if (user != null) "并归档" else ""}")
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "路径计划生成失败")
        }
    }

    fun togglePathTask(taskId: Long, done: Boolean) = viewModelScope.launch {
        val plan = state.archivedPathPlan ?: return@launch
        runApiCatching {
            val (updated, pathPlans) = authenticated {
                val updated = api.updatePathTask(plan.id, taskId, PathTaskStatusRequest(if (done) "done" else "todo")).unwrap()
                updated to api.pathPlans().unwrap()
            }
            state = state.copy(archivedPathPlan = updated, pathPlans = pathPlans, message = if (done) "任务已完成" else "任务已恢复待办")
        }.onFailure {
            state = state.copy(message = it.message ?: "任务状态更新失败")
        }
    }

    fun openResumeAnalysis(id: Long) = viewModelScope.launch {
        if (state.user == null) {
            state = state.copy(message = "请先登录后查看归档简历诊断")
            return@launch
        }
        state = state.copy(loading = true, message = "打开归档简历诊断")
        runApiCatching {
            val archived = authenticated { api.resumeAnalysis(id).unwrap() }
            state = state.copy(
                resumeAnalysis = archived.toResumeAnalysis(),
                archivedResumeAnalysis = archived,
                loading = false,
                message = "已打开简历诊断"
            )
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "归档简历诊断打开失败")
        }
    }

    fun deleteResumeAnalysis(id: Long) = viewModelScope.launch {
        if (state.user == null) {
            state = state.copy(message = "请先登录后删除归档简历诊断")
            return@launch
        }
        state = state.copy(loading = true, message = "删除归档简历诊断")
        runApiCatching {
            val resumeAnalyses = authenticated {
                api.deleteResumeAnalysis(id).requireSuccess()
                api.resumeAnalyses().unwrap()
            }
            val selectedDeleted = state.archivedResumeAnalysis?.id == id
            state = state.copy(
                resumeAnalysis = if (selectedDeleted) null else state.resumeAnalysis,
                archivedResumeAnalysis = if (selectedDeleted) null else state.archivedResumeAnalysis,
                resumeAnalyses = resumeAnalyses,
                loading = false,
                message = "归档简历诊断已删除"
            )
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "归档简历诊断删除失败")
        }
    }

    fun openPathPlan(id: Long) = viewModelScope.launch {
        if (state.user == null) {
            state = state.copy(message = "请先登录后查看归档路径")
            return@launch
        }
        state = state.copy(loading = true, message = "打开归档路径")
        runApiCatching {
            val archived = authenticated { api.pathPlan(id).unwrap() }
            state = state.copy(archivedPathPlan = archived, loading = false, message = "已打开 ${archived.targetRole} 路径")
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "归档路径打开失败")
        }
    }

    fun deletePathPlan(id: Long) = viewModelScope.launch {
        if (state.user == null) {
            state = state.copy(message = "请先登录后删除归档路径")
            return@launch
        }
        state = state.copy(loading = true, message = "删除归档路径")
        runApiCatching {
            val pathPlans = authenticated {
                api.deletePathPlan(id).requireSuccess()
                api.pathPlans().unwrap()
            }
            val selectedDeleted = state.archivedPathPlan?.id == id
            state = state.copy(
                archivedPathPlan = if (selectedDeleted) null else state.archivedPathPlan,
                pathPlans = pathPlans,
                loading = false,
                message = "归档路径已删除"
            )
        }.onFailure {
            state = state.copy(loading = false, message = it.message ?: "归档路径删除失败")
        }
    }

    private fun preferredTargetJob(): JobSummary? =
        state.targetJobs.firstOrNull()

    private fun preferredTargetRole(targetJob: JobSummary?): String =
        targetJob?.title
            ?: state.profile?.targetRole
            ?: state.recommendedJobs.firstOrNull()?.job?.title
            ?: state.jobs.firstOrNull()?.title
            ?: "AI 应用工程师"

    private fun agentProfile(targetRole: String, targetJob: JobSummary? = null): Map<String, Any> {
        val profile = state.profile
        val payload = mutableMapOf<String, Any>(
            "name" to (profile?.displayName ?: state.user?.username ?: "mobile-user"),
            "target_role" to targetRole
        )
        val skills = targetJob?.tags?.takeIf { it.isNotEmpty() }
            ?: profile?.skills?.takeIf { it.isNotEmpty() }
            ?: listOf("Kotlin", "Vue 3", "Spring Boot", "Python")
        payload["skills"] = skills
        targetJob?.city?.takeIf { it.isNotBlank() }?.let { payload["target_cities"] = listOf(it) }
        profile?.major?.takeIf { it.isNotBlank() }?.let { payload["major"] = it }
        if (targetJob == null) {
            profile?.targetCities?.takeIf { it.isNotEmpty() }?.let { payload["target_cities"] = it }
        }
        profile?.expectedSalary?.takeIf { it.isNotBlank() }?.let { payload["expected_salary"] = it }
        return payload
    }

    private fun saveSession(token: String, refreshToken: String, user: UserInfo) {
        sessionStore.save(token, refreshToken, user)
        state = state.copy(user = user, token = token, refreshToken = refreshToken)
    }

    private suspend fun refreshAccessToken(): Boolean {
        val refreshToken = state.refreshToken?.takeIf { it.isNotBlank() } ?: return false
        return try {
            val login = api.refresh(RefreshTokenRequest(refreshToken)).unwrap()
            saveSession(login.token, login.refreshToken, login.user)
            true
        } catch (_: Exception) {
            sessionStore.clear()
            state = state.copy(user = null, token = null, refreshToken = null)
            false
        }
    }

    private suspend fun <T> authenticatedOrNull(block: suspend () -> T): T? {
        if (state.token.isNullOrBlank()) {
            return null
        }
        return try {
            block()
        } catch (error: Throwable) {
            val normalized = normalizeNetworkError(error)
            if (isUnauthorized(normalized) && refreshAccessToken()) {
                block()
            } else {
                throw normalized
            }
        }
    }

    private suspend fun <T> authenticated(block: suspend () -> T): T {
        if (state.token.isNullOrBlank()) {
            throw ApiException("请先登录后继续操作", apiCode = 401, httpStatus = 401)
        }
        return try {
            block()
        } catch (error: Throwable) {
            val normalized = normalizeNetworkError(error)
            if (isUnauthorized(normalized) && refreshAccessToken()) {
                block()
            } else {
                throw normalized
            }
        }
    }

    private suspend fun <T> authenticatedList(block: suspend () -> List<T>): List<T> =
        authenticatedOrNull(block).orEmpty()

    private suspend fun authenticatedReportPage(): List<ReportSnapshot> =
        authenticatedOrNull { api.reports(type = "career_report").unwrap().items }.orEmpty()

    private fun isUnauthorized(error: ApiException): Boolean =
        error.httpStatus == 401 || error.apiCode == 401

}

class CareerViewModelFactory(
    private val sessionStore: SessionGateway,
    private val apiFactory: (tokenProvider: () -> String?) -> CareerApi = CareerApiFactory::create
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(CareerViewModel::class.java)) {
            return CareerViewModel(sessionStore, apiFactory) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

private fun ArchivedResumeAnalysis.toResumeAnalysis(): ResumeAnalysis =
    ResumeAnalysis(
        agentRunId = agentRunId,
        score = score ?: 0,
        atsScore = atsScore ?: 0,
        keywordMatch = keywordMatch ?: 0,
        issues = issues,
        suggestions = suggestions,
        improvedFragments = improvedFragments
    )

@Composable
fun CareerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = androidx.compose.material3.darkColorScheme(
            primary = Cyan,
            secondary = Warm,
            background = Deep,
            surface = Panel
        ),
        content = content
    )
}

@Composable
fun CareerDecisionApp() {
    val context = LocalContext.current
    val factory = remember(context) { CareerViewModelFactory(SessionStore(context)) }
    val viewModel: CareerViewModel = viewModel(factory = factory)
    val tabs = listOf("登录", "岗位", "MBTI", "报告")
    var selectedTab by mutableStateOf(tabs.first())
    val state = viewModel.state

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Deep)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Header(state.message, state.user?.username)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                tabs.forEach { tab ->
                    val selected = selectedTab == tab
                    OutlinedButton(
                        onClick = { selectedTab = tab },
                        border = BorderStroke(1.dp, if (selected) Cyan else Color(0x5539C5BB)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = if (selected) Cyan else Color.White)
                    ) {
                        Text(tab)
                    }
                }
            }
        }
        item {
            when (selectedTab) {
                "登录" -> AuthSection(state, viewModel)
                "岗位" -> JobsSection(state, viewModel)
                "MBTI" -> MbtiSection(state, viewModel)
                else -> ReportSection(state, viewModel)
            }
        }
    }
}

@Composable
fun Header(message: String, username: String?) {
    Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(8.dp)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("VOCAPATH MOBILE", color = Cyan, fontWeight = FontWeight.Black)
            Text(username?.let { "$it 的职业声场" } ?: "AI 职业规划移动端", style = MaterialTheme.typography.headlineSmall)
            Text(message, color = Color(0xFFB5D8D4))
        }
    }
}

@Composable
fun AuthSection(state: MobileState, viewModel: CareerViewModel) {
    var username by mutableStateOf("")
    var password by mutableStateOf("")
    var confirmPassword by mutableStateOf("")
    var email by mutableStateOf("")
    CardBlock("账号") {
        if (state.user != null) {
            Text("当前用户：${state.user.username} / ID ${state.user.id}", color = Color.White)
            OutlinedButton(onClick = { viewModel.logout() }, enabled = !state.loading) {
                Text("退出登录")
            }
            ProfileEditor(state, viewModel)
        } else {
            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("用户名") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("邮箱，可选") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("密码") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = confirmPassword,
                onValueChange = { confirmPassword = it },
                label = { Text("确认密码（注册用）") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { viewModel.login(username, password) },
                    enabled = !state.loading,
                    colors = ButtonDefaults.buttonColors(containerColor = Cyan)
                ) {
                    Text("登录", color = Deep)
                }
                OutlinedButton(
                    onClick = { viewModel.registerAndLogin(username, password, confirmPassword, email.ifBlank { null }) },
                    enabled = !state.loading
                ) {
                    Text("注册并登录")
                }
            }
        }
    }
}

@Composable
fun ProfileEditor(state: MobileState, viewModel: CareerViewModel) {
    var displayName by mutableStateOf("")
    var targetRole by mutableStateOf("")
    var skills by mutableStateOf("")

    LaunchedEffect(state.profile?.updatedAt, state.user?.id) {
        displayName = state.profile?.displayName ?: state.user?.username ?: ""
        targetRole = state.profile?.targetRole ?: ""
        skills = state.profile?.skills?.joinToString("，") ?: ""
    }

    Text(if (state.profile?.completed == true) "职业画像：已可用于 AI 报告" else "职业画像：补齐后报告更准", color = Color(0xFFB5D8D4))
    OutlinedTextField(
        value = displayName,
        onValueChange = { displayName = it },
        label = { Text("展示名") },
        modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = targetRole,
        onValueChange = { targetRole = it },
        label = { Text("目标岗位") },
        modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = skills,
        onValueChange = { skills = it },
        label = { Text("技能，用逗号分隔") },
        modifier = Modifier.fillMaxWidth()
    )
    Button(
        onClick = { viewModel.saveProfile(displayName, targetRole, skills) },
        enabled = !state.loading,
        colors = ButtonDefaults.buttonColors(containerColor = Cyan)
    ) {
        Text("保存画像", color = Deep)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun JobsSection(state: MobileState, viewModel: CareerViewModel) {
    val jobs = state.jobs
    val favoriteIds = state.favoriteJobs.map { it.id }.toSet()
    val targetIds = state.targetJobs.map { it.id }.toSet()
    CardBlock("真实岗位匹配") {
        if (state.recommendedJobs.isEmpty()) {
            Text("同步后会显示基于真实岗位库的匹配候选。", color = Color.White)
        }
        state.recommendedJobs.forEach { match ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                Text("${match.matchScore}%  ${match.job.title}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("${match.job.company} · ${match.job.location ?: match.job.city ?: "地点待确认"} · ${match.job.salaryRange ?: "薪资待确认"}", color = Color(0xFFB5D8D4))
                match.reasons.take(2).forEach { reason ->
                    Text(reason, color = Color(0xFFC7FFF8))
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    CardBlock("岗位库") {
        if (jobs.isEmpty()) {
            Text("暂无岗位，确认后端和数据库是否运行。", color = Color.White)
        }
        jobs.forEach { job ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                Text(job.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("${job.company} · ${job.location ?: job.city ?: "地点待确认"} · ${job.salaryRange ?: "薪资待确认"}", color = Color(0xFFB5D8D4))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    job.tags.take(5).forEach { tag -> Chip(tag) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.toggleFavorite(job.id) }, enabled = !state.loading) {
                        Text(if (favoriteIds.contains(job.id)) "已收藏" else "收藏")
                    }
                    OutlinedButton(onClick = { viewModel.toggleTarget(job.id) }, enabled = !state.loading) {
                        Text(if (targetIds.contains(job.id)) "已设目标" else "设为目标")
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    CardBlock("收藏短名单") {
        if (state.favoriteJobs.isEmpty()) {
            Text("登录后收藏的岗位会同步到这里。", color = Color.White)
        }
        state.favoriteJobs.forEach { job ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                Text(job.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("${job.company} · ${job.location ?: job.city ?: "地点待确认"}", color = Color(0xFFB5D8D4))
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    CardBlock("目标岗位") {
        if (state.targetJobs.isEmpty()) {
            Text("设置目标岗位后，后续报告和路径可以围绕它展开。", color = Color.White)
        }
        state.targetJobs.forEach { job ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                Text(job.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("${job.company} · ${job.location ?: job.city ?: "地点待确认"}", color = Color(0xFFB5D8D4))
            }
        }
    }
}

@Composable
fun MbtiSection(state: MobileState, viewModel: CareerViewModel) {
    CardBlock("MBTI 测评") {
        state.questions.forEach { question ->
            Text(question.text, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                question.options.forEach { option ->
                    OutlinedButton(onClick = { viewModel.answer(question.id, option.code) }) {
                        Text("${option.direction} ${option.code}")
                    }
                }
            }
        }
        Button(
            onClick = { viewModel.submitMbti() },
            enabled = !state.loading && state.questions.isNotEmpty() && viewModel.answers.size == state.questions.size,
            colors = ButtonDefaults.buttonColors(containerColor = Cyan)
        ) {
            Text("提交测评", color = Deep)
        }
        state.mbtiResult?.let {
            Text("${it.type}：${it.description}", color = Warm)
        }
    }
}

@Composable
fun ReportSection(state: MobileState, viewModel: CareerViewModel) {
    var resumeText by mutableStateOf("")
    CardBlock("AI 报告") {
        Button(
            onClick = { viewModel.generateReport() },
            enabled = !state.loading,
            colors = ButtonDefaults.buttonColors(containerColor = Cyan)
        ) {
            Text("生成并归档", color = Deep)
        }
        OutlinedButton(onClick = { viewModel.generatePathPlan() }, enabled = !state.loading) {
            Text("生成路径计划")
        }
        OutlinedTextField(
            value = resumeText,
            onValueChange = { resumeText = it },
            label = { Text("简历文本") },
            minLines = 5,
            modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = { resumeText = MobileSampleResume }, enabled = !state.loading) {
                Text("载入样例")
            }
            OutlinedButton(onClick = { viewModel.analyzeResume(resumeText) }, enabled = !state.loading) {
                Text("分析简历")
            }
        }
        state.report?.let { report ->
            state.archivedReport?.let {
                Text("当前归档：${it.title}", color = Color(0xFFB5D8D4))
            }
            Text(report.summary, color = Color.White)
            report.recommendedCareers.forEach {
                Text("${it.title} ${it.matchScore}%", color = Warm, fontWeight = FontWeight.Bold)
            }
        } ?: Text("生成报告后会展示推荐职业、技能缺口和行动建议。", color = Color(0xFFB5D8D4))
        Text("已归档报告：${state.reports.size}", color = Color(0xFFB5D8D4))
        state.reports.forEach { archived ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                Text(archived.title, color = Color.White, fontWeight = FontWeight.Bold)
                Text(archived.summary, color = Color(0xFFB5D8D4))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.openArchivedReport(archived.id) }, enabled = !state.loading) {
                        Text("打开")
                    }
                    OutlinedButton(onClick = { viewModel.deleteArchivedReport(archived.id) }, enabled = !state.loading) {
                        Text("删除")
                    }
                }
            }
        }
        state.pathPlan?.let { plan ->
            Text(plan.overview, color = Color.White)
            plan.milestones.forEach {
                Text("${it.duration} · ${it.title}", color = Color(0xFFC7FFF8), fontWeight = FontWeight.Bold)
            }
        }
        state.archivedPathPlan?.let { detail ->
            Text("路径进度：${detail.completedTaskCount} / ${detail.taskCount} · ${detail.progressPercent}%", color = Warm, fontWeight = FontWeight.Bold)
            detail.milestones.forEach { milestone ->
                Text(milestone.title, color = Color(0xFFC7FFF8), fontWeight = FontWeight.Bold)
                milestone.tasks.forEach { task ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Checkbox(
                            checked = task.status == "done",
                            onCheckedChange = { checked -> viewModel.togglePathTask(task.id, checked) }
                        )
                        Text(task.content, color = if (task.status == "done") Color(0xFF7C9C99) else Color.White)
                    }
                }
            }
        }
        state.resumeAnalysis?.let { analysis ->
            state.archivedResumeAnalysis?.let {
                Text("当前诊断：${it.targetRole ?: "未指定岗位"}", color = Color(0xFFB5D8D4))
            }
            Text("简历 ${analysis.score} 分 · ATS ${analysis.atsScore} · 关键词 ${analysis.keywordMatch}", color = Warm, fontWeight = FontWeight.Bold)
            analysis.suggestions.take(2).forEach { Text(it, color = Color(0xFFC7FFF8)) }
        }
        Text("已归档诊断：${state.resumeAnalyses.size}", color = Color(0xFFB5D8D4))
        state.resumeAnalyses.forEach { analysis ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                Text(analysis.targetRole ?: "未指定岗位", color = Color.White, fontWeight = FontWeight.Bold)
                Text("评分 ${analysis.score ?: 0} · 建议 ${analysis.suggestionCount}", color = Color(0xFFB5D8D4))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.openResumeAnalysis(analysis.id) }, enabled = !state.loading) {
                        Text("打开")
                    }
                    OutlinedButton(onClick = { viewModel.deleteResumeAnalysis(analysis.id) }, enabled = !state.loading) {
                        Text("删除")
                    }
                }
            }
        }
        Text("已归档路径：${state.pathPlans.size}", color = Color(0xFFB5D8D4))
        state.pathPlans.forEach { plan ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                Text(plan.targetRole, color = Color.White, fontWeight = FontWeight.Bold)
                Text("${plan.completedTaskCount}/${plan.taskCount} · ${plan.progressPercent}%", color = Color(0xFFB5D8D4))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.openPathPlan(plan.id) }, enabled = !state.loading) {
                        Text("打开")
                    }
                    OutlinedButton(onClick = { viewModel.deletePathPlan(plan.id) }, enabled = !state.loading) {
                        Text("删除")
                    }
                }
            }
        }
        state.pathPlans.firstOrNull()?.let {
            Text("最近路径进度：${it.completedTaskCount}/${it.taskCount} · ${it.progressPercent}%", color = Color(0xFFB5D8D4))
        }
    }
}

@Composable
fun CardBlock(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(8.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, color = Cyan, fontWeight = FontWeight.Black)
            content()
        }
    }
}

@Composable
fun Chip(text: String) {
    Surface(
        border = BorderStroke(1.dp, Color(0x6639C5BB)),
        shape = RoundedCornerShape(50),
        color = Color(0x1439C5BB)
    ) {
        Text(text, color = Color(0xFFC7FFF8), modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp))
    }
}
