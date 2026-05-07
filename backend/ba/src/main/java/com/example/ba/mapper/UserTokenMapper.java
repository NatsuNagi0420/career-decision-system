/**
 * 文件说明：用户登录 Token 表 Mapper。
 * 职责：操作 sys_user_token 表，提供插入新的登录 Token 和根据 Token 查询记录的能力。
 */
package com.example.ba.mapper;

import com.example.ba.pojo.UserToken;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserTokenMapper {
    @Insert("insert into sys_user_token(token, user_id, expire_time) values(#{token}, #{userId}, #{expireTime})")
    void insert(UserToken token);

    @Select("select token, user_id as userId, expire_time as expireTime, create_time as createTime from sys_user_token where token = #{token}")
    UserToken getByToken(String token);
}

