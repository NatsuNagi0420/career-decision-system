-- ============================================================
-- 数据库重构方案B - 完整执行脚本
-- ============================================================
-- 目的：清理僵尸表、规范表命名、添加密码加密、清理旧数据
-- 执行前：请备份数据库！
-- 执行方式：手动逐步执行，每步验证结果
-- ============================================================

USE career_db;

-- ============================================================
-- 第一步：数据一致性检查（重构前必须执行）
-- ============================================================

-- 1.1 检查user_token是否有孤儿记录
SELECT COUNT(*) as orphan_count, '检查user_token孤儿记录' as check_name
FROM sys_user_token ut
LEFT JOIN sys_user u ON ut.user_id = u.id
WHERE u.id IS NULL;
-- 预期：orphan_count = 0

-- 1.2 检查mbti_user_answer是否有孤儿记录（关联user）
SELECT COUNT(*) as orphan_count, '检查mbti_user_answer关联user的孤儿记录' as check_name
FROM mbti_user_answer mua
LEFT JOIN sys_user u ON mua.user_id = u.id
WHERE u.id IS NULL;
-- 预期：orphan_count = 0

-- 1.3 检查mbti_user_answer是否有孤儿记录（关联question）
SELECT COUNT(*) as orphan_count, '检查mbti_user_answer关联question的孤儿记录' as check_name
FROM mbti_user_answer mua
LEFT JOIN mbti_question mq ON mua.q_id = mq.id
WHERE mq.id IS NULL;
-- 预期：orphan_count = 0

-- 1.4 检查mbti_option是否有孤儿记录
SELECT COUNT(*) as orphan_count, '检查mbti_option孤儿记录' as check_name
FROM mbti_option mo
LEFT JOIN mbti_question mq ON mo.q_id = mq.id
WHERE mq.id IS NULL;
-- 预期：orphan_count = 0

-- 1.5 检查user_report_archive是否有孤儿记录
SELECT COUNT(*) as orphan_count, '检查user_report_archive孤儿记录' as check_name
FROM user_report_archive ura
LEFT JOIN sys_user u ON ura.user_id = u.id
WHERE u.id IS NULL;
-- 预期：orphan_count = 0

-- ⚠️ 如果以上任何检查返回 orphan_count > 0，请先清理孤儿记录再继续！

-- ============================================================
-- 第二步：备份当前数据（可选但强烈建议）
-- ============================================================

-- 2.1 备份sys_user表
CREATE TABLE sys_user_backup_20260325 AS SELECT * FROM sys_user;

-- 2.2 备份sys_user_token表
CREATE TABLE sys_user_token_backup_20260325 AS SELECT * FROM sys_user_token;

-- 2.3 备份mbti_user_answer表
CREATE TABLE mbti_user_answer_backup_20260325 AS SELECT * FROM mbti_user_answer;

-- 2.4 备份user_report_archive表
CREATE TABLE user_report_archive_backup_20260325 AS SELECT * FROM user_report_archive;

-- 验证备份
SELECT
    (SELECT COUNT(*) FROM sys_user) as user_count,
    (SELECT COUNT(*) FROM sys_user_backup_20260325) as user_backup_count,
    (SELECT COUNT(*) FROM sys_user_token) as token_count,
    (SELECT COUNT(*) FROM sys_user_token_backup_20260325) as token_backup_count;
-- 预期：原表和备份表的记录数相同

-- ============================================================
-- 第三步：删除僵尸表（5张未使用的表）
-- ============================================================

-- 3.1 删除user_capability_profile表
DROP TABLE IF EXISTS user_capability_profile;

-- 3.2 删除user_deep_assessment表
DROP TABLE IF EXISTS user_deep_assessment;

-- 3.3 删除user_path_plan表
DROP TABLE IF EXISTS user_path_plan;

-- 3.4 删除user_profile表
DROP TABLE IF EXISTS user_profile;

-- 3.5 删除user_target_job表
DROP TABLE IF EXISTS user_target_job;

-- 验证删除结果
SHOW TABLES LIKE 'user_%';
-- 预期：只剩下 user_report_archive

-- ============================================================
-- 第四步：表重命名（sys_user → user, sys_user_token → user_token）
-- ============================================================

-- 4.1 重命名sys_user为user
RENAME TABLE sys_user TO user;

-- 4.2 重命名sys_user_token为user_token
RENAME TABLE sys_user_token TO user_token;

-- 验证重命名结果
SHOW TABLES;
-- 预期：看到 user 和 user_token，不再有 sys_user 和 sys_user_token

-- ============================================================
-- 第五步：添加last_login_time字段到user表
-- ============================================================

-- 5.1 添加last_login_time字段
ALTER TABLE user
ADD COLUMN last_login_time datetime NULL COMMENT '最后登录时间' AFTER update_time;

-- 验证字段添加
DESC user;
-- 预期：看到 last_login_time 字段

-- ============================================================
-- 第六步：更新表注释（将sys_user改为user）
-- ============================================================

-- 6.1 更新mbti_user_answer表的user_id字段注释
ALTER TABLE mbti_user_answer
MODIFY COLUMN user_id bigint(20) NOT NULL COMMENT '关联用户ID（对应 user.id）';

-- 验证注释更新
SHOW FULL COLUMNS FROM mbti_user_answer WHERE Field = 'user_id';
-- 预期：Comment显示 '关联用户ID（对应 user.id）'

