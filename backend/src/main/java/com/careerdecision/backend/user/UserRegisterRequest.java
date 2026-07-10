package com.careerdecision.backend.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UserRegisterRequest(
        @NotBlank @Size(min = 3, max = 32) String username,
        @Email @Size(max = 120) String email,
        @Size(max = 30) String phone,
        @NotBlank @Size(min = 6, max = 64) String password,
        @NotBlank @Size(min = 6, max = 64) String confirmPassword
) {
}
