package com.accidentreport.model;

import java.time.LocalDateTime;

public class User {
    private String uid;
    private String email;
    private String displayName;
    private String photoUrl;
    private String role; // USER, RESPONDER, ADMIN
    private Boolean verified;
    private LocalDateTime createdAt;
    private LocalDateTime lastLogin;

    // Constructors
    public User() {}

    public User(String uid, String email, String displayName, String photoUrl, String role,
                Boolean verified, LocalDateTime createdAt, LocalDateTime lastLogin) {
        this.uid = uid;
        this.email = email;
        this.displayName = displayName;
        this.photoUrl = photoUrl;
        this.role = role;
        this.verified = verified;
        this.createdAt = createdAt;
        this.lastLogin = lastLogin;
    }

    // Getters
    public String getUid() { return uid; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getPhotoUrl() { return photoUrl; }
    public String getRole() { return role; }
    public Boolean getVerified() { return verified; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getLastLogin() { return lastLogin; }

    // Setters
    public void setUid(String uid) { this.uid = uid; }
    public void setEmail(String email) { this.email = email; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public void setPhotoUrl(String photoUrl) { this.photoUrl = photoUrl; }
    public void setRole(String role) { this.role = role; }
    public void setVerified(Boolean verified) { this.verified = verified; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public void setLastLogin(LocalDateTime lastLogin) { this.lastLogin = lastLogin; }
}
