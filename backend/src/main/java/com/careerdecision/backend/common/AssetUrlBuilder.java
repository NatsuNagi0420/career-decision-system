package com.careerdecision.backend.common;

import com.careerdecision.backend.config.DataServerProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@Component
public class AssetUrlBuilder {
    private final DataServerProperties dataServerProperties;

    public AssetUrlBuilder(DataServerProperties dataServerProperties) {
        this.dataServerProperties = dataServerProperties;
    }

    public String imageUrl(String filename) {
        return ServletUriComponentsBuilder.fromCurrentContextPath()
                .path(dataServerProperties.normalizedPublicPath())
                .pathSegment("images", filename)
                .toUriString();
    }
}
