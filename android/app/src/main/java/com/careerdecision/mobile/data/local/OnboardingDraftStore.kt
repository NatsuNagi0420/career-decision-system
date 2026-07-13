package com.careerdecision.mobile.data.local

import android.content.Context
import com.careerdecision.mobile.AndroidKeystoreSessionCipher
import com.google.gson.Gson

data class OnboardingDraft(
    val step: Int = 1,
    val displayName: String = "",
    val school: String = "",
    val major: String = "",
    val grade: String = "",
    val city: String = "",
    val currentConfusion: String = "",
    val existingDirections: String = "",
    val weeklyHours: Int = 5
)

class OnboardingDraftStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()
    private val cipher = AndroidKeystoreSessionCipher()

    fun load(userId: Long): OnboardingDraft? {
        val raw = cipher.decrypt(preferences.getString(key(userId), null)) ?: return null
        return runCatching { gson.fromJson(raw, OnboardingDraft::class.java) }.getOrNull()
    }

    fun save(userId: Long, draft: OnboardingDraft) {
        preferences.edit().putString(key(userId), cipher.encrypt(gson.toJson(draft))).apply()
    }

    fun clear(userId: Long) {
        preferences.edit().remove(key(userId)).apply()
    }

    private fun key(userId: Long): String = "onboarding_$userId"

    private companion object {
        const val PREFERENCES_NAME = "career_onboarding_drafts"
    }
}
