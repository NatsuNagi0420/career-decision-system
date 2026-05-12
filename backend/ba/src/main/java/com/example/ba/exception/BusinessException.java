/**
 * 文件说明：业务异常类。
 * 职责：封装业务逻辑中的异常情况，由全局异常处理器统一处理。
 */
package com.example.ba.exception;

/**
 * 业务异常类
 * 用于封装业务逻辑中的异常情况，由全局异常处理器统一处理
 */
public class BusinessException extends RuntimeException {

    /**
     * 错误码（可选，用于前端区分不同类型的业务错误）
     */
    private Integer code;

    public BusinessException(String message) {
        super(message);
        this.code = 500;
    }

    public BusinessException(Integer code, String message) {
        super(message);
        this.code = code;
    }

    public BusinessException(String message, Throwable cause) {
        super(message, cause);
        this.code = 500;
    }

    public Integer getCode() {
        return code;
    }
}
