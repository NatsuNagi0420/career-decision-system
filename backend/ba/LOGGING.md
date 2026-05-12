# 日志使用规范

## 日志级别

### DEBUG
- 用途：详细的调试信息，仅在开发环境启用
- 示例：方法参数、中间变量、详细的执行流程

### INFO
- 用途：重要的业务流程信息，生产环境默认级别
- 示例：用户登录、订单创建、支付成功、任务完成

### WARN
- 用途：潜在问题或异常情况，需要关注但不影响主流程
- 示例：用户不存在、参数校验失败、慢请求、重试操作

### ERROR
- 用途：系统错误或异常，需要立即处理
- 示例：数据库连接失败、外部接口调用失败、未捕获的异常

## 结构化日志格式

### 请求日志
```java
log.info("请求开始: method={} uri={} ip={}", method, uri, ip);
log.info("请求完成: method={} uri={} status={} duration={}ms", method, uri, status, duration);
```

### 业务日志
```java
log.info("用户登录: userId={} username={}", userId, username);
log.info("订单创建: orderId={} userId={} amount={}", orderId, userId, amount);
```

### 性能日志
```java
log.info("数据库查询: sql={} duration={}ms", sql, duration);
log.warn("慢查询: sql={} duration={}ms", sql, duration);
```

### 异常日志
```java
log.error("数据库操作失败: operation={}", operation, e);
log.error("外部接口调用失败: url={} method={}", url, method, e);
```

## MDC 上下文

系统自动为每个请求添加以下 MDC 变量：
- `requestId`: 请求唯一标识
- `userId`: 当前登录用户ID

在日志中使用：
```
%X{requestId} %X{userId}
```

## 日志文件

- `career-system-info.log`: INFO 级别日志
- `career-system-error.log`: ERROR 级别日志
- `career-system-perf.log`: 性能监控日志

## 最佳实践

1. **使用占位符，不要字符串拼接**
   ```java
   // 正确
   log.info("用户登录: userId={}", userId);
   
   // 错误
   log.info("用户登录: userId=" + userId);
   ```

2. **异常日志包含堆栈信息**
   ```java
   // 正确
   log.error("操作失败", e);
   
   // 错误
   log.error("操作失败: " + e.getMessage());
   ```

3. **避免敏感信息**
   不要记录密码、token、身份证号等敏感信息

4. **关键操作必须记录**
   - 用户登录/登出
   - 数据创建/修改/删除
   - 外部接口调用
   - 支付操作
   - 权限变更

5. **性能监控**
   - 记录接口耗时
   - 记录数据库查询耗时
   - 记录外部接口调用耗时
   - 慢操作告警（超过阈值）

## 日志级别配置

在 `logback-spring.xml` 中配置：

```xml
<!-- MyBatis SQL 日志 -->
<logger name="com.example.ba.mapper" level="DEBUG"/>

<!-- 特定包的日志级别 -->
<logger name="com.example.ba.service" level="INFO"/>

<!-- Root Logger -->
<root level="INFO">
    <appender-ref ref="CONSOLE"/>
    <appender-ref ref="FILE_INFO"/>
    <appender-ref ref="FILE_ERROR"/>
</root>
```

## 性能监控日志

系统自动记录每个请求的性能数据到 `career-system-perf.log`：

```
2026-05-12 10:30:45.123 - [abc12345] [1001] method=POST uri=/api/user/login status=200 duration=125ms
```

慢请求告警（超过3秒）会同时记录到 INFO 日志：

```
2026-05-12 10:30:45.123 [http-nio-8080-exec-1] WARN  c.e.b.interceptor.LoggingInterceptor - [abc12345] [1001] 慢请求告警: POST /api/resume/parse 耗时 3500ms
```

## 日志查询示例

### 查询特定用户的操作日志
```bash
grep "\[1001\]" logs/career-system-info.log
```

### 查询特定请求的完整日志
```bash
grep "\[abc12345\]" logs/career-system-info.log
```

### 查询慢请求
```bash
grep "慢请求告警" logs/career-system-info.log
```

### 查询错误日志
```bash
tail -f logs/career-system-error.log
```

### 查询性能数据
```bash
# 查询所有请求耗时
cat logs/career-system-perf.log | grep "duration="

# 查询超过1秒的请求
cat logs/career-system-perf.log | awk -F'duration=' '{print $2}' | awk -F'ms' '{if($1>1000) print $0}'
```
