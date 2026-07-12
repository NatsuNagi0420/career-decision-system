package com.careerdecision.backend.review;

import com.careerdecision.backend.action.ActionPlanModels.TaskStatusRequest;
import com.careerdecision.backend.action.ActionPlanService;
import com.careerdecision.backend.exception.BusinessException;
import com.careerdecision.backend.review.WeeklyReviewModels.AdjustmentRequest;
import com.careerdecision.backend.review.WeeklyReviewModels.ReviewRequest;
import com.careerdecision.backend.review.WeeklyReviewModels.ReviewResponse;
import com.careerdecision.backend.review.WeeklyReviewModels.TaskAdjustment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DuplicateKeyException;

import java.util.List;

@Service
public class WeeklyReviewService {
    private final WeeklyReviewMapper mapper;
    private final ActionPlanService actionPlanService;

    public WeeklyReviewService(WeeklyReviewMapper mapper, ActionPlanService actionPlanService) {
        this.mapper = mapper;
        this.actionPlanService = actionPlanService;
    }

    public List<ReviewResponse> list(long userId, Long planId) {
        if (planId != null && mapper.findOwnedProjectId(userId, planId) == null) {
            throw new BusinessException(40460, "Action plan not found: " + planId);
        }
        return mapper.findAll(userId, planId).stream().map(this::response).toList();
    }

    public ReviewResponse detail(long userId, long reviewId) {
        WeeklyReviewEntity entity = mapper.findById(userId, reviewId);
        if (entity == null) notFound(reviewId);
        return response(entity);
    }

    @Transactional
    public ReviewResponse save(long userId, ReviewRequest request) {
        String requestId = trim(request.requestId());
        if (requestId != null) {
            WeeklyReviewEntity repeated = mapper.findByRequestId(userId, requestId);
            if (repeated != null) {
                if (!repeated.getPlanId().equals(request.planId()) || !repeated.getWeekNo().equals(request.weekNo())) {
                    throw new BusinessException(40972, "Weekly review requestId is already in use.");
                }
                return response(repeated);
            }
        }
        Long projectId = mapper.findOwnedProjectId(userId, request.planId());
        if (projectId == null) throw new BusinessException(40460, "Action plan not found: " + request.planId());
        WeeklyReviewEntity entity = mapper.findByPlanWeek(userId, request.planId(), request.weekNo());
        if (entity != null && entity.getRequestId() != null && requestId != null
                && !entity.getRequestId().equals(requestId)) {
            throw new BusinessException(40972, "Weekly review already has another requestId.");
        }
        if (entity != null && !"draft".equals(entity.getStatus())) {
            throw new BusinessException(40970, "A submitted weekly review cannot be edited.");
        }
        boolean insert = entity == null;
        if (insert) entity = new WeeklyReviewEntity();
        entity.setUserId(userId);
        entity.setPlanId(request.planId());
        entity.setProjectId(projectId);
        entity.setWeekNo(request.weekNo());
        entity.setCompletedSummary(trim(request.completedSummary()));
        entity.setEvidenceSummary(trim(request.evidenceSummary()));
        entity.setDifficulties(trim(request.difficulties()));
        entity.setNextWeekMinutes(request.nextWeekMinutes());
        entity.setConfidenceTrend(trim(request.confidenceTrend()));
        entity.setConfidenceReason(trim(request.confidenceReason()));
        entity.setAdjustmentProposalJson(trim(request.adjustmentProposal()));
        entity.setRequestId(requestId);
        try {
            if (insert) mapper.insert(entity); else mapper.update(entity);
        } catch (DuplicateKeyException ex) {
            WeeklyReviewEntity repeated = requestId == null ? null : mapper.findByRequestId(userId, requestId);
            if (repeated != null
                    && repeated.getPlanId().equals(request.planId())
                    && repeated.getWeekNo().equals(request.weekNo())) {
                return response(repeated);
            }
            throw new BusinessException(40972, "Weekly review requestId or plan week is already in use.");
        }
        return detail(userId, entity.getId());
    }

    @Transactional
    public ReviewResponse submit(long userId, long reviewId) {
        WeeklyReviewEntity entity = requireReview(userId, reviewId);
        if ("submitted".equals(entity.getStatus()) || "adjustments_applied".equals(entity.getStatus())) {
            return response(entity);
        }
        if (trim(entity.getCompletedSummary()) == null
                && trim(entity.getEvidenceSummary()) == null
                && trim(entity.getDifficulties()) == null) {
            throw new BusinessException(40070, "Complete at least one review summary before submitting.");
        }
        if (mapper.submit(userId, reviewId) == 0) {
            throw new BusinessException(40970, "Only a draft weekly review can be submitted.");
        }
        return detail(userId, reviewId);
    }

    @Transactional
    public ReviewResponse applyAdjustments(long userId, long reviewId, AdjustmentRequest request) {
        WeeklyReviewEntity review = requireReview(userId, reviewId);
        if (!"submitted".equals(review.getStatus())) {
            throw new BusinessException(40971, "Submit the weekly review before applying adjustments.");
        }
        if (!Boolean.TRUE.equals(request.confirmed())) {
            throw new BusinessException(40071, "Batch task adjustments require explicit confirmation.");
        }
        int index = 0;
        for (TaskAdjustment adjustment : request.adjustments()) {
            actionPlanService.updateStatus(
                    userId,
                    review.getPlanId(),
                    adjustment.taskId(),
                    new TaskStatusRequest(
                            adjustment.status(), adjustment.reason(), adjustment.deferredTo(),
                            request.requestId().trim() + "-" + index++, adjustment.expectedVersion()
                    )
            );
        }
        mapper.markApplied(userId, reviewId);
        return detail(userId, reviewId);
    }

    @Transactional
    public void deleteDraft(long userId, long reviewId) {
        if (mapper.deleteDraft(userId, reviewId) == 0) {
            throw new BusinessException(40470, "Weekly review draft not found: " + reviewId);
        }
    }

    private WeeklyReviewEntity requireReview(long userId, long reviewId) {
        WeeklyReviewEntity entity = mapper.findById(userId, reviewId);
        if (entity == null) notFound(reviewId);
        return entity;
    }

    private ReviewResponse response(WeeklyReviewEntity entity) {
        return new ReviewResponse(
                entity.getId(), entity.getPlanId(), entity.getProjectId(), entity.getWeekNo(),
                entity.getCompletedSummary(), entity.getEvidenceSummary(), entity.getDifficulties(),
                entity.getNextWeekMinutes(), entity.getConfidenceTrend(), entity.getConfidenceReason(),
                entity.getAdjustmentProposalJson(), entity.getStatus(), entity.getRequestId(), entity.getSubmittedAt(),
                entity.getCreatedAt(), entity.getUpdatedAt()
        );
    }

    private String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private void notFound(long id) { throw new BusinessException(40470, "Weekly review not found: " + id); }
}
