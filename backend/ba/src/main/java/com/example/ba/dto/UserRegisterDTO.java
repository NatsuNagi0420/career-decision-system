/**
 * 文件说明：用户注册请求 DTO。
 * 职责：承载注册时的用户名、手机号、邮箱及密码等表单数据。
 */
package com.example.ba.dto;

import lombok.Data;

@Data
public class UserRegisterDTO {
    private String username;
    private String phone;
    private String password;
    private String confirmPassword;
    private String email;
}
