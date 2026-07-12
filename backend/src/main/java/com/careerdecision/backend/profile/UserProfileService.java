package com.careerdecision.backend.profile;

import com.careerdecision.backend.exception.BusinessException;
import com.careerdecision.backend.user.UserInfo;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.time.LocalDateTime;

@Service
public class UserProfileService {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };

    private final UserProfileMapper profileMapper;
    private final ObjectMapper objectMapper;

    public UserProfileService(UserProfileMapper profileMapper, ObjectMapper objectMapper) {
        this.profileMapper = profileMapper;
        this.objectMapper = objectMapper;
    }

    public UserProfileResponse get(UserInfo user) {
        UserProfileRecord record = profileMapper.findByUserId(user.id());
        if (record == null) {
            return UserProfileResponse.empty(user);
        }
        return toResponse(record, user);
    }

    public boolean allowsExternalAi(long userId) {
        return profileMapper.hasExternalAiConsent(userId) > 0;
    }

    @Transactional
    public UserProfileResponse save(UserInfo user, UserProfileRequest request) {
        UserProfileRecord existing = profileMapper.findByUserId(user.id());
        UserProfileRecord record = toRecord(user.id(), request, existing);
        if (existing == null) {
            profileMapper.insert(record);
        } else {
            if (request.expectedVersion() == null || profileMapper.update(record) == 0) {
                throw new BusinessException(40930, "个人档案已在其他设备更新，请刷新后再修改。");
            }
        }
        return get(user);
    }

    private UserProfileRecord toRecord(long userId, UserProfileRequest request, UserProfileRecord existing) {
        UserProfileRecord record = new UserProfileRecord();
        record.setUserId(userId);
        record.setDisplayName(textOrExisting(request.displayName(), existing, UserProfileRecord::getDisplayName));
        record.setIdentityType(textOrExisting(request.identityType(), existing, UserProfileRecord::getIdentityType));
        record.setSchool(textOrExisting(request.school(), existing, UserProfileRecord::getSchool));
        record.setMajor(textOrExisting(request.major(), existing, UserProfileRecord::getMajor));
        record.setDegree(textOrExisting(request.degree(), existing, UserProfileRecord::getDegree));
        record.setGrade(textOrExisting(request.grade(), existing, UserProfileRecord::getGrade));
        record.setGraduationDate(request.graduationDate() != null
                ? request.graduationDate() : existing == null ? null : existing.getGraduationDate());
        record.setCity(textOrExisting(request.city(), existing, UserProfileRecord::getCity));
        record.setTargetRole(textOrExisting(request.targetRole(), existing, UserProfileRecord::getTargetRole));
        record.setTargetCities(listOrExisting(request.targetCities(), existing == null ? null : existing.getTargetCities()));
        record.setExpectedSalary(textOrExisting(request.expectedSalary(), existing, UserProfileRecord::getExpectedSalary));
        record.setPreferredIndustriesJson(listOrExisting(request.preferredIndustries(),
                existing == null ? null : existing.getPreferredIndustriesJson()));
        record.setPreferredWorkModesJson(listOrExisting(request.preferredWorkModes(),
                existing == null ? null : existing.getPreferredWorkModesJson()));
        record.setConstraintsJson(listOrExisting(request.constraints(),
                existing == null ? null : existing.getConstraintsJson()));
        record.setCurrentConfusion(textOrExisting(request.currentConfusion(), existing, UserProfileRecord::getCurrentConfusion));
        record.setExistingDirectionsJson(listOrExisting(
                request.existingDirections(), existing == null ? null : existing.getExistingDirectionsJson()));
        record.setWeeklyAvailableMinutes(request.weeklyAvailableMinutes() != null
                ? request.weeklyAvailableMinutes() : existing == null ? null : existing.getWeeklyAvailableMinutes());
        record.setOnboardingCompletedAt(Boolean.TRUE.equals(request.completeOnboarding())
                ? LocalDateTime.now()
                : existing == null ? null : existing.getOnboardingCompletedAt());
        record.setExternalAiConsentAt(request.externalAiConsent() == null
                ? existing == null ? null : existing.getExternalAiConsentAt()
                : Boolean.TRUE.equals(request.externalAiConsent()) ? LocalDateTime.now() : null);
        record.setProfileVersion(existing == null || existing.getProfileVersion() == null
                ? 1 : existing.getProfileVersion());
        record.setExpectedProfileVersion(request.expectedVersion());
        record.setSkills(listOrExisting(request.skills(), existing == null ? null : existing.getSkills()));
        record.setCertificates(listOrExisting(request.certificates(), existing == null ? null : existing.getCertificates()));
        record.setExperiences(listOrExisting(request.experiences(), existing == null ? null : existing.getExperiences()));
        record.setValuesJson(listOrExisting(request.values(), existing == null ? null : existing.getValuesJson()));
        record.setRawProfile(toJson(rawProfile(record)));
        return record;
    }

    private UserProfileResponse toResponse(UserProfileRecord record, UserInfo user) {
        List<String> targetCities = fromJson(record.getTargetCities());
        List<String> skills = fromJson(record.getSkills());
        List<String> certificates = fromJson(record.getCertificates());
        List<String> experiences = fromJson(record.getExperiences());
        List<String> values = fromJson(record.getValuesJson());
        List<String> preferredIndustries = fromJson(record.getPreferredIndustriesJson());
        List<String> preferredWorkModes = fromJson(record.getPreferredWorkModesJson());
        List<String> constraints = fromJson(record.getConstraintsJson());
        List<String> existingDirections = fromJson(record.getExistingDirectionsJson());
        return new UserProfileResponse(
                user.id(),
                firstText(record.getDisplayName(), user.username()),
                record.getIdentityType(),
                record.getSchool(),
                record.getMajor(),
                record.getDegree(),
                record.getGrade(),
                record.getGraduationDate(),
                record.getCity(),
                record.getTargetRole(),
                targetCities,
                record.getExpectedSalary(),
                record.getCurrentConfusion(),
                existingDirections,
                record.getWeeklyAvailableMinutes(),
                record.getOnboardingCompletedAt() != null,
                record.getProfileVersion() == null ? 1 : record.getProfileVersion(),
                skills,
                certificates,
                experiences,
                values,
                preferredIndustries,
                preferredWorkModes,
                constraints,
                record.getExternalAiConsentAt() != null,
                completed(record, targetCities, skills),
                record.getUpdatedAt()
        );
    }

    private boolean completed(UserProfileRecord record, List<String> targetCities, List<String> skills) {
        return Stream.of(record.getDisplayName(), record.getMajor(), record.getTargetRole(), record.getExpectedSalary())
                .anyMatch(value -> value != null && !value.isBlank())
                && (!targetCities.isEmpty() || !skills.isEmpty());
    }

    private Map<String, Object> rawProfile(UserProfileRecord record) {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("display_name", record.getDisplayName());
        raw.put("identity_type", record.getIdentityType());
        raw.put("school", record.getSchool());
        raw.put("major", record.getMajor());
        raw.put("degree", record.getDegree());
        raw.put("grade", record.getGrade());
        raw.put("graduation_date", record.getGraduationDate());
        raw.put("city", record.getCity());
        raw.put("target_role", record.getTargetRole());
        raw.put("expected_salary", record.getExpectedSalary());
        raw.put("preferred_industries", fromJson(record.getPreferredIndustriesJson()));
        raw.put("preferred_work_modes", fromJson(record.getPreferredWorkModesJson()));
        raw.put("constraints", fromJson(record.getConstraintsJson()));
        raw.put("current_confusion", record.getCurrentConfusion());
        raw.put("weekly_available_minutes", record.getWeeklyAvailableMinutes());
        return raw;
    }

    private List<String> sanitizeList(Collection<String> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String textOrExisting(
            String requested,
            UserProfileRecord existing,
            java.util.function.Function<UserProfileRecord, String> getter
    ) {
        return requested == null && existing != null ? getter.apply(existing) : trimToNull(requested);
    }

    private String listOrExisting(Collection<String> requested, String existingJson) {
        return requested == null ? (existingJson == null ? "[]" : existingJson) : toJson(sanitizeList(requested));
    }

    private String firstText(String preferred, String fallback) {
        return preferred == null || preferred.isBlank() ? fallback : preferred;
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50030, "Failed to serialize user profile.");
        }
    }

    private List<String> fromJson(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(value, STRING_LIST);
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }
}
