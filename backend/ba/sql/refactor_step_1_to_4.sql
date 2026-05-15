-- ============================================================
-- 数据库重构方案B - 步骤1-4执行脚本
-- ============================================================
-- 执行时间：请在低峰期执行
-- 执行方式：在MySQL客户端（Navicat/MySQL Workbench）中逐步执行
-- 注意事项：每执行一步，请检查验证结果后再继续
-- ============================================================

USE career_db;

-- ============================================================
-- 第一步：数据一致性检查（重构前必须执行）
-- ============================================================
-- 目的：确保没有孤儿记录，避免数据不一致

SELECT '=== 第一步：数据一致性检查 ===' as step;

-- 1.1 检查user_token是否有孤儿记录
SELECT
    COUNT(*) as orphan_count,
    '检查user_token孤儿记录' as check_name,
    CASE WHEN COUNT(*) = 0 THEN '✅ 通过' ELSE '❌ 失败' END as status
FROM sys_user_token ut
LEFT JOIN sys_user u ON ut.user_id = u.id
WHERE u.id IS NULL;
-- 预期：orphan_count = 0

-- 1.2 检查mbti_user_answer是否有孤儿记录（关联user）
SELECT
    COUNT(*) as orphan_count,
    '检查mbti_user_answer关联user的孤儿记录' as check_name,
    CASE WHEN COUNT(*) = 0 THEN '✅ 通过' ELSE '❌ 失败' END as status
FROM mbti_user_answer mua
LEFT JOIN sys_user u ON mua.user_id = u.id
WHERE u.id IS NULL;
-- 预期：orphan_count = 0

-- 1.3 检查mbti_user_answer是否有孤儿记录（关联question）
SELECT
    COUNT(*) as orphan_count,
    '检查mbti_user_answer关联question的孤儿记录' as check_name,
    CASE WHEN COUNT(*) = 0 THEN '✅ 通过' ELSE '❌ 失败' END as status
FROM mbti_user_answer mua
LEFT JOIN mbti_question mq ON mua.q_id = mq.id
WHERE mq.id IS NULL;
-- 预期：orphan_count = 0

-- 1.4 检查mbti_option是否有孤儿记录
SELECT
    COUNT(*) as orphan_count,
    '检查mbti_option孤儿记录' as check_name,
    CASE WHEN COUNT(*) = 0 THEN '✅ 通过' ELSE '❌ 失败' END as status
FROM mbti_option mo
LEFT JOIN mbti_question mq ON mo.q_id = mq.id
WHERE mq.id IS NULL;
-- 预期：orphan_count = 0

-- 1.5 检查user_report_archive是否有孤儿记录
SELECT
    COUNT(*) as orphan_count,
    '检查user_report_archive孤儿记录' as check_name,
    CASE WHEN COUNT(*) = 0 THEN '✅ 通过' ELSE '❌ 失败' END as status
FROM user_report_archive ura
LEFT JOIN sys_user u ON ura.user_id = u.id
WHERE u.id IS NULL;
-- 预期：orphan_count = 0

-- ⚠️ 重要提示：如果以上任何检查返回 orphan_count > 0，请先清理孤儿记录再继续！
-- ⚠️ 如果所有检查都返回 orphan_count = 0，说明数据一致性良好，可以继续执行第二步

SELECT '第一步完成！如果所有检查都显示 ✅ 通过，请继续执行第二步' as message;

-- ============================================================
-- 第二步：备份当前数据（强烈建议执行）
-- ============================================================
-- 目的：防止数据丢失，提供回滚能力

SELECT '=== 第二步：备份当前数据 ===' as step;

-- 2.1 备份sys_user表
CREATE TABLE sys_user_backup_20260325 AS SELECT * FROM sys_user;

-- 2.2 备份sys_user_token表
CREATE TABLE sys_user_token_backup_20260325 AS SELECT * FROM sys_user_token;

-- 2.3 备份mbti_user_answer表
CREATE TABLE mbti_user_answer_backup_20260325 AS SELECT * FROM mbti_user_answer;

-- 2.4 备份user_report_archive表
CREATE TABLE user_report_archive_backup_20260325 AS SELECT * FROM user_report_archive;

-- 验证备份是否成功
SELECT
    '备份验证' as check_name,
    (SELECT COUNT(*) FROM sys_user) as user_count,
    (SELECT COUNT(*) FROM sys_user_backup_20260325) as user_backup_count,
    (SELECT COUNT(*) FROM sys_user_token) as token_count,
    (SELECT COUNT(*) FROM sys_user_token_backup_20260325) as token_backup_count,
    CASE
        WHEN (SELECT COUNT(*) FROM sys_user) = (SELECT COUNT(*) FROM sys_user_backup_20260325)
         AND (SELECT COUNT(*) FROM sys_user_token) = (SELECT COUNT(*) FROM sys_user_token_backup_20260325)
        THEN '✅ 备份成功'
        ELSE '❌ 备份失败'
    END as status;
