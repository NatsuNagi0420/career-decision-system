param(
    [string] $BackendBaseUrl = "",
    [string] $AgentBaseUrl = "",
    [int] $TimeoutSeconds = 10,
    [switch] $RequireRealModel
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BackendBaseUrl)) {
    $BackendBaseUrl = if ([string]::IsNullOrWhiteSpace($env:BACKEND_BASE_URL)) {
        "https://192.168.1.159:8443"
    } else {
        $env:BACKEND_BASE_URL
    }
}

if ([string]::IsNullOrWhiteSpace($AgentBaseUrl)) {
    $AgentBaseUrl = if ([string]::IsNullOrWhiteSpace($env:AGENT_SERVER_BASE_URL)) {
        "http://127.0.0.1:8001"
    } else {
        $env:AGENT_SERVER_BASE_URL
    }
}

function Join-Url {
    param(
        [Parameter(Mandatory = $true)]
        [string] $BaseUrl,
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    return $BaseUrl.TrimEnd("/") + "/" + $Path.TrimStart("/")
}

function To-Array {
    param([object] $Value)

    if ($null -eq $Value) {
        return @()
    }
    if ($Value -is [System.Array]) {
        return $Value
    }
    return @($Value)
}

function First-Text {
    param([object[]] $Values)

    foreach ($Value in $Values) {
        if ($null -ne $Value -and -not [string]::IsNullOrWhiteSpace([string] $Value)) {
            return ([string] $Value).Trim()
        }
    }
    return ""
}

function Invoke-SmokeJson {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [Parameter(Mandatory = $true)]
        [string] $Method,
        [Parameter(Mandatory = $true)]
        [string] $Url,
        [object] $Body = $null,
        [hashtable] $Headers = @{}
    )

    try {
        $RequestHeaders = @{}
        foreach ($HeaderName in $Headers.Keys) {
            $RequestHeaders[$HeaderName] = $Headers[$HeaderName]
        }
        if (-not $RequestHeaders.ContainsKey("X-Request-ID")) {
            $RequestHeaders["X-Request-ID"] = "smoke-script-" + [guid]::NewGuid().ToString("N")
        }
        $Response = $null
        if ($null -eq $Body) {
            $Response = Invoke-WebRequest `
                -UseBasicParsing `
                -Method $Method `
                -Uri $Url `
                -Headers $RequestHeaders `
                -TimeoutSec $TimeoutSeconds
        } else {
            $JsonBody = $Body | ConvertTo-Json -Depth 32
            $BodyBytes = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
            $Response = Invoke-WebRequest `
                -UseBasicParsing `
                -Method $Method `
                -Uri $Url `
                -Headers $RequestHeaders `
                -Body $BodyBytes `
                -ContentType "application/json; charset=utf-8" `
                -TimeoutSec $TimeoutSeconds
        }

        $Response.RawContentStream.Position = 0
        $Reader = [System.IO.StreamReader]::new($Response.RawContentStream, [System.Text.Encoding]::UTF8)
        return $Reader.ReadToEnd() | ConvertFrom-Json
    } catch {
        throw "$Name failed at $Method $Url. Start the required local service or override the base URL. $($_.Exception.Message)"
    }
}

function Assert-EnvelopeSuccess {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [Parameter(Mandatory = $true)]
        [object] $Response
    )

    if ($null -eq $Response) {
        throw "$Name returned no response."
    }
    if ($Response.code -ne 0) {
        throw "$Name returned code $($Response.code): $($Response.message)"
    }
}

function Assert-True {
    param(
        [Parameter(Mandatory = $true)]
        [bool] $Condition,
        [Parameter(Mandatory = $true)]
        [string] $Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Assert-NotBlank {
    param(
        [object] $Value,
        [Parameter(Mandatory = $true)]
        [string] $Message
    )

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string] $Value)) {
        throw $Message
    }
}

function Assert-CollectionNotEmpty {
    param(
        [object] $Value,
        [Parameter(Mandatory = $true)]
        [string] $Message
    )

    $Items = @(To-Array $Value)
    if ($Items.Count -le 0) {
        throw $Message
    }
}

Write-Host "API smoke target backend: $BackendBaseUrl" -ForegroundColor Cyan
Write-Host "API smoke target agent:   $AgentBaseUrl" -ForegroundColor Cyan

Assert-True ($BackendBaseUrl -match '^https://') "Backend smoke target must use HTTPS. Actual value: $BackendBaseUrl"

$AgentHealth = Invoke-SmokeJson "Agent health" "GET" (Join-Url $AgentBaseUrl "/api/v1/health")
Assert-EnvelopeSuccess "Agent health" $AgentHealth
Assert-True ($AgentHealth.data.status -eq "ok") "Agent health did not return status=ok."
if ($RequireRealModel) {
    Assert-True (
        -not [string]::IsNullOrWhiteSpace([string] $AgentHealth.data.llmProvider) -and
        [string] $AgentHealth.data.llmProvider -ne "mock"
    ) "Real-model smoke requires a non-mock Agent provider. Configure agent_server/.env and restart Agent."
    Write-Host "Real-model verification enabled. One external model call may incur provider cost." -ForegroundColor Yellow
}
Write-Host "OK agent health"

$AgentReady = Invoke-SmokeJson "Agent readiness" "GET" (Join-Url $AgentBaseUrl "/api/v1/ready")
Assert-EnvelopeSuccess "Agent readiness" $AgentReady
Assert-True ($AgentReady.data.status -eq "ready") "Agent readiness did not return status=ready."
Write-Host "OK agent readiness"

$BackendHealth = Invoke-SmokeJson "Backend health" "GET" (Join-Url $BackendBaseUrl "/api/v1/health")
Assert-EnvelopeSuccess "Backend health" $BackendHealth
Assert-True ($BackendHealth.data.status -eq "ok") "Backend health did not return status=ok."
Assert-True ($BackendHealth.data.service -eq "backend") "Backend health did not identify the backend service."
Write-Host "OK backend health"

$BackendReady = Invoke-SmokeJson "Backend readiness" "GET" (Join-Url $BackendBaseUrl "/api/v1/ready")
Assert-EnvelopeSuccess "Backend readiness" $BackendReady
Assert-True ($BackendReady.data.status -eq "ready") "Backend readiness did not return status=ready."
Assert-True ($BackendReady.data.database -eq "ok") "Backend readiness did not report database=ok."
Write-Host "OK backend readiness"

