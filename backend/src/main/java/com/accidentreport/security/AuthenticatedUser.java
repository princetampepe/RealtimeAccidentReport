package com.accidentreport.security;

public class AuthenticatedUser {
    private final String uid;
    private final String email;
    private final boolean admin;

    public AuthenticatedUser(String uid, String email, boolean admin) {
        this.uid = uid;
        this.email = email;
        this.admin = admin;
    }

    public String getUid() {
        return uid;
    }

    public String getEmail() {
        return email;
    }

    public boolean isAdmin() {
        return admin;
    }
}
