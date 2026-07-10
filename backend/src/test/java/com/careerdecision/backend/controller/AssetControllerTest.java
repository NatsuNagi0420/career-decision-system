package com.careerdecision.backend.controller;

import com.careerdecision.backend.asset.ImageAssetService;
import com.careerdecision.backend.common.AssetUrlBuilder;
import com.careerdecision.backend.config.DataServerProperties;
import com.careerdecision.backend.exception.GlobalExceptionHandler;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.FileSystemException;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AssetControllerTest {
    @TempDir
    private Path dataServerRoot;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() throws Exception {
        Files.createDirectories(dataServerRoot.resolve("images"));
        DataServerProperties properties = new DataServerProperties(dataServerRoot.toString(), "/data-server");
        AssetController controller = new AssetController(
                new AssetUrlBuilder(properties),
                new ImageAssetService(properties)
        );
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void imageUrlIsGeneratedFromCurrentRequestContext() throws Exception {
        String filename = "avatar space.png";
        Files.writeString(dataServerRoot.resolve("images").resolve(filename), "fake image");

        mockMvc.perform(get("/api/v1/assets/images/{filename}", filename)
                        .with(request -> {
                            request.setScheme("http");
                            request.setServerName("backend.lan.test");
                            request.setServerPort(18080);
                            return request;
                        }))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.filename", is(filename)))
                .andExpect(jsonPath(
                        "$.data.url",
                        is("http://backend.lan.test:18080/data-server/images/avatar%20space.png")
                ));
    }

    @Test
    void missingImageReturnsBusinessError() throws Exception {
        mockMvc.perform(get("/api/v1/assets/images/missing.png"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40404)))
                .andExpect(jsonPath("$.message", is("Image asset not found: missing.png")));
    }

    @Test
    void invalidImageFilenameIsRejectedBeforePathResolution() throws Exception {
        mockMvc.perform(get("/api/v1/assets/images/..secret.png"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(40040)))
                .andExpect(jsonPath("$.message", is("Invalid image asset filename.")));
    }

    @Test
    void unsupportedImageExtensionIsRejected() throws Exception {
        Files.writeString(dataServerRoot.resolve("images").resolve("notes.txt"), "not an image");

        mockMvc.perform(get("/api/v1/assets/images/notes.txt"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code", is(40040)))
                .andExpect(jsonPath("$.message", is("Unsupported image asset type.")));
    }

    @Test
    void imageFileIsServedThroughValidatedController() throws Exception {
        Files.writeString(dataServerRoot.resolve("images").resolve("avatar.png"), "fake image");

        mockMvc.perform(get("/data-server/images/avatar.png"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", Matchers.containsString("max-age=3600")))
                .andExpect(content().contentType("image/png"))
                .andExpect(content().string("fake image"));
    }

    @Test
    void privateDataServerRootFileIsNotExposedByStaticResourceHandler() throws Exception {
        Files.writeString(dataServerRoot.resolve("private.txt"), "secret");

        mockMvc.perform(get("/data-server/private.txt"))
                .andExpect(status().isNotFound());
    }

    @Test
    void symbolicLinkImageIsNotExposedAsPublicAsset() throws Exception {
        Path privateFile = dataServerRoot.resolve("private.txt");
        Files.writeString(privateFile, "secret");
        Path linkedImage = dataServerRoot.resolve("images").resolve("linked.png");
        try {
            Files.createSymbolicLink(linkedImage, privateFile);
        } catch (FileSystemException | UnsupportedOperationException | SecurityException ex) {
            Assumptions.abort("Symbolic links are not available in this environment.");
        }

        mockMvc.perform(get("/api/v1/assets/images/linked.png"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40404)))
                .andExpect(jsonPath("$.message", is("Image asset not found: linked.png")));

        mockMvc.perform(get("/data-server/images/linked.png"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", is(40404)))
                .andExpect(jsonPath("$.message", is("Image asset not found: linked.png")));
    }
}
