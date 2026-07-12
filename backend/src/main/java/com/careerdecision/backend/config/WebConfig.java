package com.careerdecision.backend.config;

import com.careerdecision.backend.common.TraceIdFilter;
import com.careerdecision.backend.user.CurrentUserArgumentResolver;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final DataServerProperties dataServerProperties;
    private final CorsProperties corsProperties;
    private final CurrentUserArgumentResolver currentUserArgumentResolver;

    public WebConfig(
            DataServerProperties dataServerProperties,
            CorsProperties corsProperties,
            CurrentUserArgumentResolver currentUserArgumentResolver
    ) {
        this.dataServerProperties = dataServerProperties;
        this.corsProperties = corsProperties;
        this.currentUserArgumentResolver = currentUserArgumentResolver;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String[] allowedOrigins = corsProperties.allowedOriginsArray();
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders(TraceIdFilter.TRACE_ID_HEADER)
                .allowCredentials(true);
        registry.addMapping(dataServerProperties.normalizedPublicPath() + "/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "OPTIONS")
                .allowedHeaders("*");
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserArgumentResolver);
    }
}
