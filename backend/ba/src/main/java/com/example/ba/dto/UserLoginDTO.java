/**
 * 文件说明：用户登录请求 DTO。
 * 职责：承载前端登录表单提交的用户名和密码信息。
 */
package com.example.ba.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UserLoginDTO {
    @NotBlank(message = "用户名不能为空")
    private String username;

    @NotBlank(message = "密码不能为空")
    private String password;
}
