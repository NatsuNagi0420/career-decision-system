/**
 * 文件说明：用户报告归档实体类。
 * 职责：映射 user_report_archive 表的字段，用于持久化单次职业规划报告归档快照。
 * 关键字段：id, userId, title, reportJson, sortIndex, createTime, updateTime, isDeleted。
 */
package com.example.ba.pojo;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserReportArchive {
    private Long id;
    private Long userId;
    private String title;
    private String reportJson;
    private Long sortIndex;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Integer isDeleted;
}
