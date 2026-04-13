package com.accidentreport.dto;

import com.accidentreport.model.AttachmentType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class MediaAttachmentRequest {

    @NotBlank(message = "media url is required")
    @Pattern(regexp = "^https://.+", message = "media url must use https")
    @Size(max = 1000, message = "media url must be at most 1000 characters")
    private String url;

    @NotNull(message = "media type is required")
    private AttachmentType type;

    @Size(max = 180, message = "media name must be at most 180 characters")
    private String name;

    @Pattern(regexp = "^(?i)(cloudinary|firebase|other)$", message = "provider must be cloudinary, firebase, or other")
    private String provider;

    @Max(value = 26214400, message = "media size cannot exceed 25 MB")
    private Long bytes;

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public AttachmentType getType() {
        return type;
    }

    public void setType(AttachmentType type) {
        this.type = type;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public Long getBytes() {
        return bytes;
    }

    public void setBytes(Long bytes) {
        this.bytes = bytes;
    }
}
