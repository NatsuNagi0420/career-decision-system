package com.careerdecision.backend.asset;

import com.careerdecision.backend.config.DataServerProperties;
import com.careerdecision.backend.exception.BusinessException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Map;

@Service
public class ImageAssetService {
    private static final Map<String, MediaType> IMAGE_MEDIA_TYPES = Map.of(
            "avif", MediaType.valueOf("image/avif"),
            "gif", MediaType.IMAGE_GIF,
            "ico", MediaType.valueOf("image/x-icon"),
            "jpeg", MediaType.IMAGE_JPEG,
            "jpg", MediaType.IMAGE_JPEG,
            "png", MediaType.IMAGE_PNG,
            "webp", MediaType.valueOf("image/webp")
    );

    private final DataServerProperties dataServerProperties;

    public ImageAssetService(DataServerProperties dataServerProperties) {
        this.dataServerProperties = dataServerProperties;
    }

    public ResolvedImageAsset requireImage(String filename) {
        validateFilename(filename);
        MediaType mediaType = mediaTypeFor(filename);
        Path imageRoot = Paths.get(dataServerProperties.normalizedRootLocation())
                .toAbsolutePath()
                .normalize()
                .resolve("images")
                .normalize();
        Path imagePath = imageRoot
                .resolve(filename)
                .normalize();
        if (!imagePath.startsWith(imageRoot)) {
            throw new BusinessException(40040, "Invalid image asset filename.");
        }
        if (!Files.exists(imagePath, LinkOption.NOFOLLOW_LINKS)
                || Files.isSymbolicLink(imagePath)
                || !Files.isRegularFile(imagePath, LinkOption.NOFOLLOW_LINKS)) {
            throw new BusinessException(40404, "Image asset not found: " + filename);
        }

        return new ResolvedImageAsset(filename, imagePath, mediaType);
    }

    private void validateFilename(String filename) {
        if (filename == null || filename.isBlank()
                || filename.contains("..")
                || filename.contains("/")
                || filename.contains("\\")) {
            throw new BusinessException(40040, "Invalid image asset filename.");
        }
    }

    private MediaType mediaTypeFor(String filename) {
        int dotIndex = filename.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex == filename.length() - 1) {
            throw new BusinessException(40040, "Unsupported image asset type.");
        }
        String extension = filename.substring(dotIndex + 1).toLowerCase(Locale.ROOT);
        MediaType mediaType = IMAGE_MEDIA_TYPES.get(extension);
        if (mediaType == null) {
            throw new BusinessException(40040, "Unsupported image asset type.");
        }
        return mediaType;
    }

    public record ResolvedImageAsset(String filename, Path path, MediaType mediaType) {
    }
}
