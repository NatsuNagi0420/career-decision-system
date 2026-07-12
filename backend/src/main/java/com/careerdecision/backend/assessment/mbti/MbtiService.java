package com.careerdecision.backend.assessment.mbti;

import com.careerdecision.backend.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class MbtiService {
    private final MbtiMapper mbtiMapper;
    private final ObjectMapper objectMapper;

    public MbtiService(MbtiMapper mbtiMapper, ObjectMapper objectMapper) {
        this.mbtiMapper = mbtiMapper;
        this.objectMapper = objectMapper;
    }

    public List<MbtiQuestion> questions() {
        return mbtiMapper.findQuestions().stream()
                .map(question -> new MbtiQuestion(
                        Math.toIntExact(question.getId()),
                        question.getContent(),
                        mbtiMapper.findOptions(question.getId()).stream()
                                .map(option -> new MbtiOption(
                                        option.getOptionCode(),
                                        option.getContent(),
                                        dimensionCode(option.getScoreDimension()),
                                        option.getScoreDimension()
                                ))
                                .toList()
                ))
                .toList();
    }

    public List<MbtiHistoryItem> history(long userId) {
        return mbtiMapper.findHistory(userId).stream().map(session -> {
            MbtiResult result = parseResult(session);
            return new MbtiHistoryItem(
                    session.getId(), result.type(), result.scores(), result.description(), session.getSubmittedAt()
            );
        }).toList();
    }

    public MbtiResult submit(long userId, MbtiSubmitRequest request) {
        Map<String, Integer> scores = new LinkedHashMap<>();
        for (String direction : List.of("E", "I", "S", "N", "T", "F", "J", "P")) {
            scores.put(direction, 0);
        }

        Map<Integer, MbtiOptionRecord> chosenOptions = new LinkedHashMap<>();
        for (Map.Entry<Integer, String> answer : request.answers().entrySet()) {
            MbtiQuestionRecord question = findQuestion(answer.getKey());
            MbtiOptionRecord option = findOption(question.getId(), answer.getValue());
            chosenOptions.put(answer.getKey(), option);
            scores.computeIfPresent(
                    option.getScoreDimension(),
                    (key, value) -> value + option.getScoreValue()
            );
        }

        String type = calculateType(scores);
        MbtiResult result = new MbtiResult(type, scores, description(type));
        persist(userId, chosenOptions, result);
        return result;
    }

    private MbtiQuestionRecord findQuestion(Integer id) {
        MbtiQuestionRecord question = mbtiMapper.findQuestion(id);
        if (question == null) {
            throw new BusinessException(40020, "Unknown MBTI question: " + id);
        }
        return question;
    }

    private MbtiOptionRecord findOption(long questionId, String code) {
        MbtiOptionRecord option = mbtiMapper.findOption(questionId, code);
        if (option == null) {
            throw new BusinessException(40021, "Unknown MBTI option: " + code);
        }
        return option;
    }

    private String calculateType(Map<String, Integer> scores) {
        StringBuilder type = new StringBuilder();
        for (MbtiDimensionRecord dimension : mbtiMapper.findDimensions()) {
            String left = dimension.getCodeA();
            String right = dimension.getCodeB();
            int leftScore = scores.getOrDefault(left, 0);
            int rightScore = scores.getOrDefault(right, 0);
            if (leftScore == rightScore) {
                type.append(dimension.getTieRule());
            } else {
                type.append(leftScore > rightScore ? left : right);
            }
        }
        return type.toString();
    }

    private String description(String type) {
        String description = mbtiMapper.findDescription(type);
        if (description == null || description.isBlank()) {
            return "This result is a planning signal, not a career decision by itself.";
        }
        return description;
    }

    private String dimensionCode(String scoreDimension) {
        return switch (scoreDimension) {
            case "E", "I" -> "EI";
            case "S", "N" -> "SN";
            case "T", "F" -> "TF";
            case "J", "P" -> "JP";
            default -> scoreDimension;
        };
    }

    private void persist(long userId, Map<Integer, MbtiOptionRecord> chosenOptions, MbtiResult result) {
        if (mbtiMapper.countActiveUser(userId) == 0) {
            throw new BusinessException(40402, "User not found: " + userId);
        }

        MbtiSessionRecord session = new MbtiSessionRecord();
        session.setUserId(userId);
        session.setAssessmentCode("MBTI");
        session.setTestNo("MBTI-" + UUID.randomUUID());
        session.setStatus("submitted");
        session.setResultCode(result.type());
        session.setScoreJson(toJson(result.scores()));
        session.setResultJson(toJson(result));
        mbtiMapper.insertSession(session);

        for (Map.Entry<Integer, MbtiOptionRecord> entry : chosenOptions.entrySet()) {
            MbtiOptionRecord option = entry.getValue();
            mbtiMapper.insertAnswer(
                    session.getId(),
                    option.getQuestionId(),
                    option.getOptionCode(),
                    option.getScoreDimension(),
                    option.getScoreValue()
            );
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize MBTI result.", ex);
        }
    }

    private MbtiResult parseResult(MbtiSessionRecord session) {
        try {
            return objectMapper.readValue(session.getResultJson(), MbtiResult.class);
        } catch (JsonProcessingException | IllegalArgumentException ex) {
            return new MbtiResult(
                    session.getResultCode(), Map.of(), description(session.getResultCode())
            );
        }
    }
}
