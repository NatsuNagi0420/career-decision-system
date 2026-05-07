/**
 * 文件说明：用户账户业务接口。
 * 职责：定义用户注册与登录等核心业务操作，并约定默认头像等账户相关常量。
 */
package com.example.ba.service;

import com.example.ba.dto.UserLoginDTO;
import com.example.ba.dto.UserRegisterDTO;
import com.example.ba.pojo.User;

public interface UserService {
    /**
     * 默认用户头像路径
     */
    String DEFAULT_AVATAR = "/avatar/avatar.png";

    void register(UserRegisterDTO userRegisterDTO);
    User login(UserLoginDTO userLoginDTO);
}
