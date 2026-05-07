/**
 * 文件说明：系统用户实体类。
 * 职责：映射 sys_user 表字段，保存平台用户的基础账户信息（用户名、手机号、邮箱、头像等）。
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
public class User {
    private Long id;
    private String username;
    private String phone;
    private String password;
    private String email;
    private String avatar; // 新增头像字段，演示动态拼接 URL
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Integer isDeleted;
}
