package com.careerdecision.backend.career;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class CareerDirectionMapperTest {
    @Autowired
    private CareerDirectionMapper mapper;

    @Test
    void mapsCatalogRows() {
        org.assertj.core.api.Assertions.assertThat(mapper.findAll(1L, null, null)).hasSizeGreaterThanOrEqualTo(2);
    }
}
