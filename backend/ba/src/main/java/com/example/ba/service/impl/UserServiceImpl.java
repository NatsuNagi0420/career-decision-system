/**
 * 文件说明：用户账户业务实现类。
 * 职责：实现用户注册、登录等核心逻辑，包括唯一性校验、密码校验以及头像 URL 处理等。
 */
package com.example.ba.service.impl;

import com.example.ba.dto.UserLoginDTO;
import com.example.ba.dto.UserRegisterDTO;
import com.example.ba.exception.BusinessException;
import com.example.ba.pojo.User;
import com.example.ba.mapper.UserMapper;
import com.example.ba.service.UserService;
import com.example.ba.utils.BaseUrlUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;

@Service
public class UserServiceImpl implements UserService {

    private static final Logger log = LoggerFactory.getLogger(UserServiceImpl.class);

    @Autowired
    private UserMapper userMapper;

    @Override
    public void register(UserRegisterDTO dto) {
        log.info("用户注册: username={}, phone={}", dto.getUsername(), dto.getPhone());

        // 1. 检查用户名是否已存在
        User existUser = userMapper.getByUsername(dto.getUsername());
        if (existUser != null) {
            log.warn("用户注册失败: 用户名已存在, username={}", dto.getUsername());
            throw new BusinessException("用户名已存在");
        }

        // 2. 检查手机号是否已存在
        User existPhone = userMapper.getByPhone(dto.getPhone());
        if (existPhone != null) {
            log.warn("用户注册失败: 手机号已注册, phone={}", dto.getPhone());
            throw new BusinessException("该手机号已注册");
        }

        // 3. 构建用户实体 (实际项目中应对密码进行加密，如 BCrypt)
        User user = User.builder()
                .username(dto.getUsername())
                .phone(dto.getPhone())
                .password(dto.getPassword()) // TODO: 加密处理
                .email(dto.getEmail())
                .avatar(UserService.DEFAULT_AVATAR) // 使用常量设置默认头像
                .status(1)
                .createTime(LocalDateTime.now())
                .updateTime(LocalDateTime.now())
                .isDeleted(0)
                .build();

        // 4. 保存到数据库
        userMapper.insert(user);
        log.info("用户注册成功: userId={}, username={}", user.getId(), user.getUsername());
    }

    @Override
    public User login(UserLoginDTO dto) {
        log.info("用户登录: username={}", dto.getUsername());

        // 1. 根据用户名查询用户
        User user = userMapper.getByUsername(dto.getUsername());

        // 2. 校验
        if (user == null) {
            log.warn("用户登录失败: 用户不存在, username={}", dto.getUsername());
            throw new BusinessException("用户不存在");
        }

        if (!user.getPassword().equals(dto.getPassword())) {
            log.warn("用户登录失败: 密码错误, username={}", dto.getUsername());
            throw new BusinessException("密码错误");
        }

        if (user.getStatus() == 0) {
            log.warn("用户登录失败: 账号已被禁用, username={}", dto.getUsername());
            throw new BusinessException("账号已被禁用");
        }

        // 3. 处理动态资源路径
        // 如果数据库中没有头像，则使用默认头像常量
        String avatarPath = (user.getAvatar() == null || user.getAvatar().isEmpty())
                            ? UserService.DEFAULT_AVATAR
                            : user.getAvatar();

        // 如果是默认头像，使用内置资源路径；如果是用户上传头像，使用上传资源路径
        String fullAvatarPath = avatarPath.equals(UserService.DEFAULT_AVATAR)
            ? avatarPath  // 默认头像：/profile/defaultIcon.png
            : "/uploads" + avatarPath;  // 用户上传：/uploads/xxx.png
        user.setAvatar(BaseUrlUtils.getAbsoluteUrl(fullAvatarPath));

        log.info("用户登录成功: userId={}, username={}", user.getId(), user.getUsername());
        return user;
    }
}
