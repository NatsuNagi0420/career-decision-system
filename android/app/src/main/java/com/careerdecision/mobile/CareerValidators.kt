package com.careerdecision.mobile

object CareerValidators {
    private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    fun validateLogin(username: String, password: String): String? {
        if (username.isBlank()) return "请输入用户名"
        if (password.isBlank()) return "请输入密码"
        return null
    }

    fun validateRegistration(username: String, password: String, confirmPassword: String, email: String?): String? {
        validateLogin(username, password)?.let { return it }
        if (username.length !in 3..32) return "用户名需为 3-32 个字符"
        if (password.length !in 6..64) return "密码需为 6-64 个字符"
        if (confirmPassword.isBlank()) return "请再次输入密码"
        if (password != confirmPassword) return "两次输入的密码不一致"
        if (email != null && !emailPattern.matches(email)) return "邮箱格式不正确"
        return null
    }

    fun validateProfile(displayName: String, targetRole: String, skills: List<String>): String? {
        if (displayName.length > 40) return "展示名最多 40 个字"
        if (targetRole.length > 60) return "目标岗位最多 60 个字"
        if (skills.size > 12) return "技能最多填写 12 个"
        if (skills.any { it.length > 30 }) return "单个技能最多 30 个字"
        return null
    }

    fun validateResume(resumeText: String): String? {
        if (resumeText.isBlank()) return "请先填写简历文本"
        if (resumeText.length < 120) return "简历内容至少 120 个字"
        if (resumeText.length > 8000) return "简历内容最多 8000 个字"
        return null
    }

    fun splitValues(value: String): List<String> =
        value.split(",", "，", "、", "/")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()
}
