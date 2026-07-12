package com.careerdecision.backend.evidence;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface PersonalEvidenceMapper {
    @Select("""
            <script>
            SELECT id, user_id, evidence_type, title, description, source_type,
                   role_name, result_summary, link_url, proficiency, last_used_at, feedback,
                   source_ref_type, source_ref_id, credibility, visibility,
                   occurred_at, created_at, updated_at
            FROM personal_evidence
            WHERE user_id = #{userId} AND visibility = 'visible'
              <if test="type != null and type != ''">AND evidence_type = #{type}</if>
            ORDER BY updated_at DESC, id DESC
            </script>
            """)
    List<PersonalEvidenceEntity> findAll(@Param("userId") long userId, @Param("type") String type);

    @Select("""
            SELECT id, user_id, evidence_type, title, description, source_type,
                   role_name, result_summary, link_url, proficiency, last_used_at, feedback,
                   source_ref_type, source_ref_id, credibility, visibility,
                   occurred_at, created_at, updated_at
            FROM personal_evidence
            WHERE id = #{id} AND user_id = #{userId} AND visibility = 'visible' LIMIT 1
            """)
    PersonalEvidenceEntity findById(@Param("userId") long userId, @Param("id") long id);

    @Insert("""
            INSERT INTO personal_evidence (
              user_id, evidence_type, title, description, source_type,
              role_name, result_summary, link_url, proficiency, last_used_at, feedback,
              source_ref_type, source_ref_id, credibility, occurred_at
            ) VALUES (
              #{userId}, #{evidenceType}, #{title}, #{description}, #{sourceType},
              #{roleName}, #{resultSummary}, #{linkUrl}, #{proficiency}, #{lastUsedAt}, #{feedback},
              #{sourceRefType}, #{sourceRefId}, #{credibility}, #{occurredAt}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(PersonalEvidenceEntity entity);

    @Update("""
            UPDATE personal_evidence
            SET evidence_type = #{evidenceType}, title = #{title}, description = #{description},
                role_name = #{roleName}, result_summary = #{resultSummary}, link_url = #{linkUrl},
                proficiency = #{proficiency}, last_used_at = #{lastUsedAt}, feedback = #{feedback},
                source_type = #{sourceType}, source_ref_type = #{sourceRefType},
                source_ref_id = #{sourceRefId}, credibility = #{credibility},
                occurred_at = #{occurredAt}, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND visibility = 'visible'
            """)
    int update(PersonalEvidenceEntity entity);

    @Update("""
            UPDATE personal_evidence SET visibility = 'hidden', updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND user_id = #{userId} AND visibility = 'visible'
            """)
    int hide(@Param("userId") long userId, @Param("id") long id);
}
