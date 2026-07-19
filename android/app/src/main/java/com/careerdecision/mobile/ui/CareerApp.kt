package com.careerdecision.mobile.ui

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.PermanentDrawerSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.NavHostController
import androidx.navigation.navArgument
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.careerdecision.mobile.CareerApplication
import com.careerdecision.mobile.network.RequestConfig
import com.careerdecision.mobile.notification.reminder.ReminderGateway
import com.careerdecision.mobile.ui.design.BrandIdentity
import com.careerdecision.mobile.ui.design.CareerIcons
import com.careerdecision.mobile.ui.design.CareerSize
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.screens.GoalScreen
import com.careerdecision.mobile.ui.screens.HistoryDetailScreen
import com.careerdecision.mobile.ui.screens.HistoryListScreen
import com.careerdecision.mobile.ui.screens.LoginScreen
import com.careerdecision.mobile.ui.screens.MentorScreen
import com.careerdecision.mobile.ui.screens.OnboardingInitialData
import com.careerdecision.mobile.ui.screens.OnboardingScreen
import com.careerdecision.mobile.ui.screens.ProfileScreen
import com.careerdecision.mobile.ui.screens.TodayScreen
import com.careerdecision.mobile.ui.theme.CareerMotionTokens
import com.careerdecision.mobile.ui.theme.CareerPageCanvas

private data class Destination(
    val route: String,
    val label: String,
    val icon: ImageVector
)

private val destinations = listOf(
    Destination("today", "今日", CareerIcons.Today),
    Destination("goal", "目标", CareerIcons.Goal),
    Destination("mentor", "AI 导师", CareerIcons.Mentor),
    Destination("profile", "我的", CareerIcons.Profile)
)

@Composable
fun CareerApp(
    viewModel: AppViewModel,
    requestedDestination: String? = null,
    onDestinationConsumed: () -> Unit = {}
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.notice, state.error) {
        val message = state.error ?: state.notice
        if (!message.isNullOrBlank()) {
            snackbarHostState.showSnackbar(message)
            viewModel.clearMessages()
        }
    }

    CareerPageCanvas(Modifier.fillMaxSize()) {
        when {
            state.loading && !state.authenticated -> LoadingScreen()
            !state.authenticated -> Box(Modifier.fillMaxSize()) {
                LoginScreen(
                    loading = state.loading,
                    onLogin = { username, password -> viewModel.login(username, password) },
                    onRegister = { username, password, confirm, email ->
                        viewModel.register(username, password, confirm, email)
                    }
                )
                SnackbarHost(snackbarHostState, Modifier.align(Alignment.BottomCenter))
            }
            state.onboardingRequired -> Box(Modifier.fillMaxSize()) {
                val profile = state.fullProfile
                OnboardingScreen(
                    userId = state.user?.id ?: 0L,
                    initialData = OnboardingInitialData(
                        displayName = profile?.displayName.orEmpty(),
                        school = profile?.school.orEmpty(),
                        major = profile?.major.orEmpty(),
                        grade = profile?.grade.orEmpty(),
                        city = profile?.city.orEmpty(),
                        currentConfusion = profile?.currentConfusion.orEmpty(),
                        existingDirections = profile?.existingDirections.orEmpty(),
                        weeklyAvailableMinutes = profile?.weeklyAvailableMinutes ?: 300
                    ),
                    saving = state.onboardingSaving,
                    onComplete = { form, onSaved -> viewModel.completeOnboarding(form, onSaved) }
                )
                SnackbarHost(snackbarHostState, Modifier.align(Alignment.BottomCenter))
            }
            else -> AuthenticatedApp(
                state = state,
                viewModel = viewModel,
                snackbarHostState = snackbarHostState,
                requestedDestination = requestedDestination,
                onDestinationConsumed = onDestinationConsumed
            )
        }
    }
}

