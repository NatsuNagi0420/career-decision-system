package com.careerdecision.mobile.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import com.careerdecision.mobile.ui.design.BrandIdentity
import com.careerdecision.mobile.ui.design.CareerIcons
import com.careerdecision.mobile.ui.design.CareerSpacing
import com.careerdecision.mobile.ui.design.M3Button
import com.careerdecision.mobile.ui.design.M3Card
import com.careerdecision.mobile.ui.design.M3IconButton
import com.careerdecision.mobile.ui.design.M3SegmentedControl
import com.careerdecision.mobile.ui.design.M3TextField
import com.careerdecision.mobile.ui.theme.CareerMotionTokens

private enum class AuthMode { Login, Register }

private val authModeOptions = listOf(
    AuthMode.Login to "登录",
    AuthMode.Register to "注册"
)

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
            BrandIdentity(showAvatar = true, showDescriptor = true)
            M3Card {
                M3SegmentedControl(
                    options = authModeOptions,
                    selected = mode,
                    onSelected = {
                        if (it != mode) {
                            focusManager.clearFocus()
                            mode = it
                            localError = null
                        }
                    }
                )
                AnimatedContent(
                    targetState = mode,
                    modifier = Modifier.fillMaxWidth(),
                    transitionSpec = {
                        fadeIn(tween(CareerMotionTokens.Standard))
                            .togetherWith(fadeOut(tween(CareerMotionTokens.Short)))
                            .using(
                                SizeTransform(clip = false) { _, _ ->
                                    tween(CareerMotionTokens.Standard)
                                }
                            )
                    },
                    label = "登录注册表单切换"
                ) { contentMode ->
                    Column(verticalArrangement = Arrangement.spacedBy(CareerSpacing.Medium)) {
                        M3TextField(
                            value = username,
                            onValueChange = { username = it; localError = null },
                            label = "用户名",
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Text,
                                imeAction = ImeAction.Next
                            ),
                            keyboardActions = KeyboardActions(
                                onNext = { focusManager.moveFocus(FocusDirection.Down) }
                            )
                        )
                        if (contentMode == AuthMode.Register) {
                            M3TextField(
                                value = email,
                                onValueChange = { email = it; localError = null },
                                label = "邮箱（选填）",
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Email,
                                    imeAction = ImeAction.Next
                                ),
                                keyboardActions = KeyboardActions(
                                    onNext = { focusManager.moveFocus(FocusDirection.Down) }
                                )
                            )
                        }
                        M3TextField(
                            value = password,
                            onValueChange = { password = it; localError = null },
                            label = "密码",
                            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = if (contentMode == AuthMode.Login) ImeAction.Done else ImeAction.Next
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
                        if (contentMode == AuthMode.Register) {
                            M3TextField(
                                value = confirmPassword,
                                onValueChange = { confirmPassword = it; localError = null },
                                label = "再次输入密码",
                                visualTransformation = if (passwordVisible) {
                                    VisualTransformation.None
                                } else {
                                    PasswordVisualTransformation()
                                },
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Password,
                                    imeAction = ImeAction.Done
                                ),
                                keyboardActions = KeyboardActions(onDone = { submit() })
                            )
                        }
                    }
                }
                Column {
                    localError?.let {
                        Spacer(Modifier.height(CareerSpacing.Medium))
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                    Spacer(Modifier.height(CareerSpacing.Medium))
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
}
