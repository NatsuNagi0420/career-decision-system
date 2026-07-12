package com.careerdecision.backend.evidence;

import com.careerdecision.backend.evidence.PersonalEvidenceModels.EvidenceRequest;
import com.careerdecision.backend.evidence.PersonalEvidenceModels.EvidenceResponse;
import com.careerdecision.backend.exception.BusinessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class PersonalEvidenceService {
    private static final Set<String> CREDIBILITY = Set.of("low", "medium", "high");
    private static final Set<String> SOURCE_TYPES = Set.of("user", "assessment", "resume", "task_result", "ai");
    private final PersonalEvidenceMapper mapper;

    public PersonalEvidenceService(PersonalEvidenceMapper mapper) {
        this.mapper = mapper;
    }

    public List<EvidenceResponse> list(long userId, String type) {
        return mapper.findAll(userId, trim(type)).stream().map(this::response).toList();
    }

    public EvidenceResponse detail(long userId, long id) {
        PersonalEvidenceEntity entity = mapper.findById(userId, id);
        if (entity == null) notFound(id);
        return response(entity);
    }

    @Transactional
    public EvidenceResponse create(long userId, EvidenceRequest request) {
        PersonalEvidenceEntity entity = entity(null, userId, request);
        mapper.insert(entity);
        return detail(userId, entity.getId());
    }

    @Transactional
    public EvidenceResponse update(long userId, long id, EvidenceRequest request) {
        PersonalEvidenceEntity entity = entity(id, userId, request);
        if (mapper.update(entity) == 0) notFound(id);
        return detail(userId, id);
    }

    @Transactional
    public void hide(long userId, long id) {
        if (mapper.hide(userId, id) == 0) notFound(id);
    }

    private PersonalEvidenceEntity entity(Long id, long userId, EvidenceRequest request) {
        PersonalEvidenceEntity entity = new PersonalEvidenceEntity();
        entity.setId(id);
        entity.setUserId(userId);
        entity.setEvidenceType(request.evidenceType().trim());
        entity.setTitle(request.title().trim());
        entity.setDescription(trim(request.description()));
        entity.setRoleName(trim(request.roleName()));
        entity.setResultSummary(trim(request.resultSummary()));
        entity.setLinkUrl(trim(request.linkUrl()));
        entity.setProficiency(trim(request.proficiency()));
        entity.setLastUsedAt(request.lastUsedAt());
        entity.setFeedback(trim(request.feedback()));
        String source = normalize(request.sourceType());
        entity.setSourceType(SOURCE_TYPES.contains(source) ? source : "user");
        entity.setSourceRefType(trim(request.sourceRefType()));
        entity.setSourceRefId(request.sourceRefId());
        String credibility = normalize(request.credibility());
        entity.setCredibility(CREDIBILITY.contains(credibility) ? credibility : "medium");
        entity.setOccurredAt(request.occurredAt());
        return entity;
    }

    private EvidenceResponse response(PersonalEvidenceEntity entity) {
        return new EvidenceResponse(
                entity.getId(), entity.getEvidenceType(), entity.getTitle(), entity.getDescription(),
                entity.getRoleName(), entity.getResultSummary(), entity.getLinkUrl(), entity.getProficiency(),
                entity.getLastUsedAt(), entity.getFeedback(),
                entity.getSourceType(), entity.getSourceRefType(), entity.getSourceRefId(),
                entity.getCredibility(), entity.getVisibility(), entity.getOccurredAt(),
                entity.getCreatedAt(), entity.getUpdatedAt()
        );
    }

    private String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String normalize(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }
    private void notFound(long id) { throw new BusinessException(40455, "Personal evidence not found: " + id); }
}
