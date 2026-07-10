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

    @Transactional
    public UserProfileResponse save(UserInfo user, UserProfileRequest request) {
        UserProfileRecord record = toRecord(user.id(), request);
        if (profileMapper.findByUserId(user.id()) == null) {
            profileMapper.insert(record);
        } else {
            profileMapper.update(record);
        }
        return get(user);
    }

    private UserProfileRecord toRecord(long userId, UserProfileRequest request) {
        UserProfileRecord record = new UserProfileRecord();
        record.setUserId(userId);
        record.setDisplayName(trimToNull(request.displayName()));
        record.setIdentityType(trimToNull(request.identityType()));
        record.setSchool(trimToNull(request.school()));
        record.setMajor(trimToNull(request.major()));
        record.setDegree(trimToNull(request.degree()));
        record.setTargetRole(trimToNull(request.targetRole()));
        record.setTargetCities(toJson(sanitizeList(request.targetCities())));
        record.setExpectedSalary(trimToNull(request.expectedSalary()));
        record.setSkills(toJson(sanitizeList(request.skills())));
        record.setCertificates(toJson(sanitizeList(request.certificates())));
        record.setExperiences(toJson(sanitizeList(request.experiences())));
        record.setValuesJson(toJson(sanitizeList(request.values())));
        record.setRawProfile(toJson(rawProfile(record)));
        return record;
    }

    private UserProfileResponse toResponse(UserProfileRecord record, UserInfo user) {
        List<String> targetCities = fromJson(record.getTargetCities());
        List<String> skills = fromJson(record.getSkills());
        List<String> certificates = fromJson(record.getCertificates());
        List<String> experiences = fromJson(record.getExperiences());
        List<String> values = fromJson(record.getValuesJson());
        return new UserProfileResponse(
                user.id(),
                firstText(record.getDisplayName(), user.username()),
                record.getIdentityType(),
                record.getSchool(),
                record.getMajor(),
                record.getDegree(),
                record.getTargetRole(),
                targetCities,
                record.getExpectedSalary(),
                skills,
                certificates,
                experiences,
                values,
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
        raw.put("target_role", record.getTargetRole());
        raw.put("expected_salary", record.getExpectedSalary());
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
