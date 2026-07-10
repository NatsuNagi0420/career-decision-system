package com.careerdecision.mobile

import com.careerdecision.mobile.network.ApiEnvelope
import com.careerdecision.mobile.network.ArchivedPathMilestone
import com.careerdecision.mobile.network.ArchivedPathPlan
import com.careerdecision.mobile.network.ArchivedResumeAnalysis
import com.careerdecision.mobile.network.CareerApi
import com.careerdecision.mobile.network.CareerOption
import com.careerdecision.mobile.network.CareerReport
import com.careerdecision.mobile.network.CareerReportRequest
import com.careerdecision.mobile.network.JobDetail
import com.careerdecision.mobile.network.JobMatch
import com.careerdecision.mobile.network.JobPage
import com.careerdecision.mobile.network.JobRecommendationRequest
import com.careerdecision.mobile.network.JobSummary
import com.careerdecision.mobile.network.LoginRequest
import com.careerdecision.mobile.network.LoginResponse
import com.careerdecision.mobile.network.MbtiOption
import com.careerdecision.mobile.network.MbtiQuestion
import com.careerdecision.mobile.network.MbtiResult
import com.careerdecision.mobile.network.MbtiSubmitRequest
import com.careerdecision.mobile.network.PathMilestone
import com.careerdecision.mobile.network.PathPlan
import com.careerdecision.mobile.network.PathPlanArchiveRequest
import com.careerdecision.mobile.network.PathPlanRequest
import com.careerdecision.mobile.network.PathPlanSnapshot
import com.careerdecision.mobile.network.PathTask
import com.careerdecision.mobile.network.PathTaskStatusRequest
import com.careerdecision.mobile.network.RefreshTokenRequest
import com.careerdecision.mobile.network.RegisterRequest
import com.careerdecision.mobile.network.ReportArchiveRequest
import com.careerdecision.mobile.network.ReportPage
import com.careerdecision.mobile.network.ReportSnapshot
import com.careerdecision.mobile.network.ResumeAnalysis
import com.careerdecision.mobile.network.ResumeAnalysisArchiveRequest
import com.careerdecision.mobile.network.ResumeAnalysisRequest
import com.careerdecision.mobile.network.ResumeAnalysisSnapshot
import com.careerdecision.mobile.network.SkillGapItem
import com.careerdecision.mobile.network.UserInfo
import com.careerdecision.mobile.network.UserProfile
import com.careerdecision.mobile.network.UserProfileRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestWatcher
import org.junit.runner.Description

@OptIn(ExperimentalCoroutinesApi::class)
class CareerViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun fullFlowPersistsSessionAndArchivesGeneratedWork() = runTest {
        val session = FakeSessionGateway()
        val api = FakeCareerApi()
        val viewModel = CareerViewModel(session) { api }

        advanceUntilIdle()

        assertFalse(viewModel.state.loading)
        assertEquals(2, viewModel.state.jobs.size)
        assertEquals(2, viewModel.state.questions.size)
        assertEquals("后端同步完成", viewModel.state.message)

        viewModel.registerAndLogin(
            username = " miku ",
            password = "secret123",
            confirmPassword = "secret123",
            email = "miku@example.com"
        )
        advanceUntilIdle()

        assertEquals("miku", viewModel.state.user?.username)
        assertEquals("token-miku", viewModel.state.token)
        assertEquals("refresh-miku", viewModel.state.refreshToken)
        assertEquals(SessionSnapshot("token-miku", "refresh-miku", FakeCareerApi.user), session.savedSession)
        assertEquals("已登录 miku", viewModel.state.message)

        viewModel.saveProfile(
            displayName = "初音未来",
            targetRole = "AI 应用工程师",
            skills = "Kotlin，Python / Spring Boot"
        )
        advanceUntilIdle()

        assertEquals("初音未来", viewModel.state.profile?.displayName)
        assertEquals("AI 应用工程师", viewModel.state.profile?.targetRole)
        assertEquals(listOf("Kotlin", "Python", "Spring Boot"), api.savedProfileRequest?.skills)

        viewModel.answer(1, "I")
        viewModel.answer(2, "N")
        viewModel.submitMbti()
        advanceUntilIdle()

