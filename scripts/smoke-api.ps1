param(
    [string] $BackendBaseUrl = "",
    [string] $AgentBaseUrl = "",
    [int] $TimeoutSeconds = 10
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BackendBaseUrl)) {
    $BackendBaseUrl = if ([string]::IsNullOrWhiteSpace($env:BACKEND_BASE_URL)) {
        "http://127.0.0.1:8080"
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
        $Response = $null
        if ($null -eq $Body) {
            $Response = Invoke-WebRequest `
                -UseBasicParsing `
                -Method $Method `
                -Uri $Url `
                -Headers $Headers `
                -TimeoutSec $TimeoutSeconds
        } else {
            $JsonBody = $Body | ConvertTo-Json -Depth 32
            $BodyBytes = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
            $Response = Invoke-WebRequest `
                -UseBasicParsing `
                -Method $Method `
                -Uri $Url `
                -Headers $Headers `
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

$AgentHealth = Invoke-SmokeJson "Agent health" "GET" (Join-Url $AgentBaseUrl "/api/v1/health")
Assert-EnvelopeSuccess "Agent health" $AgentHealth
Assert-True ($AgentHealth.data.status -eq "ok") "Agent health did not return status=ok."
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
$PrimaryJob = $JobItems[0]
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
}
$SavedProfile = Invoke-SmokeJson "Profile save" "PUT" (Join-Url $BackendBaseUrl "/api/v1/users/me/profile") $ProfilePayload $AuthHeaders
Assert-EnvelopeSuccess "Profile save" $SavedProfile
Assert-True ($SavedProfile.data.completed -eq $true) "Saved profile is not marked completed."
Assert-True (([string] $SavedProfile.data.targetRole).Trim() -eq $TargetRole) "Saved profile target role did not round-trip."
Write-Host "OK profile save"

$MbtiAnswers = @{}
foreach ($Question in $QuestionItems) {
    $Options = @(To-Array $Question.options)
    Assert-CollectionNotEmpty $Options "MBTI question $($Question.id) has no options."
    $MbtiAnswers[[string] $Question.id] = [string] $Options[0].code
}
$MbtiSubmit = Invoke-SmokeJson "MBTI submit" "POST" (Join-Url $BackendBaseUrl "/api/v1/assessments/mbti/submit") @{
    answers = $MbtiAnswers
    userId = $UserId
}
Assert-EnvelopeSuccess "MBTI submit" $MbtiSubmit
Assert-NotBlank $MbtiSubmit.data.type "MBTI submit did not return a type."
Write-Host "OK MBTI submit returned $($MbtiSubmit.data.type)"

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
$Report = Invoke-SmokeJson "Career report generate" "POST" (Join-Url $BackendBaseUrl "/api/v1/career-reports/generate") $ReportPayload
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
}
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
}
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
