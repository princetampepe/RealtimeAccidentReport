package com.accidentreport.model;

import java.time.LocalDateTime;
import java.util.List;

public class Accident {
    private String id;
    private String reporterId;
    private String reporterEmail;
    private String dispatchId;
    private String title;
    private String description;
    private String address;
    private Double latitude;
    private Double longitude;
    private AccidentSeverity severity;
    private AccidentStatus status;
    private String locationSource;
    private Integer locationAccuracyMeters;
    private Integer incidentRadiusMeters;
    private String googleMapsUrl;
    private List<MediaAttachment> mediaAttachments;
    private LocalDateTime reportedAt;
    private LocalDateTime updatedAt;
    private Integer responseCount;

    public Accident() {}

    public Accident(String id,
                    String reporterId,
                    String reporterEmail,
                    String dispatchId,
                    String title,
                    String description,
                    String address,
                    Double latitude,
                    Double longitude,
                    AccidentSeverity severity,
                    AccidentStatus status,
                    String locationSource,
                    Integer locationAccuracyMeters,
                    Integer incidentRadiusMeters,
                    String googleMapsUrl,
                    List<MediaAttachment> mediaAttachments,
                    LocalDateTime reportedAt, LocalDateTime updatedAt, Integer responseCount) {
        this.id = id;
        this.reporterId = reporterId;
        this.reporterEmail = reporterEmail;
        this.dispatchId = dispatchId;
        this.title = title;
        this.description = description;
        this.address = address;
        this.latitude = latitude;
        this.longitude = longitude;
        this.severity = severity;
        this.status = status;
        this.locationSource = locationSource;
        this.locationAccuracyMeters = locationAccuracyMeters;
        this.incidentRadiusMeters = incidentRadiusMeters;
        this.googleMapsUrl = googleMapsUrl;
        this.mediaAttachments = mediaAttachments;
        this.reportedAt = reportedAt;
        this.updatedAt = updatedAt;
        this.responseCount = responseCount;
    }

    public String getId() { return id; }
    public String getReporterId() { return reporterId; }
    public String getReporterEmail() { return reporterEmail; }
    public String getDispatchId() { return dispatchId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getAddress() { return address; }
    public Double getLatitude() { return latitude; }
    public Double getLongitude() { return longitude; }
    public AccidentSeverity getSeverity() { return severity; }
    public AccidentStatus getStatus() { return status; }
    public String getLocationSource() { return locationSource; }
    public Integer getLocationAccuracyMeters() { return locationAccuracyMeters; }
    public Integer getIncidentRadiusMeters() { return incidentRadiusMeters; }
    public String getGoogleMapsUrl() { return googleMapsUrl; }
    public List<MediaAttachment> getMediaAttachments() { return mediaAttachments; }
    public LocalDateTime getReportedAt() { return reportedAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public Integer getResponseCount() { return responseCount; }

    public void setId(String id) { this.id = id; }
    public void setReporterId(String reporterId) { this.reporterId = reporterId; }
    public void setReporterEmail(String reporterEmail) { this.reporterEmail = reporterEmail; }
    public void setDispatchId(String dispatchId) { this.dispatchId = dispatchId; }
    public void setTitle(String title) { this.title = title; }
    public void setDescription(String description) { this.description = description; }
    public void setAddress(String address) { this.address = address; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public void setSeverity(AccidentSeverity severity) { this.severity = severity; }
    public void setStatus(AccidentStatus status) { this.status = status; }
    public void setLocationSource(String locationSource) { this.locationSource = locationSource; }
    public void setLocationAccuracyMeters(Integer locationAccuracyMeters) { this.locationAccuracyMeters = locationAccuracyMeters; }
    public void setIncidentRadiusMeters(Integer incidentRadiusMeters) { this.incidentRadiusMeters = incidentRadiusMeters; }
    public void setGoogleMapsUrl(String googleMapsUrl) { this.googleMapsUrl = googleMapsUrl; }
    public void setMediaAttachments(List<MediaAttachment> mediaAttachments) { this.mediaAttachments = mediaAttachments; }
    public void setReportedAt(LocalDateTime reportedAt) { this.reportedAt = reportedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public void setResponseCount(Integer responseCount) { this.responseCount = responseCount; }
}