@Composable
private fun AuthenticatedApp(
    state: AppUiState,
    viewModel: AppViewModel,
    snackbarHostState: SnackbarHostState,
    requestedDestination: String?,
    onDestinationConsumed: () -> Unit
) {
    val navController = rememberNavController()
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    val app = context.applicationContext as CareerApplication
    val reminderGateway = app.reminderGateway
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route ?: "today"
    val routeBase = currentRoute.substringBefore('?')
    val currentTopLevelRoute = if (routeBase.startsWith("profile/")) "profile" else routeBase

    LaunchedEffect(requestedDestination) {
        val route = requestedDestination?.takeIf(::isSupportedNotificationDestination)
        if (route != null) {
            navigateTopLevel(navController, route)
            onDestinationConsumed()
        }
    }

    val content: @Composable (Modifier) -> Unit = { modifier ->
        CareerNavHost(
            navController = navController,
            state = state,
            viewModel = viewModel,
            reminderGateway = reminderGateway,
            openWeb = { path -> uriHandler.openUri("${RequestConfig.WEB_BASE_URL}$path") },
            modifier = modifier
        )
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        when {
            maxWidth < 600.dp -> Scaffold(
                containerColor = Color.Transparent,
                snackbarHost = { SnackbarHost(snackbarHostState) },
                bottomBar = {
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                        destinations.forEach { destination ->
                            NavigationBarItem(
                                selected = currentTopLevelRoute == destination.route,
                                onClick = { navigateTopLevel(navController, destination.route) },
                                icon = { Icon(destination.icon, contentDescription = destination.label) },
                                label = { Text(destination.label) },
                                colors = NavigationBarItemDefaults.colors(
                                    indicatorColor = MaterialTheme.colorScheme.secondaryContainer
                                )
                            )
                        }
                    }
                }
            ) { padding -> content(Modifier.padding(padding)) }

            maxWidth < 840.dp -> Row(Modifier.fillMaxSize()) {
                NavigationRail(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                    destinations.forEach { destination ->
                        NavigationRailItem(
                            selected = currentTopLevelRoute == destination.route,
                            onClick = { navigateTopLevel(navController, destination.route) },
                            icon = { Icon(destination.icon, contentDescription = destination.label) },
                            label = { Text(destination.label) },
                            colors = NavigationRailItemDefaults.colors(
                                indicatorColor = MaterialTheme.colorScheme.secondaryContainer
                            )
                        )
                    }
                }
                Scaffold(
                    modifier = Modifier.weight(1f),
                    containerColor = Color.Transparent,
                    snackbarHost = { SnackbarHost(snackbarHostState) }
                ) { padding -> content(Modifier.padding(padding)) }
            }

            else -> Row(Modifier.fillMaxSize()) {
                PermanentDrawerSheet(
                    modifier = Modifier.width(CareerSize.NavigationDrawer),
                    drawerContainerColor = MaterialTheme.colorScheme.surfaceContainer
                ) {
                    BrandIdentity(
                        modifier = Modifier.padding(CareerSpacing.ExtraLarge),
                        showDescriptor = true
                    )
                    destinations.forEach { destination ->
                        NavigationDrawerItem(
                            label = { Text(destination.label) },
                            selected = currentTopLevelRoute == destination.route,
                            onClick = { navigateTopLevel(navController, destination.route) },
                            icon = { Icon(destination.icon, contentDescription = null) },
                            modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
                        )
                    }
                }
                Scaffold(
                    modifier = Modifier.weight(1f),
                    containerColor = Color.Transparent,
                    snackbarHost = { SnackbarHost(snackbarHostState) }
                ) { padding -> content(Modifier.padding(padding)) }
            }
        }
    }
}

