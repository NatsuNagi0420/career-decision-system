package com.careerdecision.backend.profile;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class UserProfileRecord {
    private Long id;
    private Long userId;
    private String displayName;
    private String identityType;
    private String school;
    private String major;
    private String degree;
    private String grade;
    private LocalDate graduationDate;
    private String city;
    private String targetRole;
    private String targetCities;
    private String expectedSalary;
    private String preferredIndustriesJson;
    private String preferredWorkModesJson;
    private String constraintsJson;
    private String currentConfusion;
    private String existingDirectionsJson;
    private Integer weeklyAvailableMinutes;
    private LocalDateTime onboardingCompletedAt;
    private LocalDateTime externalAiConsentAt;
    private Integer profileVersion;
    private Integer expectedProfileVersion;
    private String skills;
    private String certificates;
    private String experiences;
    private String valuesJson;
    private String rawProfile;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getIdentityType() {
        return identityType;
    }

    public void setIdentityType(String identityType) {
        this.identityType = identityType;
    }

    public String getSchool() {
        return school;
    }

    public void setSchool(String school) {
        this.school = school;
    }

    public String getMajor() {
        return major;
    }

    public void setMajor(String major) {
        this.major = major;
    }

    public String getDegree() {
        return degree;
    }

    public void setDegree(String degree) {
        this.degree = degree;
    }

    public String getGrade() { return grade; }

    public void setGrade(String grade) { this.grade = grade; }

    public LocalDate getGraduationDate() { return graduationDate; }

    public void setGraduationDate(LocalDate graduationDate) { this.graduationDate = graduationDate; }

    public String getCity() { return city; }

    public void setCity(String city) { this.city = city; }

    public String getTargetRole() {
        return targetRole;
    }

    public void setTargetRole(String targetRole) {
        this.targetRole = targetRole;
    }

    public String getTargetCities() {
        return targetCities;
    }

    public void setTargetCities(String targetCities) {
        this.targetCities = targetCities;
    }

    public String getExpectedSalary() {
        return expectedSalary;
    }

    public void setExpectedSalary(String expectedSalary) {
        this.expectedSalary = expectedSalary;
    }

    public String getPreferredIndustriesJson() { return preferredIndustriesJson; }

    public void setPreferredIndustriesJson(String value) { preferredIndustriesJson = value; }

    public String getPreferredWorkModesJson() { return preferredWorkModesJson; }

    public void setPreferredWorkModesJson(String value) { preferredWorkModesJson = value; }

    public String getConstraintsJson() { return constraintsJson; }

    public void setConstraintsJson(String value) { constraintsJson = value; }

    public String getCurrentConfusion() { return currentConfusion; }

    public void setCurrentConfusion(String currentConfusion) { this.currentConfusion = currentConfusion; }

    public String getExistingDirectionsJson() { return existingDirectionsJson; }

    public void setExistingDirectionsJson(String value) { existingDirectionsJson = value; }

    public Integer getWeeklyAvailableMinutes() { return weeklyAvailableMinutes; }

    public void setWeeklyAvailableMinutes(Integer value) { weeklyAvailableMinutes = value; }

    public LocalDateTime getOnboardingCompletedAt() { return onboardingCompletedAt; }

    public void setOnboardingCompletedAt(LocalDateTime value) { onboardingCompletedAt = value; }

    public LocalDateTime getExternalAiConsentAt() { return externalAiConsentAt; }

    public void setExternalAiConsentAt(LocalDateTime value) { externalAiConsentAt = value; }

    public Integer getProfileVersion() { return profileVersion; }

    public void setProfileVersion(Integer value) { profileVersion = value; }

    public Integer getExpectedProfileVersion() { return expectedProfileVersion; }

    public void setExpectedProfileVersion(Integer value) { expectedProfileVersion = value; }

    public String getSkills() {
        return skills;
    }

    public void setSkills(String skills) {
        this.skills = skills;
    }

    public String getCertificates() {
        return certificates;
    }

    public void setCertificates(String certificates) {
        this.certificates = certificates;
    }

    public String getExperiences() {
        return experiences;
    }

    public void setExperiences(String experiences) {
        this.experiences = experiences;
    }

    public String getValuesJson() {
        return valuesJson;
    }

    public void setValuesJson(String valuesJson) {
        this.valuesJson = valuesJson;
    }

    public String getRawProfile() {
        return rawProfile;
    }

    public void setRawProfile(String rawProfile) {
        this.rawProfile = rawProfile;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
