package com.careerdecision.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.careerdecision.mobile.CareerValidators
import com.careerdecision.mobile.ui.design.CareerIcons
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.design.M3Button
import com.careerdecision.mobile.ui.design.M3Card
import com.careerdecision.mobile.ui.design.M3IconButton
import com.careerdecision.mobile.ui.design.M3SegmentedControl
import com.careerdecision.mobile.ui.design.M3TextField

private enum class AuthMode { Login, Register }

@Composable
fun LoginScreen(
    loading: Boolean,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String, String?) -> Unit
) {
    var mode by remember { mutableStateOf(AuthMode.Login) }
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }
    val focusManager = LocalFocusManager.current

    fun submit() {
        localError = if (mode == AuthMode.Login) {
            CareerValidators.validateLogin(username, password)
        } else {
            CareerValidators.validateRegistration(
                username = username,
                password = password,
                confirmPassword = confirmPassword,
                email = email.trim().takeIf { it.isNotBlank() }
            )
        }
        if (localError != null) return
        focusManager.clearFocus()
        if (mode == AuthMode.Login) {
            onLogin(username.trim(), password)
        } else {
            onRegister(username.trim(), password, confirmPassword, email.trim().takeIf { it.isNotBlank() })
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .widthIn(max = 460.dp)
                .verticalScroll(rememberScrollState())
                .padding(CareerSpacing.PageHorizontal),
            verticalArrangement = Arrangement.spacedBy(CareerSpacing.ExtraLarge)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(CareerSpacing.Small)) {
                Text(
                    "职途",
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    "大学生职业决策与行动",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            M3Card {
                M3SegmentedControl(
                    options = listOf(AuthMode.Login to "登录", AuthMode.Register to "注册"),
                    selected = mode,
                    onSelected = {
                        mode = it
                        localError = null
                    }
                )
                M3TextField(
                    value = username,
                    onValueChange = { username = it; localError = null },
                    label = "用户名",
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                        imeAction = ImeAction.Next
                    ),
                    keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                )
                if (mode == AuthMode.Register) {
                    M3TextField(
                        value = email,
                        onValueChange = { email = it; localError = null },
                        label = "邮箱（选填）",
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                    )
                }
                M3TextField(
                    value = password,
                    onValueChange = { password = it; localError = null },
                    label = "密码",
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = if (mode == AuthMode.Login) ImeAction.Done else ImeAction.Next
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = { submit() },
                        onNext = { focusManager.moveFocus(FocusDirection.Down) }
                    ),
                    trailingContent = {
                        M3IconButton(
                            icon = if (passwordVisible) CareerIcons.EyeOff else CareerIcons.Eye,
                            label = if (passwordVisible) "隐藏密码" else "显示密码",
                            onClick = { passwordVisible = !passwordVisible }
                        )
                    }
                )
                if (mode == AuthMode.Register) {
                    M3TextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it; localError = null },
                        label = "再次输入密码",
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(onDone = { submit() })
                    )
                }
                localError?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                }
                M3Button(
                    text = when {
                        loading && mode == AuthMode.Login -> "正在登录"
                        loading -> "正在注册"
                        mode == AuthMode.Login -> "登录"
                        else -> "注册并继续"
                    },
                    onClick = ::submit,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !loading,
                    loading = loading,
                    icon = if (mode == AuthMode.Login) CareerIcons.Login else CareerIcons.Register
                )
            }
        }
    }
}