$Jobs = Invoke-SmokeJson "Job search" "GET" (Join-Url $BackendBaseUrl "/api/v1/jobs?page=0&size=3")
Assert-EnvelopeSuccess "Job search" $Jobs
$JobItems = @(To-Array $Jobs.data.items)
Assert-CollectionNotEmpty $JobItems "Job search returned no rows. Import job data before running smoke."
Assert-True ($JobItems.Count -ge 2) "First-version decision smoke requires at least two real job rows."
$PrimaryJob = $JobItems[0]
$BackupJob = $JobItems[1]
Assert-NotBlank $PrimaryJob.id "First job row does not include an id."
Assert-NotBlank $PrimaryJob.title "First job row does not include a title."
$TargetRole = ([string] $PrimaryJob.title).Trim()
Write-Host "OK job search returned $($JobItems.Count) rows"

$MbtiQuestions = Invoke-SmokeJson "MBTI questions" "GET" (Join-Url $BackendBaseUrl "/api/v1/assessments/mbti/questions")
Assert-EnvelopeSuccess "MBTI questions" $MbtiQuestions
$QuestionItems = @(To-Array $MbtiQuestions.data)
Assert-CollectionNotEmpty $QuestionItems "MBTI questions returned no rows."
Write-Host "OK MBTI questions returned $($QuestionItems.Count) rows"

$SmokeSuffix = [guid]::NewGuid().ToString("N").Substring(0, 12)
$SmokeUsername = "smoke_$SmokeSuffix"
$SmokePassword = "Smoke123!"

$Register = Invoke-SmokeJson "Auth register" "POST" (Join-Url $BackendBaseUrl "/api/v1/auth/register") @{
    username = $SmokeUsername
    email = "$SmokeUsername@example.test"
    password = $SmokePassword
    confirmPassword = $SmokePassword
}
Assert-EnvelopeSuccess "Auth register" $Register
Assert-True ($Register.data.username -eq $SmokeUsername) "Registered user name did not round-trip."
Write-Host "OK auth register"

$Login = Invoke-SmokeJson "Auth login" "POST" (Join-Url $BackendBaseUrl "/api/v1/auth/login") @{
    username = $SmokeUsername
    password = $SmokePassword
}
Assert-EnvelopeSuccess "Auth login" $Login
Assert-NotBlank $Login.data.token "Login did not return a bearer token."
Assert-NotBlank $Login.data.refreshToken "Login did not return a refresh token."
Assert-NotBlank $Login.data.user.id "Login did not return a user id."
$Token = [string] $Login.data.token
$RefreshToken = [string] $Login.data.refreshToken
$UserId = [long] $Login.data.user.id
$AuthHeaders = @{ Authorization = "Bearer $Token" }
Write-Host "OK auth login for user $UserId"

$Refresh = Invoke-SmokeJson "Auth refresh" "POST" (Join-Url $BackendBaseUrl "/api/v1/auth/refresh") @{
    refreshToken = $RefreshToken
}
Assert-EnvelopeSuccess "Auth refresh" $Refresh
Assert-NotBlank $Refresh.data.token "Refresh did not return a new bearer token."
Assert-NotBlank $Refresh.data.refreshToken "Refresh did not return a rotated refresh token."
Assert-True ([string] $Refresh.data.token -ne $Token) "Refresh returned the same bearer token."
Assert-True ([string] $Refresh.data.refreshToken -ne $RefreshToken) "Refresh token was not rotated."

try {
    Invoke-SmokeJson "Old refresh reuse" "POST" (Join-Url $BackendBaseUrl "/api/v1/auth/refresh") @{
        refreshToken = $RefreshToken
    } | Out-Null
    throw "Old refresh token was accepted after rotation."
} catch {
    if ($_.Exception.Message -eq "Old refresh token was accepted after rotation.") {
        throw
    }
    Assert-True ($_.Exception.Message -match "401|Unauthorized|Invalid refresh token") "Old refresh token reuse failed for an unexpected reason: $($_.Exception.Message)"
}

$Token = [string] $Refresh.data.token
$RefreshToken = [string] $Refresh.data.refreshToken
$AuthHeaders = @{ Authorization = "Bearer $Token" }
Write-Host "OK auth refresh rotated tokens"

$Me = Invoke-SmokeJson "Current user" "GET" (Join-Url $BackendBaseUrl "/api/v1/users/me") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Current user" $Me
Assert-True ([long] $Me.data.id -eq $UserId) "Current user id does not match login user id."
Write-Host "OK current user"

$TargetCity = First-Text @($PrimaryJob.city, $PrimaryJob.location, "Shanghai")
$ProfilePayload = @{
    displayName = "Smoke User"
    identityType = "student"
    school = "Local Smoke University"
    major = "Computer Science"
    degree = "Bachelor"
    targetRole = $TargetRole
    targetCities = @($TargetCity)
    expectedSalary = "20k-30k"
    skills = @("Java", "Vue 3", "Python", "LLM")
    certificates = @("Smoke Certificate")
    experiences = @("Built an AI career planning prototype")
    values = @("growth", "impact")
    externalAiConsent = $false
}
$SavedProfile = Invoke-SmokeJson "Profile save" "PUT" (Join-Url $BackendBaseUrl "/api/v1/users/me/profile") $ProfilePayload $AuthHeaders
Assert-EnvelopeSuccess "Profile save" $SavedProfile
Assert-True ($SavedProfile.data.completed -eq $true) "Saved profile is not marked completed."
Assert-True (([string] $SavedProfile.data.targetRole).Trim() -eq $TargetRole) "Saved profile target role did not round-trip."
Write-Host "OK profile save"

