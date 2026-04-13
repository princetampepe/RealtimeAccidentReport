package com.accidentreport.model;

public class MediaAttachment {
    private String url;
    private AttachmentType type;
    private String name;
    private String provider;
    private Long bytes;

    public MediaAttachment() {
    }

    public MediaAttachment(String url, AttachmentType type, String name, String provider, Long bytes) {
        this.url = url;
        this.type = type;
        this.name = name;
        this.provider = provider;
        this.bytes = bytes;
    }

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
