/**
 * 文件说明：报告归档保存请求 DTO。
 * 职责：封装前端保存职业规划报告归档时的标题、报告内容 JSON 以及排序索引。
 */
package com.example.ba.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.Map;

@Data
public class ReportArchiveRequestDTO {
    private String title;

    @NotEmpty(message = "报告内容不能为空")
    private Map<String, Object> reportJson;

    private Long sortIndex;
}