@Composable
private fun CareerNavHost(
    navController: NavHostController,
    state: AppUiState,
    viewModel: AppViewModel,
    reminderGateway: ReminderGateway,
    openWeb: (String) -> Unit,
    modifier: Modifier
) {
    NavHost(
        navController = navController,
        startDestination = "today",
        modifier = modifier,
        enterTransition = { topLevelFadeThroughEnter() },
        exitTransition = { topLevelFadeThroughExit() },
        popEnterTransition = { topLevelFadeThroughEnter() },
        popExitTransition = { topLevelFadeThroughExit() }
    ) {
        composable(
            route = "today?taskId={taskId}&review={review}",
            arguments = listOf(
                navArgument("taskId") { type = NavType.LongType; defaultValue = -1L },
                navArgument("review") { type = NavType.BoolType; defaultValue = false }
            )
        ) { entry ->
            TodayScreen(
                state = state,
                requestedTaskId = entry.arguments?.getLong("taskId")?.takeIf { it > 0 },
                openReviewOnStart = entry.arguments?.getBoolean("review") == true,
                onRefresh = { viewModel.refresh() },
                onOpenWeb = { openWeb("/decision-projects") },
                onUpdateTask = viewModel::updateTask,
                onAddResult = { task, description, link -> viewModel.addTaskResult(task, description, link) },
                onSubmitReview = viewModel::submitWeeklyReview
            )
        }
        composable("goal") {
            GoalScreen(
                state = state,
                onOpenWeb = { openWeb("/decision-projects") },
                onSubmitConfidence = viewModel::submitGoalConfidence
            )
        }
        composable("mentor") {
            MentorScreen(
                state = state,
                onSend = { viewModel.sendMentorMessage(it) },
                onRetry = { viewModel.retryMentorMessage(it) },
                onNewConversation = { viewModel.startNewMentorConversation() },
                onLoadHistory = { viewModel.loadMentorSessions() },
                onOpenSession = { viewModel.openMentorSession(it) },
                onDeleteSession = { viewModel.deleteMentorSession(it) },
                onAction = { action ->
                    when (action.destination) {
                        MentorActionDestination.Today -> navigateTopLevel(navController, "today")
                        MentorActionDestination.Goal -> navigateTopLevel(navController, "goal")
                        MentorActionDestination.Profile -> navigateTopLevel(navController, "profile")
                        MentorActionDestination.History -> navController.navigate("profile/history")
                        MentorActionDestination.ExploreWeb -> openWeb("/explore")
                    }
                },
                onNavigateToday = { navigateTopLevel(navController, "today") },
                onNavigateGoal = { navigateTopLevel(navController, "goal") }
            )
        }
        composable("profile") {
            ProfileScreen(
                state = state,
                reminderGateway = reminderGateway,
                onRefresh = { viewModel.refresh() },
                onSaveProfile = { displayName, school, major, grade, city, onSaved ->
                    viewModel.saveAccountProfile(displayName, school, major, grade, city, onSaved)
                },
                onUpdateAiConsent = { viewModel.updateExternalAiConsent(it) },
                onOpenHistory = { navController.navigate("profile/history") },
                onLogout = { viewModel.logout() }
            )
        }
        composable(
            route = "profile/history",
            enterTransition = { secondarySharedAxisEnter(forward = true) },
            exitTransition = { secondarySharedAxisExit(forward = true) },
            popEnterTransition = { secondarySharedAxisEnter(forward = false) },
            popExitTransition = { secondarySharedAxisExit(forward = false) }
        ) {
            LaunchedEffect(Unit) { viewModel.loadHistory() }
            HistoryListScreen(
                state = state,
                onBack = { navController.popBackStack() },
                onRefresh = { viewModel.loadHistory() },
                onOpenItem = { item ->
                    viewModel.loadHistoryDetail(item)
                    navController.navigate("profile/history/detail")
                }
            )
        }
        composable(
            route = "profile/history/detail",
            enterTransition = { secondarySharedAxisEnter(forward = true) },
            exitTransition = { secondarySharedAxisExit(forward = true) },
            popEnterTransition = { secondarySharedAxisEnter(forward = false) },
            popExitTransition = { secondarySharedAxisExit(forward = false) }
        ) {
            HistoryDetailScreen(
                state = state,
                onBack = { navController.popBackStack() },
                onRetry = { viewModel.loadHistoryDetail(it) },
                onDelete = { item ->
                    viewModel.deleteHistoryItem(item) { navController.popBackStack() }
                }
            )
        }
    }
}

private fun topLevelFadeThroughEnter(): EnterTransition =
    fadeIn(
        animationSpec = tween(
            durationMillis = CareerMotionTokens.Standard,
            delayMillis = CareerMotionTokens.Short / 2
        )
    ) + scaleIn(
        animationSpec = tween(CareerMotionTokens.Standard),
        initialScale = CareerMotionTokens.FadeThroughIncomingScale
    )

private fun topLevelFadeThroughExit(): ExitTransition =
    fadeOut(animationSpec = tween(CareerMotionTokens.Short))

private fun secondarySharedAxisEnter(forward: Boolean): EnterTransition =
    fadeIn(animationSpec = tween(CareerMotionTokens.SharedAxis)) +
        slideInHorizontally(animationSpec = tween(CareerMotionTokens.SharedAxis)) { width ->
            if (forward) width / 4 else -width / 4
        }

private fun secondarySharedAxisExit(forward: Boolean): ExitTransition =
    fadeOut(animationSpec = tween(CareerMotionTokens.SharedAxis)) +
        slideOutHorizontally(animationSpec = tween(CareerMotionTokens.SharedAxis)) { width ->
            if (forward) -width / 4 else width / 4
        }

private fun navigateTopLevel(navController: NavHostController, route: String) {
    navController.navigate(route) {
        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

private fun isSupportedNotificationDestination(value: String): Boolean {
    val base = value.substringBefore('?')
    if (destinations.none { it.route == base }) return false
    if ('?' !in value) return true
    if (base != "today") return false
    val query = value.substringAfter('?', missingDelimiterValue = "")
    if (query.isBlank()) return false
    return query.split('&').all { parameter ->
        val key = parameter.substringBefore('=')
        val rawValue = parameter.substringAfter('=', missingDelimiterValue = "")
        when (key) {
            "taskId" -> rawValue.toLongOrNull()?.let { it > 0 } == true
            "review" -> rawValue == "true" || rawValue == "false"
            else -> false
        }
    }
}

@Composable
private fun LoadingScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}
