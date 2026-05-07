/**
 * 文件说明：报告生成请求 DTO。
 * 职责：封装信息录入、能力画像、目标岗位与路径规划等数据，作为报告生成入参。
 */
package com.example.ba.dto;

import lombok.Data;

import java.util.Map;

@Data
public class ReportGenerateRequestDTO {
    private Map<String, Object> entryDraft;
    private Map<String, Object> capabilityProfile;
    private Map<String, Object> targetJob;
    private Map<String, Object> pathPlan;
    private Map<String, Object> pathGraph;
}
