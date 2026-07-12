package com.careerdecision.backend.exception;

import com.careerdecision.backend.common.ApiResponse;
import com.careerdecision.backend.common.TraceContext;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Comparator;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException ex) {
        int httpStatus = toHttpStatus(ex.code());
        logHandled(ex, httpStatus, ex.code());
        return ResponseEntity.status(httpStatus).body(ApiResponse.error(ex.code(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationException(MethodArgumentNotValidException ex) {
        logHandled(ex, 400, 400);
        String message = ex.getBindingResult().getFieldErrors().stream()
                .min(Comparator.comparing(error -> error.getField() == null ? "" : error.getField()))
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .orElse("Invalid request.");
        return ResponseEntity.badRequest().body(ApiResponse.error(400, message));
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiResponse<Void>> handleHandlerMethodValidationException(HandlerMethodValidationException ex) {
        logHandled(ex, 400, 400);
        String message = ex.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> result.getMethodParameter().getParameterName() + " " + error.getDefaultMessage()))
                .findFirst()
                .orElse("Invalid request.");
        return ResponseEntity.badRequest().body(ApiResponse.error(400, message));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraintViolationException(ConstraintViolationException ex) {
        logHandled(ex, 400, 400);
        String message = ex.getConstraintViolations().stream()
                .min(Comparator.comparing(violation -> violation.getPropertyPath().toString()))
                .map(violation -> violation.getPropertyPath() + " " + violation.getMessage())
                .orElse("Invalid request.");
        return ResponseEntity.badRequest().body(ApiResponse.error(400, message));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatchException(MethodArgumentTypeMismatchException ex) {
        logHandled(ex, 400, 400);
        String name = ex.getName() == null || ex.getName().isBlank() ? "parameter" : ex.getName();
        return ResponseEntity.badRequest().body(ApiResponse.error(400, name + " has an invalid value."));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnreadableMessageException(HttpMessageNotReadableException ex) {
        logHandled(ex, 400, 400);
        return ResponseEntity.badRequest().body(ApiResponse.error(400, "Malformed JSON request."));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResourceFoundException(NoResourceFoundException ex) {
        logHandled(ex, 404, 404);
        return ResponseEntity.status(404).body(ApiResponse.error(404, "Resource not found."));
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoHandlerFoundException(NoHandlerFoundException ex) {
        logHandled(ex, 404, 404);
        return ResponseEntity.status(404).body(ApiResponse.error(404, "Resource not found."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleException(Exception ex) {
        log.error(
                "Unhandled API error errorType={} status=500 code=500 traceId={}",
                ex.getClass().getSimpleName(), TraceContext.getOrCreate(), ex
        );
        return ResponseEntity.internalServerError().body(ApiResponse.error(500, "Internal server error"));
    }

    private void logHandled(Exception ex, int status, int code) {
        log.warn(
                "Handled API error errorType={} status={} code={} traceId={}",
                ex.getClass().getSimpleName(), status, code, TraceContext.getOrCreate()
        );
    }

    private int toHttpStatus(int code) {
        if (code == 401 || (code >= 40100 && code < 40200)) {
            return 401;
        }
        if (code >= 40400 && code < 40500) {
            return 404;
        }
        if (code >= 40900 && code < 41000) {
            return 409;
        }
        if (code == 429 || (code >= 42900 && code < 43000)) {
            return 429;
        }
        if (code >= 50000 && code < 60000) {
            return 500;
        }
        return 400;
    }
}
