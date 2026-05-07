/**
 * 文件说明：岗位推荐（大模型）请求 DTO。
 * 职责：封装用户录入信息、能力画像摘要、优先岗位与关键词等，用于生成岗位推荐列表。
 */
package com.example.ba.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class JobRecommendRequestDTO {
    /**
     * 信息录入与问卷数据（用于生成关键词或辅助推荐）
     */
    private CapabilityProfileRequestDTO entry;

    /**
     * 能力画像结果（推荐关键词、标签、建议等）
     */
    private Map<String, Object> capabilityProfile;

    /**
     * 画像阶段已推荐的岗位 ID（需要强制包含在推荐结果中）
     */
    private List<Integer> preferredJobIds;

    /**
     * 指定的关键词（若传入则优先使用）
     */
    private List<String> keywords;

    /**
     * 倾向城市/地区过滤（可选）
     */
    private List<String> locations;

    /**
     * 推荐数量，默认 6
     */
    private Integer limit;
}
