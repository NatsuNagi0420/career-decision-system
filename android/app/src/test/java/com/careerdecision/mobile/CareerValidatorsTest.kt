package com.careerdecision.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class CareerValidatorsTest {
    @Test
    fun loginRequiresUsernameAndPassword() {
        assertNotNull(CareerValidators.validateLogin("", "secret123"))
        assertNotNull(CareerValidators.validateLogin("miku", ""))
        assertNull(CareerValidators.validateLogin("miku", "secret123"))
    }

    @Test
    fun registrationValidatesLengthConfirmationAndEmail() {
        assertNotNull(CareerValidators.validateRegistration("ab", "secret123", "secret123", null))
        assertNotNull(CareerValidators.validateRegistration("miku", "short", "short", null))
        assertNotNull(CareerValidators.validateRegistration("miku", "secret123", "secret456", null))
        assertNotNull(CareerValidators.validateRegistration("miku", "secret123", "secret123", "bad-email"))
        assertNull(CareerValidators.validateRegistration("miku", "secret123", "secret123", "miku@example.com"))
    }

    @Test
    fun profileValidationLimitsDisplayTargetAndSkills() {
        assertNotNull(CareerValidators.validateProfile("a".repeat(41), "", emptyList()))
        assertNotNull(CareerValidators.validateProfile("", "a".repeat(61), emptyList()))
        assertNotNull(CareerValidators.validateProfile("", "", List(13) { "skill$it" }))
        assertNotNull(CareerValidators.validateProfile("", "", listOf("a".repeat(31))))
        assertNull(CareerValidators.validateProfile("Miku", "AI Engineer", listOf("Kotlin", "Python")))
    }

    @Test
    fun resumeValidationGuardsLengthBoundaries() {
        assertNotNull(CareerValidators.validateResume(""))
        assertNotNull(CareerValidators.validateResume("a".repeat(119)))
        assertNull(CareerValidators.validateResume("a".repeat(120)))
        assertNull(CareerValidators.validateResume("a".repeat(8000)))
        assertNotNull(CareerValidators.validateResume("a".repeat(8001)))
    }

    @Test
    fun splitValuesSupportsCommonSeparatorsAndDeduplicates() {
        assertEquals(
            listOf("Kotlin", "Vue 3", "Python", "Spring Boot"),
            CareerValidators.splitValues("Kotlin, Vue 3，Python、Kotlin / Spring Boot")
        )
    }
}