$ChatRequestId = "smoke-chat-" + [guid]::NewGuid().ToString("N")
$ChatPayload = @{
    requestId = $ChatRequestId
    page = "/profile"
    message = "What evidence should I add first?"
    context = @{ routePath = "/profile" }
}
$ChatFirst = Invoke-SmokeJson "Context chat first message" "POST" (Join-Url $BackendBaseUrl "/api/v1/chat/messages") $ChatPayload $AuthHeaders
Assert-EnvelopeSuccess "Context chat first message" $ChatFirst
Assert-True ([long] $ChatFirst.data.sessionId -gt 0) "Chat did not return a persisted sessionId."
Assert-NotBlank $ChatFirst.data.reply "Chat reply is empty."
Assert-True ([long] $ChatFirst.data.agentRunId -gt 0) "Chat did not return an Agent audit id."
$ChatRepeated = Invoke-SmokeJson "Context chat idempotent retry" "POST" (Join-Url $BackendBaseUrl "/api/v1/chat/messages") $ChatPayload $AuthHeaders
Assert-EnvelopeSuccess "Context chat idempotent retry" $ChatRepeated
Assert-True ([long] $ChatRepeated.data.sessionId -eq [long] $ChatFirst.data.sessionId) "Chat retry changed the session."
Assert-True ([long] $ChatRepeated.data.agentRunId -eq [long] $ChatFirst.data.agentRunId) "Chat retry did not return the cached Agent result."
$ChatFollowUp = Invoke-SmokeJson "Context chat follow-up" "POST" (Join-Url $BackendBaseUrl "/api/v1/chat/messages") @{
    requestId = "smoke-chat-follow-up-" + [guid]::NewGuid().ToString("N")
    sessionId = [long] $ChatFirst.data.sessionId
    page = "/profile"
    message = "What should I verify next?"
    context = @{ routePath = "/profile" }
} $AuthHeaders
Assert-EnvelopeSuccess "Context chat follow-up" $ChatFollowUp
Assert-True ([long] $ChatFollowUp.data.sessionId -eq [long] $ChatFirst.data.sessionId) "Chat follow-up did not continue the session."
$ChatSessionId = [long] $ChatFirst.data.sessionId
$ChatSessions = Invoke-SmokeJson "Chat session list" "GET" (Join-Url $BackendBaseUrl "/api/v1/chat/sessions") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Chat session list" $ChatSessions
$ListedChatSession = @(To-Array $ChatSessions.data | Where-Object { [long] $_.id -eq $ChatSessionId })
Assert-True ($ListedChatSession.Count -eq 1) "Persisted chat session was not returned exactly once."
Assert-True ([int] $ListedChatSession[0].messageCount -eq 4) "Chat session list did not report the two persisted turns."

$ChatSessionDetail = Invoke-SmokeJson "Chat session detail" "GET" (Join-Url $BackendBaseUrl "/api/v1/chat/sessions/$ChatSessionId") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Chat session detail" $ChatSessionDetail
$ChatSessionMessages = @(To-Array $ChatSessionDetail.data.messages)
Assert-True ($ChatSessionMessages.Count -eq 4) "Chat session detail did not restore every persisted message."
$RestoredAssistantMessages = @($ChatSessionMessages | Where-Object { [string] $_.role -eq "assistant" })
Assert-True ($RestoredAssistantMessages.Count -eq 2) "Chat session detail did not restore both assistant messages."
Assert-NotBlank $RestoredAssistantMessages[0].response.reply "Restored assistant response lost its structured reply."

$RenamedChatSession = Invoke-SmokeJson "Chat session rename" "PATCH" (Join-Url $BackendBaseUrl "/api/v1/chat/sessions/$ChatSessionId") @{
    title = "Smoke conversation history"
} $AuthHeaders
Assert-EnvelopeSuccess "Chat session rename" $RenamedChatSession
Assert-True ([string] $RenamedChatSession.data.title -eq "Smoke conversation history") "Chat session title did not round-trip."

$DeletedChatSession = Invoke-SmokeJson "Chat session delete" "DELETE" (Join-Url $BackendBaseUrl "/api/v1/chat/sessions/$ChatSessionId") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Chat session delete" $DeletedChatSession
Assert-True ($DeletedChatSession.data.deleted -eq $true) "Chat session was not permanently deleted."
$ChatSessionsAfterDelete = Invoke-SmokeJson "Chat session list after delete" "GET" (Join-Url $BackendBaseUrl "/api/v1/chat/sessions") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Chat session list after delete" $ChatSessionsAfterDelete
$DeletedStillListed = @(To-Array $ChatSessionsAfterDelete.data | Where-Object { [long] $_.id -eq $ChatSessionId })
Assert-True ($DeletedStillListed.Count -eq 0) "Deleted chat session remained visible in the active list."
Write-Host "OK persisted context chat, retry, restore, rename, and delete"

$MbtiAnswers = @{}
foreach ($Question in $QuestionItems) {
    $Options = @(To-Array $Question.options)
    Assert-CollectionNotEmpty $Options "MBTI question $($Question.id) has no options."
    $MbtiAnswers[[string] $Question.id] = [string] $Options[0].code
}
$MbtiSubmit = Invoke-SmokeJson "MBTI submit" "POST" (Join-Url $BackendBaseUrl "/api/v1/assessments/mbti/submit") @{
    answers = $MbtiAnswers
} $AuthHeaders
Assert-EnvelopeSuccess "MBTI submit" $MbtiSubmit
Assert-NotBlank $MbtiSubmit.data.type "MBTI submit did not return a type."
Write-Host "OK MBTI submit returned $($MbtiSubmit.data.type)"
$MbtiHistory = Invoke-SmokeJson "MBTI history" "GET" (Join-Url $BackendBaseUrl "/api/v1/assessments/mbti/history") -Headers $AuthHeaders
Assert-EnvelopeSuccess "MBTI history" $MbtiHistory
Assert-CollectionNotEmpty $MbtiHistory.data "MBTI history did not return the submitted result."

$TargetJobs = Invoke-SmokeJson "Add target job" "POST" (Join-Url $BackendBaseUrl "/api/v1/jobs/targets/$($PrimaryJob.id)") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Add target job" $TargetJobs
Assert-CollectionNotEmpty $TargetJobs.data "Target job list is empty after adding a target."
Write-Host "OK target job persisted"

$FavoriteJobs = Invoke-SmokeJson "Add favorite job" "POST" (Join-Url $BackendBaseUrl "/api/v1/jobs/favorites/$($PrimaryJob.id)") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Add favorite job" $FavoriteJobs
Assert-CollectionNotEmpty $FavoriteJobs.data "Favorite job list is empty after adding a favorite."
Write-Host "OK favorite job persisted"

