package com.careerdecision.backend.report;

import com.careerdecision.backend.agent.AgentRunService;
import com.careerdecision.backend.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

@Service
public class ReportArchiveService {
    private static final int MAX_PAGE_SIZE = 50;

    private final ReportMapper reportMapper;
    private final ObjectMapper objectMapper;
    private final AgentRunService agentRunService;

    public ReportArchiveService(ReportMapper reportMapper, ObjectMapper objectMapper, AgentRunService agentRunService) {
        this.reportMapper = reportMapper;
        this.objectMapper = objectMapper;
        this.agentRunService = agentRunService;
    }

    public ReportSnapshot archive(long userId, ReportArchiveRequest request) {
        if (reportMapper.countActiveUser(userId) == 0) {
            throw new BusinessException(40402, "User not found: " + userId);
        }

        ReportRecord report = new ReportRecord();
        report.setUserId(userId);
        report.setType(request.type().trim());
        report.setAgentRunId(agentRunService.verifyLinkableRunId(
                request.agentRunId(),
                userId,
                agentTypeForReportType(report.getType())
        ));
        report.setTitle(request.title().trim());
        report.setSummary(request.summary().trim());
        report.setContentJson(toContentJson(request.content().trim()));
        reportMapper.insert(report);

        ReportRecord saved = reportMapper.findByIdAndUserId(userId, report.getId());
        return toSnapshot(saved);
    }

    public ReportPageResponse list(long userId, String type, int page, int size) {
        validatePageRequest(page, size);

        String normalizedType = trimToNull(type);
        long total = reportMapper.count(userId, normalizedType);
        List<ReportSnapshot> items = reportMapper.list(userId, normalizedType, page * size, size)
                .stream()
                .map(this::toSnapshot)
                .toList();
        int totalPages = total == 0 ? 0 : (int) Math.ceil((double) total / size);
        return new ReportPageResponse(items, page, size, total, totalPages);
    }

    public ReportSnapshot get(long userId, String id) {
        ReportRecord report = reportMapper.findByIdAndUserId(userId, parseRequiredId(id, "id"));
        if (report == null) {
            throw new BusinessException(40401, "Report not found.");
        }
        return toSnapshot(report);
    }

    public void delete(long userId, String id) {
        int affected = reportMapper.softDelete(userId, parseRequiredId(id, "id"));
        if (affected == 0) {
            throw new BusinessException(40401, "Report not found.");
        }
    }

    private void validatePageRequest(int page, int size) {
        if (page < 0) {
            throw new BusinessException(40031, "page must be greater than or equal to 0.");
        }
        if (size <= 0 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(40032, "size must be between 1 and " + MAX_PAGE_SIZE + ".");
        }
    }

    private long parseRequiredId(String value, String field) {
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException ex) {
            throw new BusinessException(40033, field + " must be a numeric id.");
        }
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String agentTypeForReportType(String type) {
        if ("career".equalsIgnoreCase(type) || "career_report".equalsIgnoreCase(type)) {
            return "career_report";
        }
        return type;
    }

    private String toContentJson(String content) {
        try {
            objectMapper.readTree(content);
            return content;
        } catch (JsonProcessingException ignored) {
            try {
                return objectMapper.writeValueAsString(new ContentPayload(content));
            } catch (JsonProcessingException ex) {
                throw new IllegalStateException("Failed to serialize report content.", ex);
            }
        }
    }

    private ReportSnapshot toSnapshot(ReportRecord report) {
        return new ReportSnapshot(
                String.valueOf(report.getId()),
                String.valueOf(report.getUserId()),
                report.getAgentRunId(),
                report.getType(),
                report.getTitle(),
                report.getSummary(),
                fromContentJson(report.getContentJson()),
                toInstant(report.getCreatedAt()),
                toInstant(report.getUpdatedAt())
        );
    }

    private String fromContentJson(String contentJson) {
        if (contentJson == null || contentJson.isBlank()) {
            return "";
        }
        try {
            JsonNode root = objectMapper.readTree(contentJson);
            JsonNode content = root.get("content");
            if (content != null && content.isTextual()) {
                return content.asText();
            }
        } catch (JsonProcessingException ignored) {
            return contentJson;
        }
        return contentJson;
    }

    private Instant toInstant(LocalDateTime time) {
        return time.atZone(ZoneId.systemDefault()).toInstant();
    }

    private record ContentPayload(String content) {
    }
}
