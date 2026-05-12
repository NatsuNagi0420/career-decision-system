/**
 * 文件说明：Web MVC 配置类。
 * 职责：配置静态资源映射（如 /images/**）以及注册登录鉴权拦截器等 Web 相关组件。
 */
package com.example.ba.config;

import org.springframework.beans.factory.annotation.Autowired;
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
    private AuthInterceptor authInterceptor;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 1. 映射内置静态资源（系统默认头像、图标等）
        //    这些资源打包在JAR中，通过classpath访问
        registry.addResourceHandler("/profile/**")
                .addResourceLocations("classpath:/static/profile/");

        // 2. 映射用户上传资源（用户头像、简历等）
        //    这些资源存储在外部目录
        //    开发环境：相对路径 file:uploads/images/
        //    生产环境：通过环境变量指定绝对路径（Task 4会实现）
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:uploads/images/");
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/path-plan/**", "/api/capability/**", "/api/user/info", "/api/resume/**", "/api/report/**");
    }
}
