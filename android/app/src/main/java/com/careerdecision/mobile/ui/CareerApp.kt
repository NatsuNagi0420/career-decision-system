package com.careerdecision.mobile.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.careerdecision.mobile.network.RequestConfig
import com.careerdecision.mobile.ui.screens.GoalScreen
import com.careerdecision.mobile.ui.screens.LoginScreen
import com.careerdecision.mobile.ui.screens.MentorScreen
import com.careerdecision.mobile.ui.screens.ProfileScreen
import com.careerdecision.mobile.ui.screens.TodayScreen

private data class Destination(
    val route: String,
    val label: String,
    val icon: ImageVector
)

private val destinations = listOf(
    Destination("today", "今日", Icons.Outlined.TaskAlt),
    Destination("goal", "目标", Icons.Outlined.Flag),
    Destination("mentor", "AI 导师", Icons.Outlined.AutoAwesome),
    Destination("profile", "我的", Icons.Outlined.Person)
)

@Composable
fun CareerApp(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.notice, state.error) {
        val message = state.error ?: state.notice
        if (!message.isNullOrBlank()) {
            snackbarHostState.showSnackbar(message)
            viewModel.clearMessages()
        }
    }

    when {
        state.loading && !state.authenticated -> LoadingScreen()
        !state.authenticated -> LoginScreen(
            loading = state.loading,
            onLogin = viewModel::login,
            snackbarHostState = snackbarHostState
        )
        else -> AuthenticatedApp(state, viewModel, snackbarHostState)
    }
}

@Composable
private fun AuthenticatedApp(
    state: AppUiState,
    viewModel: AppViewModel,
    snackbarHostState: SnackbarHostState
) {
    val navController = rememberNavController()
    val uriHandler = LocalUriHandler.current
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                destinations.forEach { destination ->
                    NavigationBarItem(
                        selected = currentRoute == destination.route,
                        onClick = {
                            navController.navigate(destination.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { androidx.compose.material3.Icon(destination.icon, contentDescription = destination.label) },
                        label = { Text(destination.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.primary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primaryContainer
                        )
                    )
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = "today",
            modifier = Modifier.padding(padding)
        ) {
            composable("today") {
                TodayScreen(
                    state = state,
                    onRefresh = { viewModel.refresh() },
                    onOpenWeb = { uriHandler.openUri("${RequestConfig.WEB_BASE_URL}/decision-projects") },
                    onUpdateTask = viewModel::updateTask,
                    onSubmitReview = viewModel::submitWeeklyReview
                )
            }
            composable("goal") {
                GoalScreen(
                    state = state,
                    onOpenWeb = { uriHandler.openUri("${RequestConfig.WEB_BASE_URL}/decision-projects") },
                    onSubmitConfidence = viewModel::submitGoalConfidence
                )
            }
            composable("mentor") {
                MentorScreen(
                    state = state,
                    onAsk = viewModel::askMentor,
                    onNavigateToday = { navController.navigate("today") { launchSingleTop = true } },
                    onNavigateGoal = { navController.navigate("goal") { launchSingleTop = true } }
                )
            }
            composable("profile") {
                ProfileScreen(
                    state = state,
                    onRefresh = { viewModel.refresh() },
                    onOpenWeb = { path -> uriHandler.openUri("${RequestConfig.WEB_BASE_URL}$path") },
                    onLogout = viewModel::logout
                )
            }
        }
    }
}

@Composable
private fun LoadingScreen() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(color = Color(0xFF0F766E))
    }
}
