package com.careerdecision.backend.profile;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import com.careerdecision.backend.user.UserInfo;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Sql(statements = "DELETE FROM user_profiles")
class UserProfileControllerTest {
    private static final String AUTHORIZATION = "Bearer test-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserProfileService profileService;

    @Test
    void profileRequiresAuthorization() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/profile"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code", is(401)));
    }

    @Test
    void emptyProfileReturnsCurrentUserDefault() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code", is(0)))
                .andExpect(jsonPath("$.data.userId", is(1)))
                .andExpect(jsonPath("$.data.displayName", is("alice")))
                .andExpect(jsonPath("$.data.skills", hasSize(0)))
                .andExpect(jsonPath("$.data.completed", is(false)));
    }

    @Test
    void profileCanBeSavedAndUpdated() throws Exception {
        mockMvc.perform(put("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": " Alice Dev ",
                                  "identityType": "student",
                                  "school": "示例大学",
                                  "major": "计算机科学与技术",
                                  "degree": "本科",
                                  "targetRole": "AI 应用工程师",
                                  "targetCities": ["杭州", "上海", "杭州"],
                                  "expectedSalary": "15k-25k",
                                  "skills": ["Java", "Python", "Java"],
                                  "certificates": ["CET-6"],
                                  "experiences": ["AI 职业规划系统"],
                                  "values": ["成长空间", "技术深度"]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayName", is("Alice Dev")))
                .andExpect(jsonPath("$.data.targetRole", is("AI 应用工程师")))
                .andExpect(jsonPath("$.data.targetCities", hasSize(2)))
                .andExpect(jsonPath("$.data.skills", hasSize(2)))
                .andExpect(jsonPath("$.data.skills", hasItem("Python")))
                .andExpect(jsonPath("$.data.completed", is(true)));

        mockMvc.perform(put("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Alice Product",
                                  "expectedVersion": 1,
                                  "targetRole": "数据产品经理",
                                  "targetCities": ["深圳"],
                                  "skills": ["SQL", "用户研究"]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayName", is("Alice Product")))
                .andExpect(jsonPath("$.data.targetRole", is("数据产品经理")))
                .andExpect(jsonPath("$.data.targetCities[0]", is("深圳")))
                .andExpect(jsonPath("$.data.skills", hasSize(2)))
                .andExpect(jsonPath("$.data.profileVersion", is(2)));

        mockMvc.perform(get("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayName", is("Alice Product")))
                .andExpect(jsonPath("$.data.targetRole", is("数据产品经理")))
                .andExpect(jsonPath("$.data.skills", hasItem("SQL")));
    }

    @Test
    void staleProfileVersionIsRejectedInsteadOfSilentlyOverwriting() throws Exception {
        mockMvc.perform(put("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"第一设备\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.profileVersion", is(1)));

        mockMvc.perform(put("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"第二设备的新版本\",\"expectedVersion\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.profileVersion", is(2)));

        mockMvc.perform(put("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"第一设备的旧草稿\",\"expectedVersion\":1}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is(40930)));

        mockMvc.perform(get("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.displayName", is("第二设备的新版本")))
                .andExpect(jsonPath("$.data.profileVersion", is(2)));
    }

    @Test
    void profileUsesTokenUserAndDoesNotExposeOrOverwriteOtherUsersProfile() throws Exception {
        UserInfo bob = new UserInfo(2L, "bob", "bob@example.com", "18800000002");
        profileService.save(bob, new UserProfileRequest(
                "Bob Private Profile",
                "worker",
                "Bob University",
                "Data Science",
                "Bachelor",
                "Data Analyst",
                List.of("Beijing"),
                "20k-30k",
                List.of("Python", "SQL"),
                List.of(),
                List.of("Private project"),
                List.of("Stability")
        ));

        mockMvc.perform(get("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .param("userId", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userId", is(1)))
                .andExpect(jsonPath("$.data.displayName", is("alice")))
                .andExpect(jsonPath("$.data.targetRole").doesNotExist());

        mockMvc.perform(put("/api/v1/users/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Alice Token Profile",
                                  "targetRole": "AI Application Engineer",
                                  "targetCities": ["Shanghai"],
                                  "skills": ["Java"]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userId", is(1)))
                .andExpect(jsonPath("$.data.displayName", is("Alice Token Profile")));

        UserProfileResponse bobProfile = profileService.get(bob);
        assertThat(bobProfile.displayName()).isEqualTo("Bob Private Profile");
        assertThat(bobProfile.targetRole()).isEqualTo("Data Analyst");
        assertThat(bobProfile.skills()).containsExactly("Python", "SQL");
    }
}
