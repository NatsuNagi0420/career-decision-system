package com.careerdecision.backend.career;

public class CareerDirectionWriteRecord {
    private Long id;
    private Long ownerUserId;
    private String name;
    private String category;
    private String summary;
    private String typicalWorkJson;
    private String commonSkillsJson;
    private String growthPathJson;
    private String misconceptionsJson;
    private String majorTagsJson;
    private String industryTagsJson;
    private String workTypesJson;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOwnerUserId() { return ownerUserId; }
    public void setOwnerUserId(Long ownerUserId) { this.ownerUserId = ownerUserId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public String getTypicalWorkJson() { return typicalWorkJson; }
    public void setTypicalWorkJson(String value) { typicalWorkJson = value; }
    public String getCommonSkillsJson() { return commonSkillsJson; }
    public void setCommonSkillsJson(String value) { commonSkillsJson = value; }
    public String getGrowthPathJson() { return growthPathJson; }
    public void setGrowthPathJson(String value) { growthPathJson = value; }
    public String getMisconceptionsJson() { return misconceptionsJson; }
    public void setMisconceptionsJson(String value) { misconceptionsJson = value; }
    public String getMajorTagsJson() { return majorTagsJson; }
    public void setMajorTagsJson(String value) { majorTagsJson = value; }
    public String getIndustryTagsJson() { return industryTagsJson; }
    public void setIndustryTagsJson(String value) { industryTagsJson = value; }
    public String getWorkTypesJson() { return workTypesJson; }
    public void setWorkTypesJson(String value) { workTypesJson = value; }
}
