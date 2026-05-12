/**
 * 文件说明：用户账户相关控制器。
 * 职责：提供用户注册、登录、获取当前登录用户信息以及退出登录等接口，
 *       并在登录成功后生成并保存访问 Token。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.UserLoginDTO;
import com.example.ba.dto.UserRegisterDTO;
import com.example.ba.exception.BusinessException;
import com.example.ba.mapper.UserMapper;
import com.example.ba.mapper.UserTokenMapper;
import com.example.ba.pojo.User;
import com.example.ba.service.UserService;
import com.example.ba.utils.AuthContext;
import com.example.ba.utils.BaseUrlUtils;
import com.example.ba.vo.LoginVO;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.UUID;

@RestController
@RequestMapping("/api/user")
@CrossOrigin
public class UserController {

    @Autowired
    private UserService userService;

    @Autowired
    private UserTokenMapper userTokenMapper;

    @Autowired
    private UserMapper userMapper;

    @PostMapping("/register")
    public Result<String> register(@Valid @RequestBody UserRegisterDTO userRegisterDTO) {
        userService.register(userRegisterDTO);
        return Result.success("注册成功");
    }

    @PostMapping("/login")
    public Result<LoginVO> login(@Valid @RequestBody UserLoginDTO userLoginDTO) {
        User user = userService.login(userLoginDTO);
        // 登录成功，不返回密码
        user.setPassword("******");

        String token = UUID.randomUUID().toString().replace("-", "");
        userTokenMapper.insert(com.example.ba.pojo.UserToken.builder()
                .token(token)
                .userId(user.getId())
                .expireTime(LocalDateTime.now().plusDays(7))
                .build());

        return Result.success(new LoginVO(user, token));
    }

    @GetMapping("/info")
    public Result<User> info() {
        Long userId = AuthContext.getUserId();
        User user = userMapper.getById(userId);
        if (user == null) {
            throw new BusinessException(401, "未登录");
        }
        user.setPassword("******");
        String avatarPath = (user.getAvatar() == null || user.getAvatar().isEmpty())
                ? UserService.DEFAULT_AVATAR
                : user.getAvatar();
        user.setAvatar(BaseUrlUtils.getAbsoluteUrl("/images" + avatarPath));
        return Result.success(user);
    }
}