$AgentProfile = @{
    user_id = [string] $UserId
    name = "Smoke User"
    identity = "student"
    school = "Local Smoke University"
    major = "Computer Science"
    degree = "Bachelor"
    target_role = $TargetRole
    target_cities = @($TargetCity)
    expected_salary = "20k-30k"
    skills = @("Java", "Vue 3", "Python", "LLM")
    certificates = @()
    experiences = @("Built an AI career planning prototype")
    values = @("growth", "impact")
}
$Assessment = @{
    mbti_type = [string] $MbtiSubmit.data.type
    interests = @("AI products", "career planning")
    strengths = @("structured thinking", "self learning")
    weaknesses = @("limited interview evidence")
}

$ReportRequestId = "smoke-career-report-" + [guid]::NewGuid().ToString("N")
$ReportPayload = @{
    requestId = $ReportRequestId
    userId = [string] $UserId
    profile = $AgentProfile
    assessment = $Assessment
}
$Report = Invoke-SmokeJson "Career report generate" "POST" (Join-Url $BackendBaseUrl "/api/v1/career-reports/generate") $ReportPayload $AuthHeaders
Assert-EnvelopeSuccess "Career report generate" $Report
Assert-True ($Report.traceId -eq $ReportRequestId) "Career report traceId did not echo the requestId."
Assert-NotBlank $Report.data.summary "Career report summary is empty."
Assert-CollectionNotEmpty $Report.data.recommended_careers "Career report returned no recommended careers."
Assert-True ([long] $Report.data.agentRunId -gt 0) "Career report did not include a persisted agentRunId."
Write-Host "OK backend-to-agent career report chain"

$ReportContent = $Report.data | ConvertTo-Json -Depth 32 -Compress
$ArchivedReport = Invoke-SmokeJson "Report archive" "POST" (Join-Url $BackendBaseUrl "/api/v1/reports/archive") @{
    type = "career_report"
    title = "Smoke Career Report"
    summary = [string] $Report.data.summary
    content = $ReportContent
    agentRunId = [long] $Report.data.agentRunId
} $AuthHeaders
Assert-EnvelopeSuccess "Report archive" $ArchivedReport
Assert-True ([long] $ArchivedReport.data.agentRunId -eq [long] $Report.data.agentRunId) "Archived report did not link the agentRunId."

$ReportList = Invoke-SmokeJson "Report list" "GET" (Join-Url $BackendBaseUrl "/api/v1/reports?type=career_report&page=0&size=5") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Report list" $ReportList
$ReportListItems = @(To-Array $ReportList.data.items)
$MatchingReports = @($ReportListItems | Where-Object { $_.id -eq $ArchivedReport.data.id })
Assert-True ($MatchingReports.Count -gt 0) "Archived report was not visible in the report list."
Write-Host "OK report archive and list"

$ResumeText = @"
AI Career Planning System | Java / Vue 3 / Python
- Built a Spring Boot backend and Vue 3 career dashboard for authenticated profile, job, report, resume, and path workflows.
- Integrated a FastAPI Agent Server with structured JSON outputs for career reports, resume analysis, and path planning.
- Added tests, validation, trace IDs, and production-oriented request wrappers across web, app, backend, and agent layers.
"@
$ResumeRequestId = "smoke-resume-" + [guid]::NewGuid().ToString("N")
$Resume = Invoke-SmokeJson "Resume analysis generate" "POST" (Join-Url $BackendBaseUrl "/api/v1/resumes/analyze") @{
    requestId = $ResumeRequestId
    userId = [string] $UserId
    targetRole = $TargetRole
    resumeText = $ResumeText
} $AuthHeaders
Assert-EnvelopeSuccess "Resume analysis generate" $Resume
Assert-True ($Resume.traceId -eq $ResumeRequestId) "Resume analysis traceId did not echo the requestId."
Assert-True ([long] $Resume.data.agentRunId -gt 0) "Resume analysis did not include a persisted agentRunId."
Assert-CollectionNotEmpty $Resume.data.issues "Resume analysis returned no issues."

$ArchivedResume = Invoke-SmokeJson "Resume analysis archive" "POST" (Join-Url $BackendBaseUrl "/api/v1/resumes/analyses/archive") @{
    targetRole = $TargetRole
    resumeText = $ResumeText
    agentRunId = [long] $Resume.data.agentRunId
    analysis = @{
        score = [int] $Resume.data.score
        atsScore = [int] $Resume.data.ats_score
        keywordMatch = [int] $Resume.data.keyword_match
        issues = @(To-Array $Resume.data.issues)
        suggestions = @(To-Array $Resume.data.suggestions)
        improvedFragments = @(To-Array $Resume.data.improved_fragments)
    }
} $AuthHeaders
Assert-EnvelopeSuccess "Resume analysis archive" $ArchivedResume
Assert-True ([long] $ArchivedResume.data.agentRunId -eq [long] $Resume.data.agentRunId) "Archived resume analysis did not link the agentRunId."

$ResumeList = Invoke-SmokeJson "Resume analysis list" "GET" (Join-Url $BackendBaseUrl "/api/v1/resumes/analyses?page=0&size=5") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Resume analysis list" $ResumeList
$ResumeListItems = @(To-Array $ResumeList.data)
$MatchingResumeAnalyses = @($ResumeListItems | Where-Object { $_.id -eq $ArchivedResume.data.id })
Assert-True ($MatchingResumeAnalyses.Count -gt 0) "Archived resume analysis was not visible in the list."
Write-Host "OK resume analysis generate, archive, and list"

$PathRequestId = "smoke-path-" + [guid]::NewGuid().ToString("N")
$PathPlan = Invoke-SmokeJson "Path plan generate" "POST" (Join-Url $BackendBaseUrl "/api/v1/path-plans/generate") @{
    requestId = $PathRequestId
    userId = [string] $UserId
    profile = $AgentProfile
    targetRole = $TargetRole
} $AuthHeaders
Assert-EnvelopeSuccess "Path plan generate" $PathPlan
Assert-True ($PathPlan.traceId -eq $PathRequestId) "Path plan traceId did not echo the requestId."
Assert-True ([long] $PathPlan.data.agentRunId -gt 0) "Path plan did not include a persisted agentRunId."
Assert-CollectionNotEmpty $PathPlan.data.milestones "Path plan returned no milestones."

