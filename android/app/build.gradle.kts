plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun String.toBuildConfigStringLiteral(): String =
    "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

fun requireProductionBackendUrl(name: String, url: String) {
    if (url.isBlank()) {
        return
    }
    require(url.startsWith("https://")) {
        "$name must use https://. Actual value: $url"
    }
    require(!Regex("localhost|127\\.0\\.0\\.1|10\\.0\\.2\\.2|0\\.0\\.0\\.0").containsMatchIn(url)) {
        "$name must not point to a local or emulator host. Actual value: $url"
    }
}

val debugBackendBaseUrlOverride: String =
    providers.gradleProperty("career.backendDebugBaseUrl").orElse("").get()
val releaseBackendBaseUrlOverride: String =
    providers.gradleProperty("career.backendReleaseBaseUrl").orElse("").get()

requireProductionBackendUrl("career.backendReleaseBaseUrl", releaseBackendBaseUrlOverride)

android {
    namespace = "com.careerdecision.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.careerdecision.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    buildTypes {
        debug {
            buildConfigField(
                "String",
                "BACKEND_BASE_URL_OVERRIDE",
                debugBackendBaseUrlOverride.toBuildConfigStringLiteral()
            )
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            buildConfigField(
                "String",
                "BACKEND_BASE_URL_OVERRIDE",
                releaseBackendBaseUrlOverride.toBuildConfigStringLiteral()
            )
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