        assertEquals("INTJ", viewModel.state.mbtiResult?.type)

        val selectedJobId = viewModel.state.jobs.first().id
        viewModel.toggleFavorite(selectedJobId)
        advanceUntilIdle()
        viewModel.toggleTarget(selectedJobId)
        advanceUntilIdle()

        assertEquals(selectedJobId, viewModel.state.favoriteJobs.single().id)
        assertEquals(selectedJobId, viewModel.state.targetJobs.single().id)

        viewModel.generateReport()
        advanceUntilIdle()

        assertEquals("你适合从 AI 应用工程师切入，逐步补齐工程化和产品判断。", viewModel.state.report?.summary)
        assertEquals(1, api.archivedReports.size)
        assertTrue(api.archivedReports.single().content.contains("AI 应用工程师"))
        assertEquals("AI 应用工程师移动端报告", viewModel.state.archivedReport?.title)
        assertEquals(1, viewModel.state.reports.size)

        viewModel.openArchivedReport(viewModel.state.reports.single().id)
        advanceUntilIdle()

        assertEquals("AI 应用工程师移动端报告", viewModel.state.archivedReport?.title)
        assertEquals("你适合从 AI 应用工程师切入，逐步补齐工程化和产品判断。", viewModel.state.report?.summary)

        viewModel.analyzeResume("AI 职业规划系统移动端与 Web 端全链路开发，负责 Kotlin Compose、Vue、Spring Boot、FastAPI、MySQL 和 LLM 结构化输出。".repeat(2))
        advanceUntilIdle()

        assertEquals(88, viewModel.state.resumeAnalysis?.score)
        assertEquals(1, api.archivedResumeAnalyses.size)
        assertEquals(401L, viewModel.state.archivedResumeAnalysis?.id)
        assertEquals(1, viewModel.state.resumeAnalyses.size)

        viewModel.openResumeAnalysis(viewModel.state.resumeAnalyses.single().id)
        advanceUntilIdle()

        assertEquals(401L, viewModel.state.archivedResumeAnalysis?.id)
        assertEquals(88, viewModel.state.resumeAnalysis?.score)

        viewModel.generatePathPlan()
        advanceUntilIdle()

        val archivedPlan = requireNotNull(viewModel.state.archivedPathPlan)
        assertEquals("AI 应用工程师", archivedPlan.targetRole)
        assertEquals(1, api.archivedPathPlans.size)
        assertEquals(1, viewModel.state.pathPlans.size)

        viewModel.openPathPlan(viewModel.state.pathPlans.single().id)
        advanceUntilIdle()

        assertEquals(301L, viewModel.state.archivedPathPlan?.id)

        val taskId = archivedPlan.milestones.single().tasks.single().id
        viewModel.togglePathTask(taskId, done = true)
        advanceUntilIdle()

        assertEquals("done", viewModel.state.archivedPathPlan?.milestones?.single()?.tasks?.single()?.status)
        assertEquals(100, viewModel.state.archivedPathPlan?.progressPercent)
        assertEquals(1, viewModel.state.pathPlans.single().completedTaskCount)

        viewModel.deleteResumeAnalysis(viewModel.state.resumeAnalyses.single().id)
        advanceUntilIdle()

        assertTrue(api.deletedResumeAnalysisIds.contains(401))
        assertNull(viewModel.state.archivedResumeAnalysis)
        assertNull(viewModel.state.resumeAnalysis)
        assertEquals(0, viewModel.state.resumeAnalyses.size)

        viewModel.deletePathPlan(viewModel.state.pathPlans.single().id)
        advanceUntilIdle()

        assertTrue(api.deletedPathPlanIds.contains(301))
        assertNull(viewModel.state.archivedPathPlan)
        assertEquals(0, viewModel.state.pathPlans.size)

        viewModel.deleteArchivedReport(viewModel.state.reports.single().id)
        advanceUntilIdle()

        assertTrue(api.deletedReportIds.contains("901"))
        assertNull(viewModel.state.archivedReport)
        assertEquals(0, viewModel.state.reports.size)

        viewModel.logout()
        advanceUntilIdle()

