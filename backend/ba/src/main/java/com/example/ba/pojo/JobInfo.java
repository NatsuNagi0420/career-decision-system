/**
 * 文件说明：岗位信息实体类。
 * 职责：映射岗位信息表字段，用于岗位列表、推荐岗位以及岗位详情展示。
 */
package com.example.ba.pojo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobInfo {
    private Integer id;
    private String jobName;
    private String companyName;
    private String updateDate;
    private String salaryRange;
    private String location;
    private String industry;
    private String companySize;
    private String companyType;
    private String jobCode;
    private String jobDetails;
    private String companyDetails;
    private String jobSourceUrl;
}