$ArchiveMilestones = @()
foreach ($Milestone in @(To-Array $PathPlan.data.milestones)) {
    $ArchiveMilestones += @{
        title = [string] $Milestone.title
        duration = [string] $Milestone.duration
        tasks = @(To-Array $Milestone.tasks)
        acceptance = @(To-Array $Milestone.acceptance)
    }
}
$ArchivedPath = Invoke-SmokeJson "Path plan archive" "POST" (Join-Url $BackendBaseUrl "/api/v1/path-plans/archive") @{
    targetRole = [string] $PathPlan.data.target_role
    overview = [string] $PathPlan.data.overview
    agentRunId = [long] $PathPlan.data.agentRunId
    milestones = $ArchiveMilestones
    checkpoints = @(To-Array $PathPlan.data.checkpoints)
} $AuthHeaders
Assert-EnvelopeSuccess "Path plan archive" $ArchivedPath
Assert-True ([long] $ArchivedPath.data.agentRunId -eq [long] $PathPlan.data.agentRunId) "Archived path plan did not link the agentRunId."
Assert-True ([int] $ArchivedPath.data.taskCount -gt 0) "Archived path plan contains no tasks."

$FirstMilestone = @(To-Array $ArchivedPath.data.milestones)[0]
$FirstTask = @(To-Array $FirstMilestone.tasks)[0]
Assert-NotBlank $FirstTask.id "Archived path plan did not return task ids."
$UpdatedPath = Invoke-SmokeJson "Path task update" "PATCH" (Join-Url $BackendBaseUrl "/api/v1/path-plans/$($ArchivedPath.data.id)/tasks/$($FirstTask.id)") @{
    status = "done"
} $AuthHeaders
Assert-EnvelopeSuccess "Path task update" $UpdatedPath
Assert-True ([int] $UpdatedPath.data.completedTaskCount -ge 1) "Path task update did not increase completed task count."

$PathList = Invoke-SmokeJson "Path plan list" "GET" (Join-Url $BackendBaseUrl "/api/v1/path-plans?page=0&size=5") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Path plan list" $PathList
$PathListItems = @(To-Array $PathList.data)
$MatchingPathPlans = @($PathListItems | Where-Object { $_.id -eq $ArchivedPath.data.id })
Assert-True ($MatchingPathPlans.Count -gt 0) "Archived path plan was not visible in the list."
Write-Host "OK path plan generate, archive, task update, and list"

$DecisionProject = Invoke-SmokeJson "Decision project create" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects") @{
    title = "Smoke Java Backend or Data Analysis"
    question = "Which direction should be validated first during the next four weeks?"
    background = "The smoke user has Java, SQL, and project experience."
    priorities = @("real job demand", "verifiable output")
    mustHaves = @("produce a portfolio result")
    dealBreakers = @("no real-world feedback")
} $AuthHeaders
Assert-EnvelopeSuccess "Decision project create" $DecisionProject
$DecisionProjectId = [long] $DecisionProject.data.id
Assert-True ($DecisionProject.data.criteria.Count -eq 7) "Decision project did not create seven default criteria."

$PrimaryCandidateResponse = Invoke-SmokeJson "Decision primary candidate" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/candidates") @{
    name = $TargetRole
    recommendationReason = "Existing project and job evidence"
    opposingFactors = "System design evidence is incomplete"
    uncertainties = "Real work experience is still missing"
    validationActions = @("Analyze five real jobs")
    sourceType = "user"
} $AuthHeaders
Assert-EnvelopeSuccess "Decision primary candidate" $PrimaryCandidateResponse
$PrimaryCandidateId = [long] $PrimaryCandidateResponse.data.candidates[0].id

$BackupCandidateResponse = Invoke-SmokeJson "Decision backup candidate" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/candidates") @{
    name = "Data Analysis Smoke"
    recommendationReason = "SQL skills can be reused"
    opposingFactors = "Statistics evidence is limited"
    uncertainties = "Business analysis preference is unknown"
    validationActions = @("Complete a small analysis")
    sourceType = "user"
} $AuthHeaders
Assert-EnvelopeSuccess "Decision backup candidate" $BackupCandidateResponse
$BackupCandidateId = [long] $BackupCandidateResponse.data.candidates[1].id

$PrimaryJobSample = Invoke-SmokeJson "Decision primary job sample" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/job-samples") @{
    candidateId = $PrimaryCandidateId
    jobId = [long] $PrimaryJob.id
    note = "Primary candidate real job evidence"
} $AuthHeaders
Assert-EnvelopeSuccess "Decision primary job sample" $PrimaryJobSample

$BackupJobSample = Invoke-SmokeJson "Decision backup job sample" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/job-samples") @{
    candidateId = $BackupCandidateId
    jobId = [long] $BackupJob.id
    note = "Backup candidate real job evidence"
} $AuthHeaders
Assert-EnvelopeSuccess "Decision backup job sample" $BackupJobSample

$PrimaryEvidenceResponse = Invoke-SmokeJson "Decision primary evidence" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/evidence") @{
    candidateId = $PrimaryCandidateId
    title = "Existing project evidence"
    detail = "A completed course project demonstrates implementation and delivery."
    sourceType = "user"
    credibility = "high"
    stance = "support"
} $AuthHeaders
Assert-EnvelopeSuccess "Decision primary evidence" $PrimaryEvidenceResponse
$PrimaryEvidenceId = [long] $PrimaryEvidenceResponse.data.evidence[0].id

$BackupEvidenceResponse = Invoke-SmokeJson "Decision backup evidence" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/evidence") @{
    candidateId = $BackupCandidateId
    title = "Reusable SQL evidence"
    detail = "Basic SQL exercises support exploration but practical depth is uncertain."
    sourceType = "user"
    credibility = "medium"
    stance = "support"
} $AuthHeaders
Assert-EnvelopeSuccess "Decision backup evidence" $BackupEvidenceResponse
$BackupEvidenceId = [long] $BackupEvidenceResponse.data.evidence[0].id
$ComparisonCriterionId = [long] $BackupEvidenceResponse.data.criteria[0].id

