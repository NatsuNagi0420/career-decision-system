package com.careerdecision.backend.career;

import com.careerdecision.backend.career.CareerDirectionModels.DirectionRow;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface CareerDirectionMapper {
    String COLUMNS = """
            d.id, d.owner_user_id, d.code, d.name, d.category, d.summary,
            d.typical_work_json, d.common_skills_json, d.growth_path_json,
            d.misconceptions_json, d.major_tags_json, d.industry_tags_json,
            d.work_types_json,
            CASE WHEN EXISTS (
              SELECT 1 FROM career_direction_favorites f
              WHERE f.direction_id = d.id AND f.user_id = #{userId}
            ) THEN 1 ELSE 0 END AS favorite,
            d.updated_at
            """;

    @Select("""
            <script>
            SELECT
            """ + COLUMNS + """
            FROM career_directions d
            WHERE d.status = 'active'
              AND (d.owner_user_id IS NULL OR d.owner_user_id = #{userId})
            <if test="keyword != null and keyword != ''">
              AND (LOWER(d.name) LIKE CONCAT('%', LOWER(#{keyword}), '%')
                   OR LOWER(d.summary) LIKE CONCAT('%', LOWER(#{keyword}), '%'))
            </if>
            <if test="category != null and category != ''">
              AND d.category = #{category}
            </if>
            ORDER BY CASE WHEN d.owner_user_id IS NULL THEN 0 ELSE 1 END,
                     d.sort_order, d.name
            </script>
            """)
    List<DirectionRow> findAll(
            @Param("userId") long userId,
            @Param("keyword") String keyword,
            @Param("category") String category
    );

    @Select("""
            SELECT
            """ + COLUMNS + """
            FROM career_directions d
            WHERE d.id = #{id}
              AND d.status = 'active'
              AND (d.owner_user_id IS NULL OR d.owner_user_id = #{userId})
            LIMIT 1
            """)
    DirectionRow findById(@Param("userId") long userId, @Param("id") long id);

    @Insert("""
            INSERT INTO career_directions (
              owner_user_id, name, category, summary, typical_work_json,
              common_skills_json, growth_path_json, misconceptions_json,
              major_tags_json, industry_tags_json, work_types_json, sort_order
            ) VALUES (
              #{ownerUserId}, #{name}, #{category}, #{summary}, #{typicalWorkJson},
              #{commonSkillsJson}, #{growthPathJson}, #{misconceptionsJson},
              #{majorTagsJson}, #{industryTagsJson}, #{workTypesJson}, 1000
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(CareerDirectionWriteRecord record);

    @Update("""
            UPDATE career_directions
            SET name = #{name}, category = #{category}, summary = #{summary},
                typical_work_json = #{typicalWorkJson}, common_skills_json = #{commonSkillsJson},
                growth_path_json = #{growthPathJson}, misconceptions_json = #{misconceptionsJson},
                major_tags_json = #{majorTagsJson}, industry_tags_json = #{industryTagsJson},
                work_types_json = #{workTypesJson}, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND owner_user_id = #{ownerUserId} AND status = 'active'
            """)
    int update(CareerDirectionWriteRecord record);

    @Update("""
            UPDATE career_directions
            SET status = 'archived', updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND owner_user_id = #{userId} AND status = 'active'
            """)
    int archive(@Param("userId") long userId, @Param("id") long id);

    @Select("""
            SELECT COUNT(1) FROM career_directions
            WHERE id = #{id} AND status = 'active'
              AND (owner_user_id IS NULL OR owner_user_id = #{userId})
            """)
    int countVisible(@Param("userId") long userId, @Param("id") long id);

    @Select("""
            SELECT COUNT(1) FROM career_direction_favorites
            WHERE user_id = #{userId} AND direction_id = #{id}
            """)
    int countFavorite(@Param("userId") long userId, @Param("id") long id);

    @Insert("""
            INSERT INTO career_direction_favorites (user_id, direction_id)
            VALUES (#{userId}, #{id})
            """)
    void insertFavorite(@Param("userId") long userId, @Param("id") long id);

    @Delete("""
            DELETE FROM career_direction_favorites
            WHERE user_id = #{userId} AND direction_id = #{id}
            """)
    int deleteFavorite(@Param("userId") long userId, @Param("id") long id);
}
