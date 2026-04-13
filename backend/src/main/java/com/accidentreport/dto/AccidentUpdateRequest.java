package com.accidentreport.dto;

import com.accidentreport.model.AccidentSeverity;
import com.accidentreport.model.AccidentStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public class AccidentUpdateRequest {

    @Size(min = 3, max = 120, message = "title must be 3 to 120 characters")
    private String title;

    @Size(min = 8, max = 2000, message = "description must be 8 to 2000 characters")
    private String description;

    @Size(max = 240, message = "address must be at most 240 characters")
    private String address;

    @DecimalMin(value = "-90.0", message = "latitude must be >= -90")
    @DecimalMax(value = "90.0", message = "latitude must be <= 90")
    private Double latitude;

    @DecimalMin(value = "-180.0", message = "longitude must be >= -180")
    @DecimalMax(value = "180.0", message = "longitude must be <= 180")
    private Double longitude;

    private AccidentSeverity severity;

    private AccidentStatus status;

    @Pattern(regexp = "^(?i)(gps|map-click|maps-link|manual)$", message = "locationSource must be gps, map-click, maps-link, or manual")
    private String locationSource;

    @Min(value = 1, message = "locationAccuracyMeters must be at least 1")
    @Max(value = 5000, message = "locationAccuracyMeters cannot exceed 5000")
    private Integer locationAccuracyMeters;

    @Min(value = 10, message = "incidentRadiusMeters must be at least 10")
    @Max(value = 5000, message = "incidentRadiusMeters cannot exceed 5000")
    private Integer incidentRadiusMeters;

    @Pattern(regexp = "^$|^https://(www\\.)?google\\.[^\\s]+/maps.*", message = "googleMapsUrl must be a valid Google Maps URL")
    @Size(max = 1000, message = "googleMapsUrl must be at most 1000 characters")
    private String googleMapsUrl;

    @Valid
    @Size(max = 6, message = "mediaAttachments can include up to 6 files")
    private List<MediaAttachmentRequest> mediaAttachments;

    @AssertTrue(message = "latitude and longitude must be provided together")
    public boolean isCoordinatePairValid() {
        return (latitude == null && longitude == null) || (latitude != null && longitude != null);
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public Double getLatitude() {
        return latitude;
    }

    public void setLatitude(Double latitude) {
        this.latitude = latitude;
    }

    public Double getLongitude() {
        return longitude;
    }

    public void setLongitude(Double longitude) {
        this.longitude = longitude;
    }

    public AccidentSeverity getSeverity() {
        return severity;
    }

    public void setSeverity(AccidentSeverity severity) {
        this.severity = severity;
    }

    public AccidentStatus getStatus() {
        return status;
    }

    public void setStatus(AccidentStatus status) {
        this.status = status;
    }

    public String getLocationSource() {
        return locationSource;
    }

    public void setLocationSource(String locationSource) {
        this.locationSource = locationSource;
    }

    public Integer getLocationAccuracyMeters() {
        return locationAccuracyMeters;
    }

    public void setLocationAccuracyMeters(Integer locationAccuracyMeters) {
        this.locationAccuracyMeters = locationAccuracyMeters;
    }

    public Integer getIncidentRadiusMeters() {
        return incidentRadiusMeters;
    }

    public void setIncidentRadiusMeters(Integer incidentRadiusMeters) {
        this.incidentRadiusMeters = incidentRadiusMeters;
    }

    public String getGoogleMapsUrl() {
        return googleMapsUrl;
    }

    public void setGoogleMapsUrl(String googleMapsUrl) {
        this.googleMapsUrl = googleMapsUrl;
    }

    public List<MediaAttachmentRequest> getMediaAttachments() {
        return mediaAttachments;
    }

    public void setMediaAttachments(List<MediaAttachmentRequest> mediaAttachments) {
        this.mediaAttachments = mediaAttachments;
    }
}