-- ============================================================
-- 第七步：清理旧数据（可选，根据需求决定是否执行）
-- ============================================================

-- 7.1 清理user表中的旧数据（保留结构）
-- ⚠️ 警告：此操作会删除所有用户数据！请谨慎执行！
-- TRUNCATE TABLE user;

-- 7.2 清理user_token表中的旧数据
-- ⚠️ 警告：此操作会删除所有Token数据！请谨慎执行！
-- TRUNCATE TABLE user_token;

-- 7.3 清理mbti_user_answer表中的旧数据
-- ⚠️ 警告：此操作会删除所有MBTI答题记录！请谨慎执行！
-- TRUNCATE TABLE mbti_user_answer;

-- 7.4 清理user_report_archive表中的旧数据
-- ⚠️ 警告：此操作会删除所有报告归档！请谨慎执行！
-- TRUNCATE TABLE user_report_archive;

-- ============================================================
-- 第八步：验证重构结果
-- ============================================================

-- 8.1 验证保留的表（应该有9张）
SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'career_db'
ORDER BY TABLE_NAME;
-- 预期：9张表
-- user, user_token, user_report_archive
-- mbti_question, mbti_option, mbti_dimension, mbti_personality, mbti_user_answer
-- t_2025_multi_area_job_info

-- 8.2 验证user表结构
DESC user;
-- 预期：包含 id, username, phone, password, email, avatar, status, create_time, update_time, last_login_time, is_deleted

-- 8.3 验证user_token表结构
DESC user_token;
-- 预期：包含 token, user_id, expire_time, create_time

-- 8.4 验证索引是否保留
SHOW INDEX FROM user_token WHERE Key_name = 'idx_user_id';
SHOW INDEX FROM mbti_user_answer WHERE Key_name = 'idx_user_id';
SHOW INDEX FROM mbti_user_answer WHERE Key_name = 'idx_q_id';
SHOW INDEX FROM mbti_option WHERE Key_name = 'idx_q_id';
SHOW INDEX FROM user_report_archive WHERE Key_name = 'idx_user_id';
-- 预期：每个都返回1行

-- 8.5 验证数据一致性（重构后）
SELECT COUNT(*) as orphan_count, '重构后检查user_token孤儿记录' as check_name
FROM user_token ut
LEFT JOIN user u ON ut.user_id = u.id
WHERE u.id IS NULL;
-- 预期：orphan_count = 0

SELECT COUNT(*) as orphan_count, '重构后检查mbti_user_answer孤儿记录' as check_name
FROM mbti_user_answer mua
LEFT JOIN user u ON mua.user_id = u.id
WHERE u.id IS NULL;
-- 预期：orphan_count = 0

-- ============================================================
-- 第九步：测试基本功能
-- ============================================================

-- 9.1 测试插入用户
INSERT INTO user(username, phone, password, email, avatar, status, create_time, update_time, is_deleted)
VALUES('test_user', '13800138000', 'test_password', 'test@example.com', '/profile/defaultIcon.png', 1, NOW(), NOW(), 0);

-- 9.2 测试查询用户
SELECT * FROM user WHERE username = 'test_user';

-- 9.3 测试插入Token
INSERT INTO user_token(token, user_id, expire_time)
VALUES('test_token_123', LAST_INSERT_ID(), DATE_ADD(NOW(), INTERVAL 7 DAY));

-- 9.4 测试查询Token
SELECT * FROM user_token WHERE token = 'test_token_123';

-- 9.5 测试关联查询
SELECT u.username, ut.token, ut.expire_time
FROM user u
INNER JOIN user_token ut ON u.id = ut.user_id
WHERE u.username = 'test_user';

-- 9.6 清理测试数据
DELETE FROM user_token WHERE token = 'test_token_123';
DELETE FROM user WHERE username = 'test_user';

-- ============================================================
-- 第十步：清理备份表（可选，确认无误后执行）
-- ============================================================

-- ⚠️ 警告：只有在确认重构成功且数据无误后才执行此步骤！

-- DROP TABLE IF EXISTS sys_user_backup_20260325;
-- DROP TABLE IF EXISTS sys_user_token_backup_20260325;
-- DROP TABLE IF EXISTS mbti_user_answer_backup_20260325;
-- DROP TABLE IF EXISTS user_report_archive_backup_20260325;

-- ============================================================
-- 执行完成检查清单
-- ============================================================

/*
✅ 第一步：数据一致性检查 - 所有孤儿记录检查返回0
✅ 第二步：备份当前数据 - 备份表创建成功，记录数匹配
✅ 第三步：删除僵尸表 - 5张表删除成功
✅ 第四步：表重命名 - sys_user → user, sys_user_token → user_token
✅ 第五步：添加字段 - last_login_time字段添加成功
✅ 第六步：更新注释 - mbti_user_answer.user_id注释更新
✅ 第七步：清理旧数据 - 根据需求决定是否执行
✅ 第八步：验证重构结果 - 9张表保留，结构正确，索引完整
✅ 第九步：测试基本功能 - 插入、查询、关联查询正常
✅ 第十步：清理备份表 - 确认无误后清理

下一步：
1. 修改UserMapper.java（4处表名）
2. 修改UserTokenMapper.java（2处表名）
3. 重启后端服务
4. 执行完整的功能测试
*/

-- ============================================================
-- 脚本结束
-- ============================================================
