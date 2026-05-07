/**
 * 文件说明：系统用户表 Mapper。
 * 职责：操作 sys_user 表，提供按用户名/手机号/ID 查询用户以及插入新用户的能力。
 */
package com.example.ba.mapper;

import com.example.ba.pojo.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;

@Mapper
public interface UserMapper {

    @Select("select * from sys_user where username = #{username} and is_deleted = 0")
    User getByUsername(String username);

    @Select("select * from sys_user where phone = #{phone} and is_deleted = 0")
    User getByPhone(String phone);

    @Select("select * from sys_user where id = #{id} and is_deleted = 0")
    User getById(Long id);

    @Insert("insert into sys_user(username, phone, password, email, avatar, status, create_time, update_time, is_deleted) " +
            "values(#{username}, #{phone}, #{password}, #{email}, #{avatar}, #{status}, #{createTime}, #{updateTime}, #{isDeleted})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(User user);
}