$PrimaryComparison = Invoke-SmokeJson "Decision primary comparison" "PUT" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/criteria/$ComparisonCriterionId/results") @{
    candidateId = $PrimaryCandidateId
    score = 4
    assessment = "Existing project evidence is stronger."
    evidenceIds = @($PrimaryEvidenceId)
    uncertainty = "Work experience remains unverified."
    validationAction = "Complete a small evidence-producing project."
} $AuthHeaders
Assert-EnvelopeSuccess "Decision primary comparison" $PrimaryComparison

$BackupComparison = Invoke-SmokeJson "Decision backup comparison" "PUT" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/criteria/$ComparisonCriterionId/results") @{
    candidateId = $BackupCandidateId
    score = 3
    assessment = "SQL skills are reusable but practical analysis evidence is limited."
    evidenceIds = @($BackupEvidenceId)
    uncertainty = "Statistics and business analysis preference are unknown."
    validationAction = "Complete a small analysis using a real dataset."
} $AuthHeaders
Assert-EnvelopeSuccess "Decision backup comparison" $BackupComparison

$ConfirmedTarget = Invoke-SmokeJson "Decision target confirm" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/targets/confirm") @{
    primaryCandidateId = $PrimaryCandidateId
    backupCandidateId = $BackupCandidateId
    decisionReason = "The existing evidence is stronger, so validate it with a four-week plan."
    mainRisks = "Job samples and system design evidence remain limited."
    confirmed = $true
} $AuthHeaders
Assert-EnvelopeSuccess "Decision target confirm" $ConfirmedTarget
$PrimaryTarget = @($ConfirmedTarget.data.targets | Where-Object { $_.targetType -eq "primary" })[0]
Assert-NotBlank $PrimaryTarget.id "Confirmed decision did not return a primary target id."

$ConfidenceRequestId = "smoke-confidence-" + [guid]::NewGuid().ToString("N")
$ConfidencePayload = @{
    requestId = $ConfidenceRequestId
    trend = "stable"
    reason = "The first validation task has not changed the target yet."
}
$ConfidenceFeedback = Invoke-SmokeJson "Target confidence feedback" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/targets/$($PrimaryTarget.id)/confidence-feedback") $ConfidencePayload $AuthHeaders
Assert-EnvelopeSuccess "Target confidence feedback" $ConfidenceFeedback
$RepeatedConfidence = Invoke-SmokeJson "Target confidence feedback idempotent retry" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/targets/$($PrimaryTarget.id)/confidence-feedback") $ConfidencePayload $AuthHeaders
Assert-EnvelopeSuccess "Target confidence feedback idempotent retry" $RepeatedConfidence
Assert-True ([long] $RepeatedConfidence.data.id -eq [long] $ConfidenceFeedback.data.id) "Repeated confidence feedback created a duplicate row."

$ActionRequestId = "smoke-action-" + [guid]::NewGuid().ToString("N")
$ActionPayload = @{
    requestId = $ActionRequestId
    projectId = $DecisionProjectId
    targetId = [long] $PrimaryTarget.id
    durationWeeks = 4
}
$ActionPlan = Invoke-SmokeJson "Action plan generate" "POST" (Join-Url $BackendBaseUrl "/api/v1/action-plans/generate") $ActionPayload $AuthHeaders
Assert-EnvelopeSuccess "Action plan generate" $ActionPlan
$ActionPlanId = [long] $ActionPlan.data.id
$ActionTask = $ActionPlan.data.weeks[0].tasks[0]
Assert-NotBlank $ActionTask.id "Generated action plan did not include task ids."

$RepeatedActionPlan = Invoke-SmokeJson "Action plan idempotent retry" "POST" (Join-Url $BackendBaseUrl "/api/v1/action-plans/generate") $ActionPayload $AuthHeaders
Assert-EnvelopeSuccess "Action plan idempotent retry" $RepeatedActionPlan
Assert-True ([long] $RepeatedActionPlan.data.id -eq $ActionPlanId) "Repeated action plan request created a duplicate plan."

$TodayTasks = Invoke-SmokeJson "Shared today tasks" "GET" (Join-Url $BackendBaseUrl "/api/v1/action-plans/current/today") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Shared today tasks" $TodayTasks
Assert-True ([long] $TodayTasks.data.planId -eq $ActionPlanId) "Today endpoint did not return the new current action plan."

if ($RequireRealModel) {
    $LatestProfile = Invoke-SmokeJson "Reload profile before consent" "GET" (Join-Url $BackendBaseUrl "/api/v1/users/me/profile") -Headers $AuthHeaders
    Assert-EnvelopeSuccess "Reload profile before consent" $LatestProfile
    $ProfilePayload["externalAiConsent"] = $true
    $ProfilePayload["expectedVersion"] = [int] $LatestProfile.data.profileVersion
    $ConsentedProfile = Invoke-SmokeJson "Enable external AI consent" "PUT" (Join-Url $BackendBaseUrl "/api/v1/users/me/profile") $ProfilePayload $AuthHeaders
    Assert-EnvelopeSuccess "Enable external AI consent" $ConsentedProfile
    Assert-True ($ConsentedProfile.data.externalAiConsent -eq $true) "External AI consent was not enabled."
}

