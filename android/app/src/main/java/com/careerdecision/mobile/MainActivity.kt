package com.careerdecision.mobile

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.careerdecision.mobile.notification.reminder.ReminderNotificationCenter
import com.careerdecision.mobile.ui.AppViewModel
import com.careerdecision.mobile.ui.AppViewModelFactory
import com.careerdecision.mobile.ui.CareerApp
import com.careerdecision.mobile.ui.CareerTheme
import com.careerdecision.mobile.ui.performance.ForegroundComposeHighRefreshRateRequest
import com.careerdecision.mobile.ui.performance.ForegroundHighRefreshRateController

class MainActivity : ComponentActivity() {
    private var requestedDestination by mutableStateOf<String?>(null)
    private lateinit var highRefreshRateController: ForegroundHighRefreshRateController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        highRefreshRateController = ForegroundHighRefreshRateController(this)
        requestedDestination = intent.notificationDestination()
        enableEdgeToEdge()
        setContent {
            ForegroundComposeHighRefreshRateRequest()
            CareerTheme {
                val app = application as CareerApplication
                val viewModel: AppViewModel = viewModel(
                    factory = AppViewModelFactory(app.repository, app.reminderGateway)
                )
                CareerApp(
                    viewModel = viewModel,
                    requestedDestination = requestedDestination,
                    onDestinationConsumed = { requestedDestination = null }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        highRefreshRateController.enable()
    }

    override fun onPause() {
        highRefreshRateController.disable()
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) highRefreshRateController.enable()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        requestedDestination = intent.notificationDestination()
    }

    private fun Intent.notificationDestination(): String? =
        getStringExtra(ReminderNotificationCenter.EXTRA_DESTINATION)
}
