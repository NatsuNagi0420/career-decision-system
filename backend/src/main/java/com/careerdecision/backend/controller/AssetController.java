package com.careerdecision.backend.controller;

import com.careerdecision.backend.asset.ImageAssetService;
import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.common.AssetUrlBuilder;
import org.springframework.core.io.PathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
public class AssetController {
    private final AssetUrlBuilder assetUrlBuilder;
    private final ImageAssetService imageAssetService;

    public AssetController(AssetUrlBuilder assetUrlBuilder, ImageAssetService imageAssetService) {
        this.assetUrlBuilder = assetUrlBuilder;
        this.imageAssetService = imageAssetService;
    }

    @GetMapping("/api/v1/assets/images/{filename:.+}")
    public ApiResponse<AssetUrlResponse> imageUrl(@PathVariable String filename) {
        ImageAssetService.ResolvedImageAsset image = imageAssetService.requireImage(filename);
        String url = assetUrlBuilder.imageUrl(image.filename());
        return ApiResponse.success(new AssetUrlResponse(image.filename(), url));
    }

    @GetMapping("/data-server/images/{filename:.+}")
    public ResponseEntity<PathResource> imageFile(@PathVariable String filename) {
        ImageAssetService.ResolvedImageAsset image = imageAssetService.requireImage(filename);
        return ResponseEntity.ok()
                .contentType(image.mediaType())
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .body(new PathResource(image.path()));
    }

    public record AssetUrlResponse(String filename, String url) {
    }
}
