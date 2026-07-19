package com.careerdecision.backend.career;

import com.careerdecision.backend.career.CareerDirectionModels.DirectionRequest;
import com.careerdecision.backend.career.CareerDirectionModels.DirectionResponse;
import com.careerdecision.backend.career.CareerDirectionModels.DirectionRow;
import com.careerdecision.backend.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;

@Service
public class CareerDirectionService {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };
    private final CareerDirectionMapper mapper;
    private final CareerDirectionJobMapper directionJobMapper;
    private final ObjectMapper objectMapper;

    public CareerDirectionService(
            CareerDirectionMapper mapper,
            CareerDirectionJobMapper directionJobMapper,
            ObjectMapper objectMapper
    ) {
        this.mapper = mapper;
        this.directionJobMapper = directionJobMapper;
        this.objectMapper = objectMapper;
    }

    public List<DirectionResponse> list(long userId, String keyword, String category) {
        return mapper.findAll(userId, trim(keyword), trim(category)).stream().map(this::response).toList();
    }

    public DirectionResponse detail(long userId, long id) {
        DirectionRow row = mapper.findById(userId, id);
        if (row == null) {
            throw new BusinessException(40450, "Career direction not found: " + id);
        }
        return response(row);
    }

    @Transactional
    public DirectionResponse create(long userId, DirectionRequest request) {
        CareerDirectionWriteRecord record = writeRecord(null, userId, request);
        mapper.insert(record);
        return detail(userId, record.getId());
    }

    @Transactional
    public DirectionResponse update(long userId, long id, DirectionRequest request) {
        CareerDirectionWriteRecord record = writeRecord(id, userId, request);
        if (mapper.update(record) == 0) {
            throw new BusinessException(40450, "Custom career direction not found: " + id);
        }
        directionJobMapper.deleteRun(id);
        return detail(userId, id);
    }

    @Transactional
    public void delete(long userId, long id) {
        if (mapper.archive(userId, id) == 0) {
            throw new BusinessException(40450, "Custom career direction not found: " + id);
        }
    }

    @Transactional
    public DirectionResponse favorite(long userId, long id, boolean favorite) {
        if (mapper.countVisible(userId, id) == 0) {
            throw new BusinessException(40450, "Career direction not found: " + id);
        }
        if (favorite && mapper.countFavorite(userId, id) == 0) {
            mapper.insertFavorite(userId, id);
        } else if (!favorite) {
            mapper.deleteFavorite(userId, id);
        }
        return detail(userId, id);
    }

    private CareerDirectionWriteRecord writeRecord(Long id, long userId, DirectionRequest request) {
        CareerDirectionWriteRecord record = new CareerDirectionWriteRecord();
        record.setId(id);
        record.setOwnerUserId(userId);
        record.setName(request.name().trim());
        record.setCategory(request.category().trim());
        record.setSummary(request.summary().trim());
        record.setTypicalWorkJson(json(request.typicalWork()));
        record.setCommonSkillsJson(json(request.commonSkills()));
        record.setGrowthPathJson(json(request.growthPath()));
        record.setMisconceptionsJson(json(request.misconceptions()));
        record.setMajorTagsJson(json(request.majorTags()));
        record.setIndustryTagsJson(json(request.industryTags()));
        record.setWorkTypesJson(json(request.workTypes()));
        return record;
    }

    private DirectionResponse response(DirectionRow row) {
        return new DirectionResponse(
                row.id(), row.code(), row.name(), row.category(), row.summary(),
                strings(row.typicalWorkJson()), strings(row.commonSkillsJson()),
                strings(row.growthPathJson()), strings(row.misconceptionsJson()),
                strings(row.majorTagsJson()), strings(row.industryTagsJson()),
                strings(row.workTypesJson()), row.ownerUserId() != null,
                row.favorite() != null && row.favorite() == 1, row.updatedAt()
        );
    }

    private String json(Collection<String> values) {
        List<String> sanitized = values == null ? List.of() : values.stream()
                .filter(value -> value != null && !value.isBlank()).map(String::trim).distinct().toList();
        try {
            return objectMapper.writeValueAsString(sanitized);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50050, "Failed to serialize career direction.");
        }
    }

    private List<String> strings(String value) {
        if (value == null || value.isBlank()) return List.of();
        try {
            return objectMapper.readValue(value, STRING_LIST);
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }

    private String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
