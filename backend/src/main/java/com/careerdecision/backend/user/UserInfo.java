package com.careerdecision.backend.user;

public record UserInfo(
        long id,
        String username,
        String email,
        String phone
) {
    public static UserInfo from(UserAccount account) {
        return new UserInfo(account.id(), account.username(), account.email(), account.phone());
    }

    public static UserInfo from(UserRecord record) {
        return new UserInfo(record.getId(), record.getUsername(), record.getEmail(), record.getPhone());
    }
}
