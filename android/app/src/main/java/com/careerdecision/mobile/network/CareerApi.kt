package com.careerdecision.mobile.network

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.PUT
import retrofit2.http.Query
import java.util.UUID
import java.util.concurrent.TimeUnit

data class ApiEnvelope<T>(
    val code: Int,
    val message: String,
    val data: T?,
    val timestamp: Long,
    val traceId: String?
)

data class UserInfo(val id: Long, val username: String, val email: String?, val phone: String?)
data class RegisterRequest(
    val username: String,
    val password: String,
    val confirmPassword: String,
    val email: String? = null,
    val phone: String? = null
)
data class LoginRequest(val username: String, val password: String)
data class RefreshTokenRequest(val refreshToken: String)
data class LoginResponse(val token: String, val refreshToken: String, val user: UserInfo)

data class UserProfile(
    val userId: Long,
    val displayName: String?,
    val identityType: String?,
    val school: String?,
    val major: String?,
    val degree: String?,
    val grade: String?,
    val graduationDate: String?,
    val city: String?,
    val targetRole: String?,
    val targetCities: List<String>,
    val expectedSalary: String?,
    val currentConfusion: String?,
    val existingDirections: List<String>,
    val weeklyAvailableMinutes: Int?,
    val onboardingCompleted: Boolean,
    val profileVersion: Int,
    val skills: List<String>,
    val certificates: List<String>,
    val experiences: List<String>,
    val values: List<String>,
    val preferredIndustries: List<String>,
    val preferredWorkModes: List<String>,
    val constraints: List<String>,
    val externalAiConsent: Boolean,
    val completed: Boolean,
    val updatedAt: String?
)

data class UserProfileRequest(
    val displayName: String? = null,
    val identityType: String? = null,
    val school: String? = null,
    val major: String? = null,
    val degree: String? = null,
    val grade: String? = null,
    val graduationDate: String? = null,
    val city: String? = null,
    val targetRole: String? = null,
    val targetCities: List<String>? = null,
    val expectedSalary: String? = null,
    val currentConfusion: String? = null,
    val existingDirections: List<String>? = null,
    val weeklyAvailableMinutes: Int? = null,
    val skills: List<String>? = null,
    val certificates: List<String>? = null,
    val experiences: List<String>? = null,
    val values: List<String>? = null,
    val preferredIndustries: List<String>? = null,
    val preferredWorkModes: List<String>? = null,
    val constraints: List<String>? = null,
    val externalAiConsent: Boolean? = null,
    val completeOnboarding: Boolean? = null,
    val expectedVersion: Int? = null
)

data class JobSummary(
    val id: Long,
    val title: String,
    val company: String,
    val city: String?,
    val location: String?,
    val direction: String?,
    val industry: String?,
    val companySize: String?,
    val salaryRange: String?,
    val salaryMin: Int?,
    val salaryMax: Int?,
    val salaryPeriod: String?,
    val salaryMonths: Int?,
    val experienceLevel: String?,
    val tags: List<String>,
    val summary: String?,
    val qualityScore: Double?
)

data class JobDetail(
    val id: Long,
    val title: String,
    val company: String,
    val location: String?,
    val direction: String?,
    val salaryRange: String?,
    val experienceLevel: String?,
    val education: String?,
    val tags: List<String>,
    val summary: String,
    val responsibilities: List<String>,
    val requirements: List<String>,
    val growthPath: List<String>,
    val interviewFocus: List<String>
)

data class JobRecommendationRequest(
    val profile: Map<String, Any>,
    val assessment: Map<String, Any>? = null,
    val limit: Int? = null
)

data class JobMatch(
    val job: JobSummary,
    val matchScore: Int,
    val reasons: List<String>
)

data class JobPage<T>(
    val items: List<T>,
    val page: Int,
    val size: Int,
    val totalElements: Long,
    val totalPages: Int,
    val hasNext: Boolean,
    val hasPrevious: Boolean
)

data class MbtiOption(val code: String, val text: String, val dimension: String, val direction: String)
data class MbtiQuestion(val id: Int, val text: String, val options: List<MbtiOption>)
data class MbtiSubmitRequest(val answers: Map<Int, String>, val userId: Long?)
data class MbtiResult(val type: String, val scores: Map<String, Int>, val description: String)

data class CareerOption(
    val title: String,
    @SerializedName("match_score") val matchScore: Int,
    val reasons: List<String>,
    @SerializedName("core_skills") val coreSkills: List<String>,
    val risks: List<String>
)

data class SkillGapItem(val skill: String, val priority: String, val suggestion: String)

