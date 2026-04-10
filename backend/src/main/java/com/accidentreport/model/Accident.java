package com.accidentreport.model;

import java.time.LocalDateTime;
import java.util.List;

public class Accident {
    private String id;
    private String reporterId;
    private String title;
    private String description;
    private Double latitude;
    private Double longitude;
    private String severity; // LOW, MEDIUM, HIGH, CRITICAL
    private String status; // ACTIVE, RESOLVED, UNDER_REVIEW
    private List<String> photoUrls;
    private LocalDateTime reportedAt;
    private LocalDateTime updatedAt;
    private Integer responseCount;

    // Constructors
    public Accident() {}

    public Accident(String id, String reporterId, String title, String description, Double latitude,
                    Double longitude, String severity, String status, List<String> photoUrls,
                    LocalDateTime reportedAt, LocalDateTime updatedAt, Integer responseCount) {
        this.id = id;
        this.reporterId = reporterId;
        this.title = title;
        this.description = description;
        this.latitude = latitude;
        this.longitude = longitude;
        this.severity = severity;
        this.status = status;
        this.photoUrls = photoUrls;
        this.reportedAt = reportedAt;
        this.updatedAt = updatedAt;
        this.responseCount = responseCount;
    }

    // Getters
    public String getId() { return id; }
    public String getReporterId() { return reporterId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public Double getLatitude() { return latitude; }
    public Double getLongitude() { return longitude; }
    public String getSeverity() { return severity; }
    public String getStatus() { return status; }
    public List<String> getPhotoUrls() { return photoUrls; }
    public LocalDateTime getReportedAt() { return reportedAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public Integer getResponseCount() { return responseCount; }

    // Setters
    public void setId(String id) { this.id = id; }
    public void setReporterId(String reporterId) { this.reporterId = reporterId; }
    public void setTitle(String title) { this.title = title; }
    public void setDescription(String description) { this.description = description; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public void setSeverity(String severity) { this.severity = severity; }
    public void setStatus(String status) { this.status = status; }
    public void setPhotoUrls(List<String> photoUrls) { this.photoUrls = photoUrls; }
    public void setReportedAt(LocalDateTime reportedAt) { this.reportedAt = reportedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public void setResponseCount(Integer responseCount) { this.responseCount = responseCount; }
}
