package com.careerdecision.backend.profile;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserProfileMapper {
    @Select("""
            SELECT id, user_id, display_name, identity_type, school, major, degree,
                   grade, graduation_date, city, target_role, target_cities, expected_salary,
                   preferred_industries_json, preferred_work_modes_json, constraints_json,
                   current_confusion, existing_directions_json, weekly_available_minutes,
                   onboarding_completed_at, external_ai_consent_at, profile_version, skills, certificates,
                   experiences, values_json, raw_profile, created_at, updated_at
            FROM user_profiles
            WHERE user_id = #{userId}
            LIMIT 1
            """)
    UserProfileRecord findByUserId(@Param("userId") long userId);

    @Select("""
            SELECT COUNT(1) FROM user_profiles
            WHERE user_id = #{userId} AND external_ai_consent_at IS NOT NULL
            """)
    int hasExternalAiConsent(@Param("userId") long userId);

    @Insert("""
            INSERT INTO user_profiles (
              user_id, display_name, identity_type, school, major, degree,
              grade, graduation_date, city, target_role, target_cities, expected_salary,
              preferred_industries_json, preferred_work_modes_json, constraints_json,
              current_confusion, existing_directions_json, weekly_available_minutes,
              onboarding_completed_at, external_ai_consent_at, profile_version, skills, certificates,
              experiences, values_json, raw_profile
            )
            VALUES (
              #{userId}, #{displayName}, #{identityType}, #{school}, #{major}, #{degree},
              #{grade}, #{graduationDate}, #{city}, #{targetRole}, #{targetCities}, #{expectedSalary},
              #{preferredIndustriesJson}, #{preferredWorkModesJson}, #{constraintsJson},
              #{currentConfusion}, #{existingDirectionsJson}, #{weeklyAvailableMinutes},
              #{onboardingCompletedAt}, #{externalAiConsentAt}, #{profileVersion}, #{skills}, #{certificates},
              #{experiences}, #{valuesJson}, #{rawProfile}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(UserProfileRecord record);

    @Update("""
            UPDATE user_profiles
            SET display_name = #{displayName},
                identity_type = #{identityType},
                school = #{school},
                major = #{major},
                degree = #{degree},
                grade = #{grade},
                graduation_date = #{graduationDate},
                city = #{city},
                target_role = #{targetRole},
                target_cities = #{targetCities},
                expected_salary = #{expectedSalary},
                preferred_industries_json = #{preferredIndustriesJson},
                preferred_work_modes_json = #{preferredWorkModesJson},
                constraints_json = #{constraintsJson},
                current_confusion = #{currentConfusion},
                existing_directions_json = #{existingDirectionsJson},
                weekly_available_minutes = #{weeklyAvailableMinutes},
                onboarding_completed_at = #{onboardingCompletedAt},
                external_ai_consent_at = #{externalAiConsentAt},
                profile_version = profile_version + 1,
                skills = #{skills},
                certificates = #{certificates},
                experiences = #{experiences},
                values_json = #{valuesJson},
                raw_profile = #{rawProfile},
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = #{userId}
              AND profile_version = #{expectedProfileVersion}
            """)
    int update(UserProfileRecord record);
}