        assertTrue(api.logoutCalled)
        assertNull(session.savedSession)
        assertNull(viewModel.state.user)
        assertNull(viewModel.state.token)
        assertNull(viewModel.state.refreshToken)
        assertEquals("已退出登录", viewModel.state.message)
    }

    @Test
    fun refreshesRestoredSessionWhenProtectedSyncNeedsNewAccessToken() = runTest {
        val session = FakeSessionGateway(
            SessionSnapshot(
                token = "expired-token",
                refreshToken = "valid-refresh",
                user = FakeCareerApi.user
            )
        )
        val api = FakeCareerApi(expiredTokens = setOf("expired-token"))
        val viewModel = CareerViewModel(session) { tokenProvider ->
            api.tokenProvider = tokenProvider
            api
        }

        advanceUntilIdle()

        assertEquals("rotated-token", viewModel.state.token)
        assertEquals("rotated-refresh", viewModel.state.refreshToken)
        assertEquals(SessionSnapshot("rotated-token", "rotated-refresh", FakeCareerApi.user), session.savedSession)
        assertEquals(1, api.refreshCalls)
        assertEquals(2, viewModel.state.jobs.size)
        assertEquals(FakeCareerApi.user.id, viewModel.state.profile?.userId)
        assertEquals("后端同步完成", viewModel.state.message)
    }

    @Test
    fun protectedWriteRefreshesExpiredAccessTokenAndRetries() = runTest {
        val session = FakeSessionGateway()
        val api = FakeCareerApi()
        val viewModel = CareerViewModel(session) { tokenProvider ->
            api.tokenProvider = tokenProvider
            api
        }

        advanceUntilIdle()

        viewModel.login("miku", "secret123")
        advanceUntilIdle()
        api.expireToken("token-miku")

        viewModel.saveProfile(
            displayName = "Miku",
            targetRole = "AI Application Engineer",
            skills = "Kotlin, Spring Boot"
        )
        advanceUntilIdle()

        assertEquals(1, api.refreshCalls)
        assertEquals("rotated-token", viewModel.state.token)
        assertEquals("rotated-refresh", viewModel.state.refreshToken)
        assertEquals(SessionSnapshot("rotated-token", "rotated-refresh", FakeCareerApi.user), session.savedSession)
        assertEquals("AI Application Engineer", viewModel.state.profile?.targetRole)
        assertEquals("职业画像已保存", viewModel.state.message)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule(
    private val dispatcher: TestDispatcher = StandardTestDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(dispatcher)
    }

    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}

private class FakeSessionGateway(
    initialSession: SessionSnapshot? = null
) : SessionGateway {
    var savedSession: SessionSnapshot? = initialSession

    override fun load(): SessionSnapshot? = savedSession

    override fun save(token: String, refreshToken: String, user: UserInfo) {
        savedSession = SessionSnapshot(token, refreshToken, user)
    }

    override fun clear() {
        savedSession = null
    }
}

