/**
 * 文件说明：登录鉴权拦截器。
 * 职责：在请求进入业务控制器前校验用户 Token，有效时将 userId 写入 AuthContext，
 *       无效或过期时以 JSON 形式返回未授权错误并中断请求。
 */
package com.example.ba.config;

import com.example.ba.mapper.UserTokenMapper;
import com.example.ba.pojo.UserToken;
import com.example.ba.utils.AuthContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Component
public class AuthInterceptor implements HandlerInterceptor {
    @Autowired
    private UserTokenMapper userTokenMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String auth = request.getHeader("Authorization");
        String token = null;
        if (auth != null) {
            String s = auth.trim();
            if (s.toLowerCase().startsWith("bearer ")) {
                token = s.substring(7).trim();
            }
        }

        if (token == null || token.isEmpty()) {
            writeUnauthorized(response);
            return false;
        }

        UserToken ut = userTokenMapper.getByToken(token);
        if (ut == null || ut.getExpireTime() == null || ut.getExpireTime().isBefore(LocalDateTime.now()) || ut.getUserId() == null) {
            writeUnauthorized(response);
            return false;
        }

        AuthContext.setUserId(ut.getUserId());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        AuthContext.clear();
    }

    private void writeUnauthorized(HttpServletResponse response) throws Exception {
        response.setStatus(200);
        response.setContentType("application/json;charset=utf-8");
        Map<String, Object> out = new HashMap<>();
        out.put("code", 401);
        out.put("msg", "未登录");
        out.put("data", null);
        response.getWriter().write(objectMapper.writeValueAsString(out));
    }
}

