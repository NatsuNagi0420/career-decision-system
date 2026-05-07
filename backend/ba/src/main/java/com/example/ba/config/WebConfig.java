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
        // 映射逻辑：请求 /images/** -> 映射到 d:\Project\服创\server\images\ 目录
        // 为了项目的可移植性，这里使用相对路径映射 (相对于后端项目根目录 d:\Project\服创\backend\ba)
        // ../../server/images/ 即可指向 d:\Project\服创\server\images\
        registry.addResourceHandler("/images/**")
                .addResourceLocations("file:../../server/images/");
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/path-plan/**", "/api/capability/**", "/api/user/info", "/api/resume/**", "/api/report/**");
    }
}
