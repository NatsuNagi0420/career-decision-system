/**
 * 文件说明：登录结果视图对象。
 * 职责：封装登录成功后返回给前端的用户信息和访问 Token。
 */
package com.example.ba.vo;

import com.example.ba.pojo.User;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LoginVO {
    private User user;
    private String token;
}

