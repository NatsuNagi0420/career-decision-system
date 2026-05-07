/**
 * 文件说明：岗位搜索与推荐业务接口。
 * 职责：定义岗位多条件搜索、岗位详情查询以及岗位筛选项获取等服务方法。
 */
package com.example.ba.service;

import com.example.ba.pojo.JobInfo;

import java.util.List;
import java.util.Map;

public interface JobService {
    Map<String, Object> searchJobs(String keyword, String location, List<String> locations, String industry, String companySize, String companyType, String salary, int page, int pageSize);

    JobInfo getJobDetail(int id);

    Map<String, Object> getFacets();
}