data class CareerReport(
    val agentRunId: Long? = null,
    val summary: String,
    @SerializedName("profile_tags") val profileTags: List<String>,
    val strengths: List<String>,
    val risks: List<String>,
    @SerializedName("recommended_careers") val recommendedCareers: List<CareerOption>,
    @SerializedName("skill_gaps") val skillGaps: List<SkillGapItem>,
    @SerializedName("next_actions") val nextActions: List<String>,
    val confidence: Double
)

data class CareerReportRequest(
    val requestId: String,
    val userId: String?,
    val profile: Map<String, Any>,
    val assessment: Map<String, Any>
)

data class ReportArchiveRequest(
    val type: String,
    val title: String,
    val summary: String,
    val content: String,
    val agentRunId: Long? = null
)

data class ReportSnapshot(
    val id: String,
    val userId: String,
    val agentRunId: Long? = null,
    val type: String,
    val title: String,
    val summary: String,
    val content: String,
    val createdAt: String?,
    val updatedAt: String?
)

data class ReportPage(
    val items: List<ReportSnapshot>,
    val page: Int,
    val size: Int,
    val total: Long,
    val totalPages: Int
)

data class PathMilestone(
    val title: String,
    val duration: String,
    val tasks: List<String>,
    val acceptance: List<String>
)

data class PathPlan(
    val agentRunId: Long? = null,
    @SerializedName("target_role") val targetRole: String,
    val overview: String,
    val milestones: List<PathMilestone>,
    val checkpoints: List<String>
)

data class PathPlanRequest(
    val requestId: String,
    val userId: String?,
    val profile: Map<String, Any>,
    val targetRole: String
)

data class PathPlanArchiveRequest(
    val targetRole: String,
    val overview: String,
    val agentRunId: Long? = null,
    val milestones: List<PathMilestone>,
    val checkpoints: List<String>
)

data class PathTask(
    val id: Long,
    val content: String,
    val status: String,
    val completedAt: String?
)

data class ArchivedPathMilestone(
    val id: Long,
    val title: String,
    val duration: String,
    val tasks: List<PathTask>,
    val acceptance: List<String>
)

data class ArchivedPathPlan(
    val id: Long,
    val agentRunId: Long? = null,
    val targetRole: String,
    val overview: String?,
    val status: String,
    val taskCount: Int,
    val completedTaskCount: Int,
    val progressPercent: Int,
    val milestones: List<ArchivedPathMilestone>,
    val checkpoints: List<String>,
    val createdAt: String?,
    val updatedAt: String?
)

data class PathTaskStatusRequest(val status: String)

data class PathPlanSnapshot(
    val id: Long,
    val agentRunId: Long? = null,
    val targetRole: String,
    val overview: String?,
    val status: String,
    val milestoneCount: Int,
    val taskCount: Int,
    val completedTaskCount: Int,
    val progressPercent: Int,
    val createdAt: String?,
    val updatedAt: String?
)

data class ResumeAnalysisRequest(
    val requestId: String,
    val userId: String?,
    val targetRole: String?,
    val resumeText: String
)

data class ResumeAnalysis(
    val agentRunId: Long? = null,
    val score: Int,
    @SerializedName("ats_score") val atsScore: Int,
    @SerializedName("keyword_match") val keywordMatch: Int,
    val issues: List<String>,
    val suggestions: List<String>,
    @SerializedName("improved_fragments") val improvedFragments: List<String>
)

data class ResumeAnalysisArchivePayload(
    val score: Int?,
    val atsScore: Int?,
    val keywordMatch: Int?,
    val issues: List<String>,
    val suggestions: List<String>,
    val improvedFragments: List<String>
)

data class ResumeAnalysisArchiveRequest(
    val targetRole: String?,
    val resumeText: String,
    val agentRunId: Long? = null,
    val analysis: ResumeAnalysisArchivePayload
)

data class ArchivedResumeAnalysis(
    val id: Long,
    val agentRunId: Long? = null,
    val targetRole: String?,
    val score: Int?,
    val atsScore: Int?,
    val keywordMatch: Int?,
    val issues: List<String>,
    val suggestions: List<String>,
    val improvedFragments: List<String>,
    val createdAt: String?
)

data class ResumeAnalysisSnapshot(
    val id: Long,
    val agentRunId: Long? = null,
    val targetRole: String?,
    val score: Int?,
    val atsScore: Int?,
    val keywordMatch: Int?,
    val issueCount: Int,
    val suggestionCount: Int,
    val createdAt: String?
)

