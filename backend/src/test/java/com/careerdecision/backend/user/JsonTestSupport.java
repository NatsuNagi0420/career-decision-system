package com.careerdecision.backend.user;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

final class JsonTestSupport {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private JsonTestSupport() {
    }

    static String stringAt(String json, String dottedPath) {
        try {
            JsonNode node = OBJECT_MAPPER.readTree(json);
            for (String segment : dottedPath.split("\\.")) {
                node = node.path(segment);
            }
            if (node.isMissingNode() || node.isNull()) {
                throw new AssertionError("JSON path not found: " + dottedPath);
            }
            return node.asText();
        } catch (Exception ex) {
            throw new AssertionError("Failed to read JSON path: " + dottedPath, ex);
        }
    }
}
