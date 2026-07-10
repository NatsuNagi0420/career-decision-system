package com.careerdecision.backend.assessment.mbti;

public class MbtiOptionRecord {
    private Long questionId;
    private String optionCode;
    private String content;
    private String scoreDimension;
    private int scoreValue;

    public Long getQuestionId() {
        return questionId;
    }

    public void setQuestionId(Long questionId) {
        this.questionId = questionId;
    }

    public String getOptionCode() {
        return optionCode;
    }

    public void setOptionCode(String optionCode) {
        this.optionCode = optionCode;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getScoreDimension() {
        return scoreDimension;
    }

    public void setScoreDimension(String scoreDimension) {
        this.scoreDimension = scoreDimension;
    }

    public int getScoreValue() {
        return scoreValue;
    }

    public void setScoreValue(int scoreValue) {
        this.scoreValue = scoreValue;
    }
}