-- 预期：原表和备份表的记录数相同

SELECT '第二步完成！备份表已创建，请继续执行第三步' as message;

-- ============================================================
-- 第三步：删除僵尸表（5张未使用的表）
-- ============================================================
-- 目的：清理无用表，简化数据库结构

SELECT '=== 第三步：删除僵尸表 ===' as step;

-- 3.1 删除user_capability_profile表
DROP TABLE IF EXISTS user_capability_profile;
SELECT '✅ user_capability_profile表已删除' as message;

-- 3.2 删除user_deep_assessment表
DROP TABLE IF EXISTS user_deep_assessment;
SELECT '✅ user_deep_assessment表已删除' as message;

-- 3.3 删除user_path_plan表
DROP TABLE IF EXISTS user_path_plan;
SELECT '✅ user_path_plan表已删除' as message;

-- 3.4 删除user_profile表
DROP TABLE IF EXISTS user_profile;
SELECT '✅ user_profile表已删除' as message;

-- 3.5 删除user_target_job表
DROP TABLE IF EXISTS user_target_job;
SELECT '✅ user_target_job表已删除' as message;

-- 验证删除结果
SELECT
    TABLE_NAME,
    '僵尸表检查' as check_type
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'career_db'
  AND TABLE_NAME IN (
    'user_capability_profile',
    'user_deep_assessment',
    'user_path_plan',
    'user_profile',
    'user_target_job'
  );
-- 预期：返回0行，说明所有僵尸表已删除

-- 验证保留的user_开头的表
SELECT
    TABLE_NAME,
    TABLE_COMMENT,
    '保留的user_表' as check_type
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'career_db'
  AND TABLE_NAME LIKE 'user_%'
ORDER BY TABLE_NAME;
-- 预期：只剩下 user_report_archive

SELECT '第三步完成！5张僵尸表已删除，请继续执行第四步' as message;

-- ============================================================
-- 第四步：表重命名（sys_user → user, sys_user_token → user_token）
-- ============================================================
-- 目的：规范表命名，去除sys_前缀

SELECT '=== 第四步：表重命名 ===' as step;

-- 4.1 重命名sys_user为user
RENAME TABLE sys_user TO user;
SELECT '✅ sys_user已重命名为user' as message;

-- 4.2 重命名sys_user_token为user_token
RENAME TABLE sys_user_token TO user_token;
SELECT '✅ sys_user_token已重命名为user_token' as message;

-- 验证重命名结果
SELECT
    TABLE_NAME,
    TABLE_COMMENT,
    TABLE_ROWS,
    '重命名后的表' as check_type
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'career_db'
  AND TABLE_NAME IN ('user', 'user_token')
ORDER BY TABLE_NAME;
-- 预期：看到 user 和 user_token 两张表

-- 验证旧表名是否还存在
SELECT
    TABLE_NAME,
    '旧表名检查' as check_type
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'career_db'
  AND TABLE_NAME IN ('sys_user', 'sys_user_token');
-- 预期：返回0行，说明旧表名已不存在

SELECT '第四步完成！表重命名成功' as message;

-- ============================================================
-- 步骤1-4执行完成总结
-- ============================================================

SELECT '=== 步骤1-4执行完成总结 ===' as step;

-- 最终验证：检查当前保留的表
SELECT
    TABLE_NAME,
    TABLE_COMMENT,
    TABLE_ROWS,
    ROUND(DATA_LENGTH/1024/1024, 2) as size_mb
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'career_db'
ORDER BY TABLE_NAME;
-- 预期：看到9张表（user, user_token, user_report_archive, mbti_*, t_2025_multi_area_job_info）

-- 统计信息
SELECT
    '执行完成统计' as summary_type,
    (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'career_db') as total_tables,
    (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'career_db' AND TABLE_NAME LIKE '%backup%') as backup_tables,
    '步骤1-4已完成' as status;

SELECT '
✅ 步骤1-4执行完成！

已完成的操作：
1. ✅ 数据一致性检查 - 确认无孤儿记录
2. ✅ 数据备份 - 创建4张备份表
3. ✅ 删除僵尸表 - 删除5张无用表
4. ✅ 表重命名 - sys_user → user, sys_user_token → user_token

下一步操作：
- 如果需要继续执行步骤5-10，请使用完整的 refactor_plan_b_execution.sql
- 如果需要修改代码，请参考 MAPPER_REFERENCE_CHECK.md
- 如果需要验证功能，请参考 FULL_CHAIN_VERIFICATION_CHECKLIST.md

⚠️ 重要提示：
- 备份表已创建，可以随时回滚
- 代码中的Mapper还未修改，需要手动修改后才能启动应用
- 建议先修改Mapper，再重启应用进行测试
' as next_steps;

-- ============================================================
-- 脚本结束
-- ============================================================
