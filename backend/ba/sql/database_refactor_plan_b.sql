-- ============================================
-- 数据库重构脚本 - 方案B（完整重构）
-- 执行前请备份数据库！
-- ============================================

USE career_system;

-- ============================================
-- 第一步：删除未使用的表（5个僵尸表）
-- ============================================
DROP TABLE IF EXISTS user_capability_profile;
DROP TABLE IF EXISTS user_deep_assessment;
DROP TABLE IF EXISTS user_path_plan;
DROP TABLE IF EXISTS user_profile;
DROP TABLE IF EXISTS user_target_job;

-- ============================================
-- 第二步：重命名表（统一命名规范）
-- ============================================
-- 将 sys_user 重命名为 user
RENAME TABLE sys_user TO user;

-- 将 sys_user_token 重命名为 user_token
RENAME TABLE sys_user_token TO user_token;

-- ============================================
-- 第三步：修改 user 表结构
-- ============================================
-- 1. 修改密码字段长度（BCrypt需要60字符）
ALTER TABLE user MODIFY COLUMN password VARCHAR(60) NOT NULL COMMENT '加密后的密码(BCrypt)';

-- 2. 修改头像字段注释（明确存储规则）
ALTER TABLE user MODIFY COLUMN avatar VARCHAR(255) NULL DEFAULT NULL COMMENT '头像相对路径（默认:/profile/defaultIcon.png 用户上传:/avatar/xxx.png）';

-- 3. 添加最后登录时间字段（可选，用于统计分析）
ALTER TABLE user ADD COLUMN last_login_time DATETIME NULL DEFAULT NULL COMMENT '最后登录时间' AFTER status;

-- ============================================
-- 第四步：清空测试数据
-- ============================================
TRUNCATE TABLE user_token;
TRUNCATE TABLE user;
TRUNCATE TABLE mbti_user_answer;
TRUNCATE TABLE user_report_archive;

-- ============================================
-- 第五步：重置自增ID
-- ============================================
ALTER TABLE user AUTO_INCREMENT = 1;
ALTER TABLE user_token AUTO_INCREMENT = 1;
ALTER TABLE mbti_user_answer AUTO_INCREMENT = 1;
ALTER TABLE user_report_archive AUTO_INCREMENT = 1;

-- ============================================
-- 验证：查看表结构
-- ============================================
SHOW TABLES;
DESC user;
DESC user_token;