interface CareerApi {
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): ApiEnvelope<UserInfo>

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): ApiEnvelope<LoginResponse>

    @POST("auth/refresh")
    suspend fun refresh(@Body request: RefreshTokenRequest): ApiEnvelope<LoginResponse>

    @POST("auth/logout")
    suspend fun logout(): ApiEnvelope<Any>

    @GET("dashboard")
    suspend fun dashboard(): ApiEnvelope<DashboardResponse>

    @GET("action-plans")
    suspend fun actionPlans(): ApiEnvelope<List<ActionPlanSummary>>

    @GET("action-plans/{planId}")
    suspend fun actionPlan(@Path("planId") planId: Long): ApiEnvelope<ActionPlanDetail>

    @GET("action-plans/current/today")
    suspend fun today(): ApiEnvelope<TodayResponse>

    @PATCH("action-plans/{planId}/tasks/{taskId}/status")
    suspend fun updateActionTaskStatus(
        @Path("planId") planId: Long,
        @Path("taskId") taskId: Long,
        @Body request: ActionTaskStatusRequest
    ): ApiEnvelope<ActionPlanDetail>

    @POST("action-plans/{planId}/tasks/{taskId}/results")
    suspend fun addActionTaskResult(
        @Path("planId") planId: Long,
        @Path("taskId") taskId: Long,
        @Body request: ActionTaskResultRequest
    ): ApiEnvelope<ActionPlanDetail>

    @POST("action-plans/{planId}/coach")
    suspend fun coachActionPlan(
        @Path("planId") planId: Long,
        @Body request: CoachingRequest
    ): ApiEnvelope<ActionCoachResponse>

    @POST("chat/messages")
    suspend fun sendChatMessage(@Body request: AssistantChatRequest): ApiEnvelope<AssistantChatResponse>

    @POST("decision-projects/{projectId}/targets/{targetId}/confidence-feedback")
    suspend fun submitConfidenceFeedback(
        @Path("projectId") projectId: Long,
        @Path("targetId") targetId: Long,
        @Body request: ConfidenceFeedbackRequest
    ): ApiEnvelope<ConfidenceFeedbackResponse>

    @PUT("weekly-reviews")
    suspend fun saveWeeklyReview(
        @Body request: WeeklyReviewRequest
    ): ApiEnvelope<WeeklyReviewResponse>

    @POST("weekly-reviews/{reviewId}/submit")
    suspend fun submitWeeklyReview(
        @Path("reviewId") reviewId: Long
    ): ApiEnvelope<WeeklyReviewResponse>

    @GET("users/me/profile")
    suspend fun profile(): ApiEnvelope<UserProfile>

    @PUT("users/me/profile")
    suspend fun saveProfile(@Body request: UserProfileRequest): ApiEnvelope<UserProfile>

    @GET("jobs")
    suspend fun jobs(
        @Query("keyword") keyword: String? = null,
        @Query("page") page: Int = 0,
        @Query("size") size: Int = 10
    ): ApiEnvelope<JobPage<JobSummary>>

    @GET("jobs/{id}")
    suspend fun jobDetail(@Path("id") id: Long): ApiEnvelope<JobDetail>

    @POST("jobs/recommendations")
    suspend fun recommendJobs(@Body request: JobRecommendationRequest): ApiEnvelope<List<JobMatch>>

    @GET("jobs/favorites")
    suspend fun favoriteJobs(): ApiEnvelope<List<JobSummary>>

    @POST("jobs/favorites/{id}")
    suspend fun addFavoriteJob(@Path("id") id: Long): ApiEnvelope<List<JobSummary>>

    @DELETE("jobs/favorites/{id}")
    suspend fun removeFavoriteJob(@Path("id") id: Long): ApiEnvelope<List<JobSummary>>

    @GET("jobs/targets")
    suspend fun targetJobs(): ApiEnvelope<List<JobSummary>>

    @POST("jobs/targets/{id}")
    suspend fun addTargetJob(@Path("id") id: Long): ApiEnvelope<List<JobSummary>>

    @DELETE("jobs/targets/{id}")
    suspend fun removeTargetJob(@Path("id") id: Long): ApiEnvelope<List<JobSummary>>

    @GET("assessments/mbti/questions")
    suspend fun mbtiQuestions(): ApiEnvelope<List<MbtiQuestion>>

    @POST("assessments/mbti/submit")
    suspend fun submitMbti(@Body request: MbtiSubmitRequest): ApiEnvelope<MbtiResult>

    @POST("career-reports/generate")
    suspend fun generateReport(@Body request: CareerReportRequest): ApiEnvelope<CareerReport>

    @POST("reports/archive")
    suspend fun archiveReport(@Body request: ReportArchiveRequest): ApiEnvelope<ReportSnapshot>

    @GET("reports")
    suspend fun reports(
        @Query("type") type: String? = null,
        @Query("page") page: Int = 0,
        @Query("size") size: Int = 6
    ): ApiEnvelope<ReportPage>

    @GET("reports/{id}")
    suspend fun report(@Path("id") id: String): ApiEnvelope<ReportSnapshot>

    @DELETE("reports/{id}")
    suspend fun deleteReport(@Path("id") id: String): ApiEnvelope<Any>

    @POST("path-plans/generate")
    suspend fun generatePathPlan(@Body request: PathPlanRequest): ApiEnvelope<PathPlan>

    @POST("path-plans/archive")
    suspend fun archivePathPlan(@Body request: PathPlanArchiveRequest): ApiEnvelope<ArchivedPathPlan>

    @GET("path-plans")
    suspend fun pathPlans(@Query("page") page: Int = 0, @Query("size") size: Int = 6): ApiEnvelope<List<PathPlanSnapshot>>

    @GET("path-plans/{planId}")
    suspend fun pathPlan(@Path("planId") planId: Long): ApiEnvelope<ArchivedPathPlan>

    @PATCH("path-plans/{planId}/tasks/{taskId}")
    suspend fun updatePathTask(
        @Path("planId") planId: Long,
        @Path("taskId") taskId: Long,
        @Body request: PathTaskStatusRequest
    ): ApiEnvelope<ArchivedPathPlan>

    @DELETE("path-plans/{planId}")
    suspend fun deletePathPlan(@Path("planId") planId: Long): ApiEnvelope<Any>

    @POST("resumes/analyze")
    suspend fun analyzeResume(@Body request: ResumeAnalysisRequest): ApiEnvelope<ResumeAnalysis>

    @POST("resumes/analyses/archive")
    suspend fun archiveResumeAnalysis(@Body request: ResumeAnalysisArchiveRequest): ApiEnvelope<ArchivedResumeAnalysis>

    @GET("resumes/analyses")
    suspend fun resumeAnalyses(@Query("page") page: Int = 0, @Query("size") size: Int = 6): ApiEnvelope<List<ResumeAnalysisSnapshot>>

    @GET("resumes/analyses/{analysisId}")
    suspend fun resumeAnalysis(@Path("analysisId") analysisId: Long): ApiEnvelope<ArchivedResumeAnalysis>

    @DELETE("resumes/analyses/{analysisId}")
    suspend fun deleteResumeAnalysis(@Path("analysisId") analysisId: Long): ApiEnvelope<Any>
}