$CoachRequestId = "smoke-action-coach-" + [guid]::NewGuid().ToString("N")
$ActionCoach = Invoke-SmokeJson "Action coach chain" "POST" (Join-Url $BackendBaseUrl "/api/v1/action-plans/$ActionPlanId/coach") @{
    requestId = $CoachRequestId
    focus = "Suggest one evidence-producing next action."
} $AuthHeaders
Assert-EnvelopeSuccess "Action coach chain" $ActionCoach
Assert-True (@("llm", "fallback") -contains [string] $ActionCoach.data.generationMode) "Action coach did not return generationMode."
Assert-NotBlank $ActionCoach.data.conclusion "Action coach conclusion is empty."
Assert-CollectionNotEmpty $ActionCoach.data.uncertainties "Action coach did not expose uncertainties."
if ($RequireRealModel) {
    Assert-True ([string] $ActionCoach.data.generationMode -eq "llm") "Configured provider did not produce a valid llm result; inspect Agent logs and model JSON output."
    Assert-NotBlank $ActionCoach.data.modelName "Real-model response did not identify the model."

    $ProfilePayload["externalAiConsent"] = $false
    $ProfilePayload["expectedVersion"] = [int] $ConsentedProfile.data.profileVersion
    $RevokedProfile = Invoke-SmokeJson "Revoke external AI consent" "PUT" (Join-Url $BackendBaseUrl "/api/v1/users/me/profile") $ProfilePayload $AuthHeaders
    Assert-EnvelopeSuccess "Revoke external AI consent" $RevokedProfile
    Assert-True ($RevokedProfile.data.externalAiConsent -eq $false) "External AI consent was not revoked."

    $ConsentFallback = Invoke-SmokeJson "Consent-gated fallback" "POST" (Join-Url $BackendBaseUrl "/api/v1/action-plans/$ActionPlanId/coach") @{
        requestId = "smoke-consent-fallback-" + [guid]::NewGuid().ToString("N")
        focus = "Verify that revoked consent prevents external model use."
    } $AuthHeaders
    Assert-EnvelopeSuccess "Consent-gated fallback" $ConsentFallback
    Assert-True ([string] $ConsentFallback.data.generationMode -eq "fallback") "Revoked consent did not force the rule fallback."
    Write-Host "OK real model result and consent-gated fallback"
}

$TaskStartRequestId = "smoke-task-start-" + [guid]::NewGuid().ToString("N")
$StartedTask = Invoke-SmokeJson "Action task start" "PATCH" (Join-Url $BackendBaseUrl "/api/v1/action-plans/$ActionPlanId/tasks/$($ActionTask.id)/status") @{
    status = "in_progress"
    requestId = $TaskStartRequestId
    expectedVersion = [int] $ActionTask.version
} $AuthHeaders
Assert-EnvelopeSuccess "Action task start" $StartedTask
$StartedActionTask = @(
    $StartedTask.data.weeks.tasks |
        ForEach-Object { $_ } |
        Where-Object { [long] $_.id -eq [long] $ActionTask.id }
)[0]

$RepeatedStart = Invoke-SmokeJson "Action task status idempotent retry" "PATCH" (Join-Url $BackendBaseUrl "/api/v1/action-plans/$ActionPlanId/tasks/$($ActionTask.id)/status") @{
    status = "in_progress"
    requestId = $TaskStartRequestId
    expectedVersion = [int] $ActionTask.version
} $AuthHeaders
Assert-EnvelopeSuccess "Action task status idempotent retry" $RepeatedStart

$TaskResultRequestId = "smoke-task-result-" + [guid]::NewGuid().ToString("N")
$TaskResultPayload = @{
    description = "Compared five job descriptions and saved their common requirements."
    linkUrl = "https://example.test/smoke-job-evidence"
    requestId = $TaskResultRequestId
}
$TaskWithResult = Invoke-SmokeJson "Action task result" "POST" (Join-Url $BackendBaseUrl "/api/v1/action-plans/$ActionPlanId/tasks/$($ActionTask.id)/results") $TaskResultPayload $AuthHeaders
Assert-EnvelopeSuccess "Action task result" $TaskWithResult
$RepeatedResult = Invoke-SmokeJson "Action task result idempotent retry" "POST" (Join-Url $BackendBaseUrl "/api/v1/action-plans/$ActionPlanId/tasks/$($ActionTask.id)/results") $TaskResultPayload $AuthHeaders
Assert-EnvelopeSuccess "Action task result idempotent retry" $RepeatedResult
$MatchingResultTasks = @(
    $RepeatedResult.data.weeks.tasks |
        ForEach-Object { $_ } |
        Where-Object { [long] $_.id -eq [long] $ActionTask.id }
)
Assert-True ($MatchingResultTasks.Count -eq 1) "Action task was not found after adding a result."
Assert-True (@($MatchingResultTasks[0].results).Count -eq 1) "Repeated task result request created a duplicate result."

$CompletedTask = Invoke-SmokeJson "Action task complete" "PATCH" (Join-Url $BackendBaseUrl "/api/v1/action-plans/$ActionPlanId/tasks/$($ActionTask.id)/status") @{
    status = "completed"
    requestId = "smoke-task-complete-" + [guid]::NewGuid().ToString("N")
    expectedVersion = [int] $StartedActionTask.version
} $AuthHeaders
Assert-EnvelopeSuccess "Action task complete" $CompletedTask
Assert-True ([int] $CompletedTask.data.completedTaskCount -ge 1) "Completing the action task did not update plan progress."

$SnapshotRequestId = "smoke-decision-snapshot-" + [guid]::NewGuid().ToString("N")
$DecisionSnapshot = Invoke-SmokeJson "Decision snapshot with action plan" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/reports/snapshot") @{
    requestId = $SnapshotRequestId
} $AuthHeaders
Assert-EnvelopeSuccess "Decision snapshot with action plan" $DecisionSnapshot
$SnapshotContent = ([string] $DecisionSnapshot.data.content) | ConvertFrom-Json
Assert-True ([long] $SnapshotContent.actionPlan.id -eq $ActionPlanId) "Decision snapshot did not freeze the current action plan."
$SnapshotTasks = @($SnapshotContent.actionPlan.weeks.tasks | ForEach-Object { $_ })
Assert-True (@($SnapshotTasks | Where-Object { [long] $_.id -eq [long] $ActionTask.id }).Count -eq 1) "Decision snapshot did not include the completed task."
$SnapshotResults = @($SnapshotTasks.results | ForEach-Object { $_ })
Assert-True ($SnapshotResults.Count -ge 1) "Decision snapshot did not include task results."
$RepeatedSnapshot = Invoke-SmokeJson "Decision snapshot idempotent retry" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/reports/snapshot") @{
    requestId = $SnapshotRequestId
} $AuthHeaders
Assert-EnvelopeSuccess "Decision snapshot idempotent retry" $RepeatedSnapshot
Assert-True ([string] $RepeatedSnapshot.data.id -eq [string] $DecisionSnapshot.data.id) "Decision snapshot retry created a duplicate."