private class FakeCareerApi(
    expiredTokens: Set<String> = emptySet()
) : CareerApi {
    private val expiredTokens = expiredTokens.toMutableSet()
    var tokenProvider: (() -> String?)? = null
    var refreshCalls = 0
    var savedProfileRequest: UserProfileRequest? = null
    val archivedReports = mutableListOf<ReportArchiveRequest>()
    val deletedReportIds = mutableListOf<String>()
    val archivedResumeAnalyses = mutableListOf<ResumeAnalysisArchiveRequest>()
    val deletedResumeAnalysisIds = mutableListOf<Long>()
    val archivedPathPlans = mutableListOf<PathPlanArchiveRequest>()
    val deletedPathPlanIds = mutableListOf<Long>()
    var logoutCalled = false

    private var profile = baseProfile()
    private val favoriteJobs = mutableListOf<JobSummary>()
    private val targetJobs = mutableListOf<JobSummary>()
    private val reportSnapshots = mutableListOf<ReportSnapshot>()
    private val resumeDetails = mutableListOf<ArchivedResumeAnalysis>()
    private val resumeSnapshots = mutableListOf<ResumeAnalysisSnapshot>()
    private val pathPlanSnapshots = mutableListOf<PathPlanSnapshot>()
    private var archivedPathPlan: ArchivedPathPlan? = null

    fun expireToken(token: String) {
        expiredTokens += token
    }

    override suspend fun register(request: RegisterRequest): ApiEnvelope<UserInfo> =
        ok(user.copy(username = request.username))

    override suspend fun login(request: LoginRequest): ApiEnvelope<LoginResponse> =
        ok(
            LoginResponse(
                token = "token-${request.username}",
                refreshToken = "refresh-${request.username}",
                user = user.copy(username = request.username)
            )
        )

    override suspend fun refresh(request: RefreshTokenRequest): ApiEnvelope<LoginResponse> {
        refreshCalls += 1
        return ok(LoginResponse(token = "rotated-token", refreshToken = "rotated-refresh", user = user))
    }

    override suspend fun logout(): ApiEnvelope<Any> {
        logoutCalled = true
        return ok(mapOf("loggedOut" to true))
    }

    override suspend fun profile(): ApiEnvelope<UserProfile> {
        failIfExpiredToken()
        return ok(profile)
    }

    override suspend fun saveProfile(request: UserProfileRequest): ApiEnvelope<UserProfile> {
        failIfExpiredToken()
        savedProfileRequest = request
        profile = profile.copy(
            displayName = request.displayName,
            identityType = request.identityType,
            targetRole = request.targetRole,
            skills = request.skills.orEmpty(),
            completed = true,
            updatedAt = "2026-06-11T05:30:00"
        )
        return ok(profile)
    }

    override suspend fun jobs(keyword: String?, page: Int, size: Int): ApiEnvelope<JobPage<JobSummary>> =
        ok(
            JobPage(
                items = jobs.take(size),
                page = page,
                size = size,
                totalElements = jobs.size.toLong(),
                totalPages = 1,
                hasNext = false,
                hasPrevious = false
            )
        )

    override suspend fun jobDetail(id: Long): ApiEnvelope<JobDetail> =
        ok(
            JobDetail(
                id = id,
                title = "AI 应用工程师",
                company = "未来音色科技",
                location = "上海",
                direction = "AI 应用",
                salaryRange = "18k-28k",
                experienceLevel = "校招",
                education = "本科",
                tags = listOf("Kotlin", "Spring Boot"),
                summary = "负责 AI 职业规划产品工程化",
                responsibilities = listOf("开发全链路功能"),
                requirements = listOf("熟悉 Kotlin 和后端接口"),
                growthPath = listOf("AI 应用工程师", "AI 产品技术负责人"),
                interviewFocus = listOf("工程闭环")
            )
        )

    override suspend fun recommendJobs(request: JobRecommendationRequest): ApiEnvelope<List<JobMatch>> =
        ok(listOf(JobMatch(job = jobs.first(), matchScore = 94, reasons = listOf("技能匹配", "目标清晰"))))

    override suspend fun favoriteJobs(): ApiEnvelope<List<JobSummary>> {
        failIfExpiredToken()
        return ok(favoriteJobs.toList())
    }

    override suspend fun addFavoriteJob(id: Long): ApiEnvelope<List<JobSummary>> {
        favoriteJobs += jobs.first { it.id == id }
        return favoriteJobs()
    }

    override suspend fun removeFavoriteJob(id: Long): ApiEnvelope<List<JobSummary>> {
        favoriteJobs.removeAll { it.id == id }
        return favoriteJobs()
    }

    override suspend fun targetJobs(): ApiEnvelope<List<JobSummary>> {
        failIfExpiredToken()
        return ok(targetJobs.toList())
    }

    override suspend fun addTargetJob(id: Long): ApiEnvelope<List<JobSummary>> {
        targetJobs += jobs.first { it.id == id }
        return targetJobs()
    }

    override suspend fun removeTargetJob(id: Long): ApiEnvelope<List<JobSummary>> {
        targetJobs.removeAll { it.id == id }
        return targetJobs()
    }

    override suspend fun mbtiQuestions(): ApiEnvelope<List<MbtiQuestion>> = ok(questions)

    override suspend fun submitMbti(request: MbtiSubmitRequest): ApiEnvelope<MbtiResult> =
        ok(MbtiResult(type = "INTJ", scores = mapOf("I" to 1, "N" to 1), description = "目标清晰，适合复杂系统规划。"))

    override suspend fun generateReport(request: CareerReportRequest): ApiEnvelope<CareerReport> =
        ok(
            CareerReport(
                agentRunId = 101,
                summary = "你适合从 AI 应用工程师切入，逐步补齐工程化和产品判断。",
                profileTags = listOf("工程闭环", "AI 应用"),
                strengths = listOf("跨端实现", "后端协作"),
                risks = listOf("需要持续积累业务案例"),
                recommendedCareers = listOf(
                    CareerOption(
                        title = request.profile["target_role"].toString(),
                        matchScore = 92,
                        reasons = listOf("岗位目标一致"),
                        coreSkills = listOf("Kotlin", "Spring Boot"),
                        risks = listOf("算法深度需补齐")
                    )
                ),
                skillGaps = listOf(SkillGapItem(skill = "LLM 评测", priority = "high", suggestion = "补充自动化评测样例")),
                nextActions = listOf("完成移动端主流程", "补齐运行时烟测"),
                confidence = 0.88
            )
        )

    override suspend fun archiveReport(request: ReportArchiveRequest): ApiEnvelope<ReportSnapshot> {
        archivedReports += request
        val snapshot = ReportSnapshot(
            id = "901",
            userId = user.id.toString(),
            agentRunId = request.agentRunId,
            type = request.type,
            title = request.title,
            summary = request.summary,
            content = request.content,
            createdAt = "2026-06-11T05:45:00",
            updatedAt = "2026-06-11T05:45:00"
        )
        reportSnapshots.removeAll { it.id == snapshot.id }
        reportSnapshots += snapshot
        return ok(snapshot)
    }

    override suspend fun reports(type: String?, page: Int, size: Int): ApiEnvelope<ReportPage> {
        failIfExpiredToken()
        val items = reportSnapshots
            .filter { type == null || it.type == type }
            .take(size)
        return ok(ReportPage(items = items, page = page, size = size, total = items.size.toLong(), totalPages = 1))
    }

    override suspend fun report(id: String): ApiEnvelope<ReportSnapshot> {
        failIfExpiredToken()
        return ok(requireNotNull(reportSnapshots.firstOrNull { it.id == id }))
    }

    override suspend fun deleteReport(id: String): ApiEnvelope<Any> {
        failIfExpiredToken()
        deletedReportIds += id
        reportSnapshots.removeAll { it.id == id }
        return ok(mapOf("deleted" to true))
    }

    override suspend fun generatePathPlan(request: PathPlanRequest): ApiEnvelope<PathPlan> =
        ok(
            PathPlan(
                agentRunId = 202,
                targetRole = request.targetRole,
                overview = "30 天完成 AI 应用工程师作品集闭环。",
                milestones = listOf(
                    PathMilestone(
                        title = "补齐移动端主流程",
                        duration = "第 1-2 周",
                        tasks = listOf("完成 ViewModel 测试"),
                        acceptance = listOf("单元测试覆盖主路径")
                    )
                ),
                checkpoints = listOf("每周复盘一次")
            )
        )

    override suspend fun archivePathPlan(request: PathPlanArchiveRequest): ApiEnvelope<ArchivedPathPlan> {
        archivedPathPlans += request
        archivedPathPlan = archivedPlan(request, "todo")
        pathPlanSnapshots.clear()
        pathPlanSnapshots += pathSnapshot(completedTaskCount = 0, progressPercent = 0)
        return ok(requireNotNull(archivedPathPlan))
    }

    override suspend fun pathPlans(page: Int, size: Int): ApiEnvelope<List<PathPlanSnapshot>> {
        failIfExpiredToken()
        return ok(pathPlanSnapshots.toList())
    }

    override suspend fun pathPlan(planId: Long): ApiEnvelope<ArchivedPathPlan> {
        failIfExpiredToken()
        return ok(requireNotNull(archivedPathPlan?.takeIf { it.id == planId }))
    }

    override suspend fun updatePathTask(
        planId: Long,
        taskId: Long,
        request: PathTaskStatusRequest
    ): ApiEnvelope<ArchivedPathPlan> {
        val current = requireNotNull(archivedPathPlan)
        val updatedTask = current.milestones.single().tasks.single().copy(status = request.status)
        val updatedMilestone = current.milestones.single().copy(tasks = listOf(updatedTask))
        val completedTaskCount = if (request.status == "done") 1 else 0
        val progressPercent = if (request.status == "done") 100 else 0
        archivedPathPlan = current.copy(
            completedTaskCount = completedTaskCount,
            progressPercent = progressPercent,
            milestones = listOf(updatedMilestone)
        )
        pathPlanSnapshots.clear()
        pathPlanSnapshots += pathSnapshot(completedTaskCount = completedTaskCount, progressPercent = progressPercent)
        return ok(requireNotNull(archivedPathPlan))
    }

    override suspend fun deletePathPlan(planId: Long): ApiEnvelope<Any> {
        failIfExpiredToken()
        deletedPathPlanIds += planId
        if (archivedPathPlan?.id == planId) {
            archivedPathPlan = null
        }
        pathPlanSnapshots.removeAll { it.id == planId }
        return ok(mapOf("deleted" to true))
    }

    override suspend fun analyzeResume(request: ResumeAnalysisRequest): ApiEnvelope<ResumeAnalysis> =
        ok(
            ResumeAnalysis(
                agentRunId = 303,
                score = 88,
                atsScore = 82,
                keywordMatch = 79,
                issues = listOf("缺少量化指标"),
                suggestions = listOf("补充项目结果数据"),
                improvedFragments = listOf("将全链路开发成果量化为功能和测试覆盖")
            )
        )

    override suspend fun archiveResumeAnalysis(request: ResumeAnalysisArchiveRequest): ApiEnvelope<ArchivedResumeAnalysis> {
        archivedResumeAnalyses += request
        val detail = ArchivedResumeAnalysis(
            id = 401,
            agentRunId = request.agentRunId,
            targetRole = request.targetRole,
            score = request.analysis.score,
            atsScore = request.analysis.atsScore,
            keywordMatch = request.analysis.keywordMatch,
            issues = request.analysis.issues,
            suggestions = request.analysis.suggestions,
            improvedFragments = request.analysis.improvedFragments,
            createdAt = "2026-06-11T05:35:00"
        )
        resumeDetails.removeAll { it.id == detail.id }
        resumeDetails += detail
        resumeSnapshots += ResumeAnalysisSnapshot(
            id = 401,
            agentRunId = request.agentRunId,
            targetRole = request.targetRole,
            score = request.analysis.score,
            atsScore = request.analysis.atsScore,
            keywordMatch = request.analysis.keywordMatch,
            issueCount = request.analysis.issues.size,
            suggestionCount = request.analysis.suggestions.size,
            createdAt = "2026-06-11T05:35:00"
        )
        return ok(detail)
    }

    override suspend fun resumeAnalyses(page: Int, size: Int): ApiEnvelope<List<ResumeAnalysisSnapshot>> {
        failIfExpiredToken()
        return ok(resumeSnapshots.toList())
    }

    override suspend fun resumeAnalysis(analysisId: Long): ApiEnvelope<ArchivedResumeAnalysis> {
        failIfExpiredToken()
        return ok(requireNotNull(resumeDetails.firstOrNull { it.id == analysisId }))
    }

    override suspend fun deleteResumeAnalysis(analysisId: Long): ApiEnvelope<Any> {
        failIfExpiredToken()
        deletedResumeAnalysisIds += analysisId
        resumeDetails.removeAll { it.id == analysisId }
        resumeSnapshots.removeAll { it.id == analysisId }
        return ok(mapOf("deleted" to true))
    }

    private fun failIfExpiredToken() {
        if (expiredTokens.contains(tokenProvider?.invoke())) {
            throw com.careerdecision.mobile.network.ApiException("Unauthorized.", apiCode = 401, httpStatus = 401)
        }
    }

    private fun archivedPlan(request: PathPlanArchiveRequest, taskStatus: String): ArchivedPathPlan =
        ArchivedPathPlan(
            id = 301,
            agentRunId = request.agentRunId,
            targetRole = request.targetRole,
            overview = request.overview,
            status = "active",
            taskCount = 1,
            completedTaskCount = if (taskStatus == "done") 1 else 0,
            progressPercent = if (taskStatus == "done") 100 else 0,
            milestones = listOf(
                ArchivedPathMilestone(
                    id = 501,
                    title = request.milestones.single().title,
                    duration = request.milestones.single().duration,
                    tasks = listOf(PathTask(id = 601, content = request.milestones.single().tasks.single(), status = taskStatus, completedAt = null)),
                    acceptance = request.milestones.single().acceptance
                )
            ),
            checkpoints = request.checkpoints,
            createdAt = "2026-06-11T05:40:00",
            updatedAt = "2026-06-11T05:40:00"
        )

    private fun pathSnapshot(completedTaskCount: Int, progressPercent: Int): PathPlanSnapshot =
        PathPlanSnapshot(
            id = 301,
            agentRunId = 202,
            targetRole = "AI 应用工程师",
            overview = "30 天完成 AI 应用工程师作品集闭环。",
            status = "active",
            milestoneCount = 1,
            taskCount = 1,
            completedTaskCount = completedTaskCount,
            progressPercent = progressPercent,
            createdAt = "2026-06-11T05:40:00",
            updatedAt = "2026-06-11T05:40:00"
        )

    companion object {
        val user = UserInfo(id = 7, username = "miku", email = "miku@example.com", phone = null)

        val jobs = listOf(
            JobSummary(
                id = 11,
                title = "AI 应用工程师",
                company = "未来音色科技",
                city = "上海",
                location = "上海",
                direction = "AI 应用",
                industry = "人工智能",
                companySize = "100-499",
                salaryRange = "18k-28k",
                salaryMin = 18,
                salaryMax = 28,
                salaryPeriod = "monthly",
                salaryMonths = 13,
                experienceLevel = "校招",
                tags = listOf("Kotlin", "Spring Boot", "Python"),
                summary = "负责 AI 应用产品工程化",
                qualityScore = 0.92
            ),
            JobSummary(
                id = 12,
                title = "LLM 产品助理",
                company = "音色实验室",
                city = "杭州",
                location = "杭州",
                direction = "AI 产品",
                industry = "人工智能",
                companySize = "50-99",
                salaryRange = "12k-20k",
                salaryMin = 12,
                salaryMax = 20,
                salaryPeriod = "monthly",
                salaryMonths = 13,
                experienceLevel = "校招",
                tags = listOf("Prompt", "SQL", "Vue 3"),
                summary = "负责 LLM 产品方案与数据分析",
                qualityScore = 0.86
            )
        )

        val questions = listOf(
            MbtiQuestion(
                id = 1,
                text = "更偏向独立深入还是外部协作？",
                options = listOf(
                    MbtiOption(code = "I", text = "独立深入", dimension = "EI", direction = "I"),
                    MbtiOption(code = "E", text = "外部协作", dimension = "EI", direction = "E")
                )
            ),
            MbtiQuestion(
                id = 2,
                text = "更关注抽象趋势还是现实细节？",
                options = listOf(
                    MbtiOption(code = "N", text = "抽象趋势", dimension = "SN", direction = "N"),
                    MbtiOption(code = "S", text = "现实细节", dimension = "SN", direction = "S")
                )
            )
        )

        fun baseProfile(): UserProfile =
            UserProfile(
                userId = user.id,
                displayName = user.username,
                identityType = "student",
                school = "虚拟大学",
                major = "软件工程",
                degree = "本科",
                targetRole = null,
                targetCities = emptyList(),
                expectedSalary = null,
                skills = emptyList(),
                certificates = emptyList(),
                experiences = emptyList(),
                values = emptyList(),
                completed = false,
                updatedAt = null
            )

        fun <T> ok(data: T): ApiEnvelope<T> =
            ApiEnvelope(code = 0, message = "ok", data = data, timestamp = 1781071200000, traceId = "test-trace")
    }
}
