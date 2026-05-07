/**
 * 文件说明：用户报告归档表 Mapper。
 * 职责：通过 MyBatis 注解操作 user_report_archive 表，提供插入归档记录与按用户/ID 查询能力。
 * 主要方法：
 * - insert(UserReportArchive)               插入一条新的报告归档记录。
 * - listByUserId(Long userId)              查询指定用户的全部未删除归档记录，按 sort_index 倒序。
 * - findByIdAndUserId(Long id, Long userId) 根据主键及用户 ID 查询单条未删除归档记录。
 */
package com.example.ba.mapper;


import com.example.ba.pojo.UserReportArchive;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface UserReportArchiveMapper {
    @Insert("insert into user_report_archive(user_id, title, report_json, sort_index, is_deleted) values(#{userId}, #{title}, #{reportJson}, #{sortIndex}, 0)")
    void insert(UserReportArchive archive);

    @Select("select id, user_id, title, report_json, sort_index, create_time, update_time, is_deleted from user_report_archive where user_id = #{userId} and is_deleted = 0 order by sort_index desc, id desc")
    List<UserReportArchive> listByUserId(@Param("userId") Long userId);

    @Select("select id, user_id, title, report_json, sort_index, create_time, update_time, is_deleted from user_report_archive where id = #{id} and user_id = #{userId} and is_deleted = 0")
    UserReportArchive findByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);
}