$WeeklyReview = Invoke-SmokeJson "Weekly review save" "PUT" (Join-Url $BackendBaseUrl "/api/v1/weekly-reviews") @{
    requestId = "smoke-review-" + [guid]::NewGuid().ToString("N")
    planId = $ActionPlanId
    weekNo = 1
    completedSummary = "Completed one real job analysis task."
    evidenceSummary = "Saved five job samples and common requirements."
    difficulties = "System design evidence is still limited."
    nextWeekMinutes = 300
    confidenceTrend = "stable"
    confidenceReason = "One task is not enough to change the target."
    adjustmentProposal = "Keep the next validation task."
} $AuthHeaders
Assert-EnvelopeSuccess "Weekly review save" $WeeklyReview
$SubmittedReview = Invoke-SmokeJson "Weekly review submit" "POST" (Join-Url $BackendBaseUrl "/api/v1/weekly-reviews/$($WeeklyReview.data.id)/submit") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Weekly review submit" $SubmittedReview
Assert-True ($SubmittedReview.data.status -eq "submitted") "Weekly review was not submitted."

$ProjectBeforeCurrentSwitch = Invoke-SmokeJson "Decision project before current switch" "GET" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Decision project before current switch" $ProjectBeforeCurrentSwitch
$TemporaryProject = Invoke-SmokeJson "Temporary decision project create" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects") @{
    title = "Smoke current-project version contract"
    question = "Can current-project changes be protected by aggregate versions?"
} $AuthHeaders
Assert-EnvelopeSuccess "Temporary decision project create" $TemporaryProject
$TemporaryProjectId = [long] $TemporaryProject.data.id
$TemporaryProjectInitialVersion = [int] $TemporaryProject.data.version

$ProjectsAfterTemporaryCreate = Invoke-SmokeJson "Decision projects after temporary create" "GET" (Join-Url $BackendBaseUrl "/api/v1/decision-projects") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Decision projects after temporary create" $ProjectsAfterTemporaryCreate
$OriginalProjectSummary = @(
    (To-Array $ProjectsAfterTemporaryCreate.data) |
        Where-Object { [long] $_.id -eq $DecisionProjectId }
)
Assert-True ($OriginalProjectSummary.Count -eq 1) "Original decision project was missing after creating a temporary project."
Assert-True (
    [int] $OriginalProjectSummary[0].version -eq ([int] $ProjectBeforeCurrentSwitch.data.version + 1)
) "Clearing the old current project did not increment its aggregate version."

$RestoredCurrentProject = Invoke-SmokeJson "Restore current decision project" "POST" (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$DecisionProjectId/current") @{
    expectedVersion = [int] $OriginalProjectSummary[0].version
} $AuthHeaders
Assert-EnvelopeSuccess "Restore current decision project" $RestoredCurrentProject
Assert-True ([bool] $RestoredCurrentProject.data.current) "Original decision project was not restored as current."

$ProjectsAfterCurrentRestore = Invoke-SmokeJson "Decision projects after current restore" "GET" (Join-Url $BackendBaseUrl "/api/v1/decision-projects") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Decision projects after current restore" $ProjectsAfterCurrentRestore
$TemporaryProjectSummary = @(
    (To-Array $ProjectsAfterCurrentRestore.data) |
        Where-Object { [long] $_.id -eq $TemporaryProjectId }
)
Assert-True ($TemporaryProjectSummary.Count -eq 1) "Temporary decision project was missing before archive."
Assert-True (
    [int] $TemporaryProjectSummary[0].version -eq ($TemporaryProjectInitialVersion + 1)
) "Clearing the temporary current project did not increment its aggregate version."

$ArchivedTemporaryProject = Invoke-SmokeJson "Temporary decision project archive" "DELETE" (
    (Join-Url $BackendBaseUrl "/api/v1/decision-projects/$TemporaryProjectId") +
    "?expectedVersion=$([int] $TemporaryProjectSummary[0].version)"
) -Headers $AuthHeaders
Assert-EnvelopeSuccess "Temporary decision project archive" $ArchivedTemporaryProject
$ProjectsAfterTemporaryArchive = Invoke-SmokeJson "Decision projects after temporary archive" "GET" (Join-Url $BackendBaseUrl "/api/v1/decision-projects") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Decision projects after temporary archive" $ProjectsAfterTemporaryArchive
Assert-True (
    @((To-Array $ProjectsAfterTemporaryArchive.data) | Where-Object { [long] $_.id -eq $TemporaryProjectId }).Count -eq 0
) "Archived temporary decision project was still returned by the active project list."
Write-Host "OK decision project current-selection and archive version contract"

$Dashboard = Invoke-SmokeJson "Dashboard aggregate" "GET" (Join-Url $BackendBaseUrl "/api/v1/dashboard") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Dashboard aggregate" $Dashboard
Assert-True ([long] $Dashboard.data.currentProject.id -eq $DecisionProjectId) "Dashboard did not aggregate the current decision project."
Assert-True ([long] $Dashboard.data.today.planId -eq $ActionPlanId) "Dashboard did not aggregate the current action plan."
Assert-True ([long] $Dashboard.data.latestReview.id -eq [long] $SubmittedReview.data.id) "Dashboard did not aggregate the submitted weekly review."
Assert-NotBlank $Dashboard.data.primaryAction "Dashboard did not return one primary next action."
Assert-NotBlank $Dashboard.data.primaryActionPath "Dashboard primary action path is empty."
Write-Host "OK first-version decision, action, result, Agent, and review loop"

$Logout = Invoke-SmokeJson "Auth logout" "POST" (Join-Url $BackendBaseUrl "/api/v1/auth/logout") -Headers $AuthHeaders
Assert-EnvelopeSuccess "Auth logout" $Logout
Write-Host "OK auth logout"

try {
    Invoke-SmokeJson "Refresh after logout" "POST" (Join-Url $BackendBaseUrl "/api/v1/auth/refresh") @{
        refreshToken = $RefreshToken
    } | Out-Null
    throw "Refresh token was accepted after logout."
} catch {
    if ($_.Exception.Message -eq "Refresh token was accepted after logout.") {
        throw
    }
    Assert-True ($_.Exception.Message -match "401|Unauthorized|Invalid refresh token") "Refresh after logout failed for an unexpected reason: $($_.Exception.Message)"
}
Write-Host "OK logout revoked refresh tokens"

Write-Host ""
Write-Host "API smoke passed." -ForegroundColor Green
