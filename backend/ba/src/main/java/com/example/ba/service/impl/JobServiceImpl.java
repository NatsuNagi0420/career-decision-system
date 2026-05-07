/**
 * 文件说明：岗位搜索与推荐业务实现类。
 * 职责：封装对 JobMapper 的调用，实现岗位分页搜索、单个岗位详情查询以及岗位筛选项汇总等逻辑。
 */
package com.example.ba.service.impl;

import com.example.ba.mapper.JobMapper;
import com.example.ba.pojo.JobInfo;
import com.example.ba.service.JobService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class JobServiceImpl implements JobService {

    @Autowired
    private JobMapper jobMapper;

    @Override
    public Map<String, Object> searchJobs(String keyword, String location, List<String> locations, String industry, String companySize, String companyType, String salary, int page, int pageSize) {
        int safePage = Math.max(page, 1);
        int safePageSize = Math.min(Math.max(pageSize, 1), 50);
        int offset = (safePage - 1) * safePageSize;

        List<JobInfo> list = jobMapper.selectJobs(keyword, location, locations, industry, companySize, companyType, salary, safePageSize, offset);
        int total = jobMapper.countJobs(keyword, location, locations, industry, companySize, companyType, salary);

        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("total", total);
        result.put("page", safePage);
        result.put("pageSize", safePageSize);
        return result;
    }

    @Override
    public JobInfo getJobDetail(int id) {
        return jobMapper.getById(id);
    }

    @Override
    public Map<String, Object> getFacets() {
        Map<String, Object> facets = new HashMap<>();
        facets.put("locations", jobMapper.listLocations());
        facets.put("industries", jobMapper.listIndustries());
        facets.put("companySizes", jobMapper.listCompanySizes());
        facets.put("companyTypes", jobMapper.listCompanyTypes());
        return facets;
    }
}
