package com.careerdecision.backend.common;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TraceIdFilterTest.TraceTestController.class)
class TraceIdFilterTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void headerRequestIdIsReturnedAsTraceId() throws Exception {
        mockMvc.perform(get("/api/v1/health")
                        .header(TraceIdFilter.REQUEST_ID_HEADER, "trace-health-001"))
                .andExpect(status().isOk())
                .andExpect(header().string(TraceIdFilter.TRACE_ID_HEADER, "trace-health-001"))
                .andExpect(jsonPath("$.traceId", is("trace-health-001")));
    }

    @Test
    void bodyRequestIdOverridesGeneratedTraceForAgentProxyEndpoint() throws Exception {
        mockMvc.perform(post("/trace-test/echo")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "requestId": "trace-body-001"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(header().string(TraceIdFilter.TRACE_ID_HEADER, "trace-body-001"))
                .andExpect(jsonPath("$.traceId", is("trace-body-001")));
    }

    @Test
    void validationErrorUsesEnvelopeAndTraceId() throws Exception {
        mockMvc.perform(post("/trace-test/validate")
                        .header(TraceIdFilter.REQUEST_ID_HEADER, "trace-invalid-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "message": ""
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(header().string(TraceIdFilter.TRACE_ID_HEADER, "trace-invalid-001"))
                .andExpect(jsonPath("$.code", is(400)))
                .andExpect(jsonPath("$.traceId", is("trace-invalid-001")));
    }

    @RestController
    static class TraceTestController {
        @PostMapping("/trace-test/echo")
        ApiResponse<Map<String, String>> echo(@RequestBody TraceRequest request) {
            return ApiResponse.success(Map.of("status", "ok"), request.requestId());
        }

        @PostMapping("/trace-test/validate")
        ApiResponse<Void> validate(@Valid @RequestBody ValidationRequest request) {
            return ApiResponse.success(null);
        }
    }

    record TraceRequest(String requestId) {
    }

    record ValidationRequest(@NotBlank String message) {
    }
}
