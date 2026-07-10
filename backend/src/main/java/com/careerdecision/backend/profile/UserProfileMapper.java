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
                   target_role, target_cities, expected_salary, skills, certificates,
                   experiences, values_json, raw_profile, created_at, updated_at
            FROM user_profiles
            WHERE user_id = #{userId}
            LIMIT 1
            """)
    UserProfileRecord findByUserId(@Param("userId") long userId);

    @Insert("""
            INSERT INTO user_profiles (
              user_id, display_name, identity_type, school, major, degree,
              target_role, target_cities, expected_salary, skills, certificates,
              experiences, values_json, raw_profile
            )
            VALUES (
              #{userId}, #{displayName}, #{identityType}, #{school}, #{major}, #{degree},
              #{targetRole}, #{targetCities}, #{expectedSalary}, #{skills}, #{certificates},
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
                target_role = #{targetRole},
                target_cities = #{targetCities},
                expected_salary = #{expectedSalary},
                skills = #{skills},
                certificates = #{certificates},
                experiences = #{experiences},
                values_json = #{valuesJson},
                raw_profile = #{rawProfile},
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = #{userId}
            """)
    int update(UserProfileRecord record);
}
