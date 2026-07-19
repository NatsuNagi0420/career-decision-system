package com.careerdecision.backend.job;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class JobStructureService {
    private final JobRequirementItemMapper mapper;
    private final JobDescriptionStructurer structurer;

    public JobStructureService(JobRequirementItemMapper mapper, JobDescriptionStructurer structurer) {
        this.mapper = mapper;
        this.structurer = structurer;
    }

    public String displayText(JobRecord job) {
        return structurer.displayText(job.getDescription());
    }

    @Transactional
    public List<JobRequirementItem> items(JobRecord job, List<String> tags) {
        List<JobRequirementItem> current = mapper.findByJobId(job.getId());
        String expectedVersion = structurer.extractorVersion(job, tags);
        List<JobRequirementItem> expectedItems = structurer.extract(job, tags);
        boolean currentRuleVersion = current.stream()
                .filter(item -> "rule".equals(item.extractionMethod()))
                .allMatch(item -> expectedVersion.equals(item.extractorVersion()));
        Set<String> currentKeys = current.stream().map(this::itemKey).collect(Collectors.toSet());
        boolean expectedItemsCovered = expectedItems.stream().map(this::itemKey).allMatch(currentKeys::contains);
        if (currentRuleVersion && expectedItemsCovered) {
            return current;
        }

        mapper.deleteRuleItems(job.getId());
        for (JobRequirementItem item : expectedItems) {
            // A reviewed fact wins over a rule fact with the same normalized key.
            // The duplicate-key no-op also makes concurrent lazy refreshes idempotent.
            mapper.insert(item);
        }
        return mapper.findByJobId(job.getId());
    }

    private String itemKey(JobRequirementItem item) {
        return item.itemType() + ":" + item.normalizedKey();
    }
}
