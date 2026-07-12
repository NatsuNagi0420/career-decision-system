package com.careerdecision.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import com.careerdecision.mobile.ui.AppViewModel
import com.careerdecision.mobile.ui.AppViewModelFactory
import com.careerdecision.mobile.ui.CareerApp
import com.careerdecision.mobile.ui.CareerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CareerTheme {
                val app = application as CareerApplication
                val viewModel: AppViewModel = viewModel(factory = AppViewModelFactory(app.repository))
                CareerApp(viewModel)
            }
        }
    }
}
