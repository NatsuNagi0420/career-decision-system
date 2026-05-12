# 生产环境部署说明

## 静态资源配置

### 目录结构
生产环境建议使用以下目录结构：
```
/var/www/career-system/
├── app/
│   └── career-system.jar
├── uploads/
│   └── images/
└── config/
    └── application-prod.properties
```

### 环境变量配置
启动应用时设置以下环境变量：

```bash
export STATIC_UPLOADS_PATH=file:/var/www/career-system/uploads/images/
export SPRING_PROFILES_ACTIVE=prod
```

### 启动命令
```bash
java -jar /var/www/career-system/app/career-system.jar \
  --spring.config.location=/var/www/career-system/config/application-prod.properties
```

### Nginx 配置（可选）
如果使用 Nginx 作为反向代理，可以直接由 Nginx 提供静态资源服务：

```nginx
location /uploads/ {
    alias /var/www/career-system/uploads/images/;
}

location /profile/ {
    proxy_pass http://localhost:8080/profile/;
}
```

### 权限配置
确保应用有权限读写上传目录：

```bash
sudo chown -R app-user:app-group /var/www/career-system/uploads/
sudo chmod -R 755 /var/www/career-system/uploads/
```

### 备份建议
用户上传的资源应该定期备份：

```bash
# 每日备份脚本示例
tar -czf /backup/uploads-$(date +%Y%m%d).tar.gz /var/www/career-system/uploads/
```
