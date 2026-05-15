# 数据库重构步骤1-4执行指南

## 📋 执行前准备

### 1. 停止应用服务
确保后端服务已停止，避免数据冲突。

### 2. 打开MySQL客户端
使用以下任一工具：
- Navicat
- MySQL Workbench
- phpMyAdmin
- 或其他MySQL客户端

### 3. 连接到数据库
- 主机：localhost
- 端口：3306
- 用户：root
- 密码：123456
- 数据库：career_db

---

## 🚀 执行步骤

### 方式一：使用SQL脚本文件（推荐）

1. 打开文件：`backend/ba/sql/refactor_step_1_to_4.sql`
2. 在MySQL客户端中执行整个脚本
3. 查看执行结果，确认每一步都显示 ✅

### 方式二：逐步手动执行

#### 步骤1：数据一致性检查

```sql
USE career_db;

-- 检查user_token孤儿记录
SELECT COUNT(*) as orphan_count FROM sys_user_token ut
LEFT JOIN sys_user u ON ut.user_id = u.id
WHERE u.id IS NULL;
-- 预期结果：0

-- 检查mbti_user_answer孤儿记录（关联user）
SELECT COUNT(*) as orphan_count FROM mbti_user_answer mua
LEFT JOIN sys_user u ON mua.user_id = u.id
WHERE u.id IS NULL;
-- 预期结果：0

-- 检查mbti_user_answer孤儿记录（关联question）
SELECT COUNT(*) as orphan_count FROM mbti_user_answer mua
LEFT JOIN mbti_question mq ON mua.q_id = mq.id
WHERE mq.id IS NULL;
-- 预期结果：0

-- 检查mbti_option孤儿记录
SELECT COUNT(*) as orphan_count FROM mbti_option mo
LEFT JOIN mbti_question mq ON mo.q_id = mq.id
WHERE mq.id IS NULL;
-- 预期结果：0

-- 检查user_report_archive孤儿记录
SELECT COUNT(*) as orphan_count FROM user_report_archive ura
LEFT JOIN sys_user u ON ura.user_id = u.id
WHERE u.id IS NULL;
-- 预期结果：0
```

✅ **验证点**：所有查询结果都应该是 0

---

#### 步骤2：备份当前数据

```sql
-- 备份sys_user表
CREATE TABLE sys_user_backup_20260325 AS SELECT * FROM sys_user;

-- 备份sys_user_token表
CREATE TABLE sys_user_token_backup_20260325 AS SELECT * FROM sys_user_token;

-- 备份mbti_user_answer表
CREATE TABLE mbti_user_answer_backup_20260325 AS SELECT * FROM mbti_user_answer;

-- 备份user_report_archive表
CREATE TABLE user_report_archive_backup_20260325 AS SELECT * FROM user_report_archive;

-- 验证备份
SELECT
    (SELECT COUNT(*) FROM sys_user) as user_count,
    (SELECT COUNT(*) FROM sys_user_backup_20260325) as user_backup_count,
    (SELECT COUNT(*) FROM sys_user_token) as token_count,
    (SELECT COUNT(*) FROM sys_user_token_backup_20260325) as token_backup_count;
```

✅ **验证点**：原表和备份表的记录数应该相同

---

#### 步骤3：删除僵尸表

```sql
-- 删除5张僵尸表
DROP TABLE IF EXISTS user_capability_profile;
DROP TABLE IF EXISTS user_deep_assessment;
DROP TABLE IF EXISTS user_path_plan;
DROP TABLE IF EXISTS user_profile;
DROP TABLE IF EXISTS user_target_job;

-- 验证删除结果
SHOW TABLES LIKE 'user_%';
```

✅ **验证点**：只应该看到 `user_report_archive` 一张表

---

#### 步骤4：表重命名

```sql
-- 重命名表
RENAME TABLE sys_user TO user;
RENAME TABLE sys_user_token TO user_token;

-- 验证重命名结果
SHOW TABLES;
```

✅ **验证点**：
- 应该看到 `user` 和 `user_token` 表
- 不应该再看到 `sys_user` 和 `sys_user_token` 表

---

## ✅ 执行完成验证

执行以下SQL验证最终结果：

```sql
-- 查看所有表
SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'career_db'
ORDER BY TABLE_NAME;
```

**预期结果**：应该看到以下9张表（加上4张备份表）

### 保留的9张表：
1. ✅ user（原sys_user）
2. ✅ user_token（原sys_user_token）
3. ✅ user_report_archive
4. ✅ mbti_question
5. ✅ mbti_option
6. ✅ mbti_dimension
7. ✅ mbti_personality
8. ✅ mbti_user_answer
9. ✅ t_2025_multi_area_job_info

### 备份表（4张）：
1. sys_user_backup_20260325
2. sys_user_token_backup_20260325
3. mbti_user_answer_backup_20260325
4. user_report_archive_backup_20260325

---

## 🔄 如果需要回滚

如果执行过程中出现问题，可以使用以下SQL回滚：

```sql
-- 重命名回原表名
RENAME TABLE user TO sys_user;
RENAME TABLE user_token TO sys_user_token;

-- 恢复数据（如果需要）
TRUNCATE TABLE sys_user;
INSERT INTO sys_user SELECT * FROM sys_user_backup_20260325;

TRUNCATE TABLE sys_user_token;
INSERT INTO sys_user_token SELECT * FROM sys_user_token_backup_20260325;
```

---

## 📝 执行后检查清单

- [ ] 步骤1：数据一致性检查通过（所有孤儿记录为0）
- [ ] 步骤2：备份表创建成功（4张备份表）
- [ ] 步骤3：僵尸表删除成功（5张表已删除）
- [ ] 步骤4：表重命名成功（user和user_token存在）
- [ ] 最终验证：数据库有9张保留表 + 4张备份表

---

## ⚠️ 重要提示

### 步骤1-4完成后，应用还不能启动！

原因：代码中的Mapper还在使用旧表名（sys_user、sys_user_token）

### 下一步必须操作：

1. **修改UserMapper.java**（4处表名）
2. **修改UserTokenMapper.java**（2处表名）
3. **重启后端服务**
4. **执行功能测试**

详细修改说明请参考：[MAPPER_REFERENCE_CHECK.md](../../MAPPER_REFERENCE_CHECK.md)

---

## 📞 遇到问题？

如果执行过程中遇到任何问题：

1. **不要慌张**：备份表已创建，可以随时回滚
2. **检查错误信息**：记录具体的错误提示
3. **停止执行**：不要继续执行后续步骤
4. **寻求帮助**：提供错误信息和执行到哪一步

---

**祝执行顺利！** 🎉
