/**
 * 文件说明：Web MVC 配置类。
 * 职责：配置静态资源映射（如 /images/**）以及注册登录鉴权拦截器等 Web 相关组件。
 */
package com.example.ba.config;

import com.example.ba.interceptor.LoggingInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 静态资源映射配置
 * 将前端请求的相对路径 (如 /images/**) 映射到本地物理路径
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Autowired
    private LoggingInterceptor loggingInterceptor;

    @Autowired
    private AuthInterceptor authInterceptor;

    /**
     * 用户上传资源路径（从配置文件读取，支持环境变量覆盖）
     */
    @Value("${static.uploads.path:file:./uploads/images/}")
    private String uploadsPath;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 1. 映射内置静态资源（系统默认头像、图标等）
        //    这些资源打包在JAR中，通过classpath访问
        registry.addResourceHandler("/profile/**")
                .addResourceLocations("classpath:/static/profile/");

        // 2. 映射用户上传资源（用户头像、简历等）
        //    这些资源存储在外部目录，路径可通过配置文件或环境变量指定
        //    开发环境：file:./uploads/images/
        //    生产环境：通过环境变量 STATIC_UPLOADS_PATH 指定绝对路径
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(uploadsPath);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 日志拦截器（拦截所有请求，记录请求信息和性能数据）
        registry.addInterceptor(loggingInterceptor)
                .addPathPatterns("/**");

        // 认证拦截器（仅拦截需要认证的接口）
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/path-plan/**", "/api/capability/**", "/api/user/info", "/api/resume/**", "/api/report/**");
    }
}
