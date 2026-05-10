/**
 * 文件说明：职业规划平台后端应用启动类。
 * 职责：作为 Spring Boot 入口，启动整套后端服务。
 */
package com.example.ba;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class BaApplication {

	public static void main(String[] args) {
		SpringApplication.run(BaApplication.class, args);
	}

}
