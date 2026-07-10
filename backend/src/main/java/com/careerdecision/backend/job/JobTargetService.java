package com.careerdecision.backend.job;

import com.careerdecision.backend.exception.BusinessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class JobTargetService {
    private final JobTargetMapper targetMapper;
    private final JobFavoriteMapper favoriteMapper;
    private final JobMapper jobMapper;

    public JobTargetService(JobTargetMapper targetMapper, JobFavoriteMapper favoriteMapper, JobMapper jobMapper) {
        this.targetMapper = targetMapper;
        this.favoriteMapper = favoriteMapper;
        this.jobMapper = jobMapper;
    }

    public List<JobSummaryResponse> list(long userId) {
        return targetMapper.findTargetJobs(userId).stream()
                .map(job -> JobSummaryResponse.from(job, jobMapper.findTags(job.getId())))
                .toList();
    }

    @Transactional
    public List<JobSummaryResponse> add(long userId, long jobId) {
        if (favoriteMapper.countActiveJob(jobId) == 0) {
            throw new BusinessException(40401, "Job not found: " + jobId);
        }
        if (targetMapper.countTarget(userId, jobId) == 0) {
            targetMapper.insert(userId, jobId);
        }
        return list(userId);
    }

    @Transactional
    public List<JobSummaryResponse> remove(long userId, long jobId) {
        targetMapper.delete(userId, jobId);
        return list(userId);
    }
}
