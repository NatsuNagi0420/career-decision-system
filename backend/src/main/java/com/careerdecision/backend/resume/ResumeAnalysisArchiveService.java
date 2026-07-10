package com.careerdecision.backend.resume;

import com.careerdecision.backend.agent.AgentRunService;
import com.careerdecision.backend.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

@Service
public class ResumeAnalysisArchiveService {
    private static final int MAX_PAGE_SIZE = 50;
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };

    private final ResumeAnalysisMapper analysisMapper;
    private final ObjectMapper objectMapper;
    private final AgentRunService agentRunService;

    public ResumeAnalysisArchiveService(
            ResumeAnalysisMapper analysisMapper,
            ObjectMapper objectMapper,
            AgentRunService agentRunService
    ) {
        this.analysisMapper = analysisMapper;
        this.objectMapper = objectMapper;
        this.agentRunService = agentRunService;
    }

    @Transactional
    public ResumeAnalysisDetailResponse archive(long userId, ResumeAnalysisArchiveRequest request) {
        ResumeRecord resume = new ResumeRecord();
        resume.setUserId(userId);
        resume.setFileName("manual-text");
        resume.setContentHash(hashText(request.resumeText()));
        resume.setResumeText(null);
        resume.setParsedJson(toJson(Map.of(
                "improved_fragments", sanitize(request.analysis().improvedFragments())
        )));
        analysisMapper.insertResume(resume);

        ResumeAnalysisRecord analysis = new ResumeAnalysisRecord();
        analysis.setResumeId(resume.getId());
        analysis.setUserId(userId);
        analysis.setAgentRunId(agentRunService.verifyLinkableRunId(request.agentRunId(), userId, "resume"));
        analysis.setTargetRole(trimToNull(request.targetRole()));
        analysis.setScore(request.analysis().score());
        analysis.setAtsScore(request.analysis().atsScore());
        analysis.setKeywordMatch(request.analysis().keywordMatch());
        analysis.setIssuesJson(toJson(sanitize(request.analysis().issues())));
        analysis.setSuggestionsJson(toJson(sanitize(request.analysis().suggestions())));
        analysisMapper.insertAnalysis(analysis);

        return detail(userId, analysis.getId());
    }

    public List<ResumeAnalysisSnapshotResponse> list(long userId, int page, int size) {
        validatePage(page, size);
        return analysisMapper.listAnalyses(userId, page * size, size).stream()
                .map(this::toSnapshot)
                .toList();
    }

    public ResumeAnalysisDetailResponse detail(long userId, long analysisId) {
        ResumeAnalysisRecord record = analysisMapper.findAnalysis(userId, analysisId);
        if (record == null) {
            throw new BusinessException(40430, "Resume analysis not found: " + analysisId);
        }
        return toDetail(record);
    }

    @Transactional
    public void delete(long userId, long analysisId) {
        ResumeAnalysisRecord record = analysisMapper.findAnalysis(userId, analysisId);
        if (record == null) {
            throw new BusinessException(40430, "Resume analysis not found: " + analysisId);
        }
        if (analysisMapper.deleteAnalysis(userId, analysisId) == 0) {
            throw new BusinessException(40430, "Resume analysis not found: " + analysisId);
        }
        if (record.getResumeId() != null) {
            analysisMapper.deleteResume(userId, record.getResumeId());
        }
    }

    private ResumeAnalysisSnapshotResponse toSnapshot(ResumeAnalysisRecord record) {
        List<String> issues = fromJson(record.getIssuesJson());
        List<String> suggestions = fromJson(record.getSuggestionsJson());
        return new ResumeAnalysisSnapshotResponse(
                record.getId(),
                record.getAgentRunId(),
                record.getTargetRole(),
                record.getScore(),
                record.getAtsScore(),
                record.getKeywordMatch(),
                issues.size(),
                suggestions.size(),
                record.getCreatedAt()
        );
    }

    private ResumeAnalysisDetailResponse toDetail(ResumeAnalysisRecord record) {
        return new ResumeAnalysisDetailResponse(
                record.getId(),
                record.getAgentRunId(),
                record.getTargetRole(),
                record.getScore(),
                record.getAtsScore(),
                record.getKeywordMatch(),
                fromJson(record.getIssuesJson()),
                fromJson(record.getSuggestionsJson()),
                improvedFragments(record.getParsedJson()),
                record.getCreatedAt()
        );
    }

    private List<String> improvedFragments(String parsedJson) {
        if (parsedJson == null || parsedJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode node = objectMapper.readTree(parsedJson).path("improved_fragments");
            if (!node.isArray()) {
                return List.of();
            }
            return objectMapper.convertValue(node, STRING_LIST);
        } catch (JsonProcessingException | IllegalArgumentException ex) {
            return List.of();
        }
    }

    private List<String> sanitize(Collection<String> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
    }

    private void validatePage(int page, int size) {
        if (page < 0) {
            throw new BusinessException(40050, "Page must be greater than or equal to 0.");
        }
        if (size <= 0 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(40051, "Size must be between 1 and " + MAX_PAGE_SIZE + ".");
        }
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50050, "Failed to serialize resume analysis.");
        }
    }

    private List<String> fromJson(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(value, STRING_LIST);
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }

    private String hashText(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available.", ex);
        }
    }
}