fun <T> ApiEnvelope<T>.unwrap(): T {
    if (code != 0 || data == null) {
        throw ApiException(message.ifBlank { "Request failed" }, apiCode = code, traceId = traceId)
    }
    return data
}

fun <T> ApiEnvelope<T>.requireSuccess() {
    if (code != 0) {
        throw ApiException(message.ifBlank { "Request failed" }, apiCode = code, traceId = traceId)
    }
}

object CareerApiFactory {
    internal const val REQUEST_ID_HEADER = "X-Request-ID"
    val gson: Gson = Gson()

    internal fun withClientHeaders(
        original: Request,
        token: String?,
        generatedRequestId: String = "android-${UUID.randomUUID()}"
    ): Request = original.newBuilder().apply {
        if (original.header(REQUEST_ID_HEADER).isNullOrBlank()) {
            header(REQUEST_ID_HEADER, generatedRequestId)
        }
        if (!token.isNullOrBlank()) {
            header("Authorization", "Bearer $token")
        }
    }.build()

    fun create(tokenProvider: () -> String?): CareerApi {
        val clientBuilder = OkHttpClient.Builder()
            .connectTimeout(RequestConfig.CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(RequestConfig.READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(RequestConfig.WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val request = withClientHeaders(chain.request(), tokenProvider())
                chain.proceed(request)
            }

        if (RequestConfig.HTTP_LOG_LEVEL != HttpLoggingInterceptor.Level.NONE) {
            clientBuilder.addInterceptor(HttpLoggingInterceptor().apply {
                level = RequestConfig.HTTP_LOG_LEVEL
            })
        }

        val client = clientBuilder.build()

        return Retrofit.Builder()
            .baseUrl(RequestConfig.BACKEND_API_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
            .create(CareerApi::class.java)
    }
}
