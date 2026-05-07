/**
 * 文件说明：用户登录 Token 实体类。
 * 职责：映射 sys_user_token 表，保存用户登录产生的访问令牌及过期时间信息。
 */
package com.example.ba.pojo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserToken {
    private String token;
    private Long userId;
    private LocalDateTime expireTime;
    private LocalDateTime createTime;
}

