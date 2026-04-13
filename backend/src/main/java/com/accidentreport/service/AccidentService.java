package com.accidentreport.service;

import com.accidentreport.dto.AccidentCreateRequest;
import com.accidentreport.dto.AccidentUpdateRequest;
import com.accidentreport.dto.CreateAccidentResult;
import com.accidentreport.dto.MediaAttachmentRequest;
import com.accidentreport.error.ConflictException;
import com.accidentreport.error.ForbiddenOperationException;
import com.accidentreport.error.ResourceNotFoundException;
import com.accidentreport.model.Accident;
import com.accidentreport.model.AccidentStatus;
import com.accidentreport.model.MediaAttachment;
import com.accidentreport.security.AuthenticatedUser;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class AccidentService {

    private static final double DUPLICATE_RADIUS_KM = 0.2;
    private static final int DUPLICATE_WINDOW_HOURS = 2;
    private static final int IDEMPOTENCY_TTL_HOURS = 24;

    private final Map<String, Accident> accidents = new ConcurrentHashMap<>();
    private final Map<String, IdempotencyRecord> idempotencyRecords = new ConcurrentHashMap<>();

    public CreateAccidentResult reportAccident(AccidentCreateRequest request,
                                               AuthenticatedUser user,
                                               String idempotencyKey) {
        LocalDateTime now = LocalDateTime.now();
        pruneIdempotencyRecords(now);

        String normalizedIdempotencyKey = normalizeOptionalString(idempotencyKey);
        if (StringUtils.hasText(normalizedIdempotencyKey)) {
            IdempotencyRecord previous = idempotencyRecords.get(normalizedIdempotencyKey);
            if (previous != null) {
                Accident existing = accidents.get(previous.accidentId);
                if (existing != null) {
                    return new CreateAccidentResult(existing, false);
                }
                idempotencyRecords.remove(normalizedIdempotencyKey);
            }
        }

        if (!request.isForceDuplicate() && hasPotentialDuplicate(request, now)) {
            throw new ConflictException("Potential duplicate report detected nearby in the last 2 hours. If this is distinct, resend with forceDuplicate=true.");
        }

        Accident accident = new Accident();
        accident.setId(UUID.randomUUID().toString());
        accident.setReporterId(user != null ? user.getUid() : "anonymous");
        accident.setReporterEmail(user != null ? user.getEmail() : null);
        accident.setDispatchId(normalizeOptionalString(request.getDispatchId()));
        accident.setTitle(request.getTitle().trim());
        accident.setDescription(request.getDescription().trim());
        accident.setAddress(request.getAddress().trim());
        accident.setLatitude(request.getLatitude());
        accident.setLongitude(request.getLongitude());
        accident.setSeverity(request.getSeverity());
        accident.setStatus(AccidentStatus.ACTIVE);
        accident.setLocationSource(normalizeOptionalString(request.getLocationSource()));
        accident.setLocationAccuracyMeters(request.getLocationAccuracyMeters());
        accident.setIncidentRadiusMeters(request.getIncidentRadiusMeters());
        accident.setGoogleMapsUrl(normalizeOptionalString(request.getGoogleMapsUrl()));
        accident.setMediaAttachments(mapMedia(request.getMediaAttachments()));
        accident.setReportedAt(now);
        accident.setUpdatedAt(now);
        accident.setResponseCount(0);

        accidents.put(accident.getId(), accident);

        if (StringUtils.hasText(normalizedIdempotencyKey)) {
            idempotencyRecords.put(normalizedIdempotencyKey, new IdempotencyRecord(accident.getId(), now));
        }

        return new CreateAccidentResult(accident, true);
    }

    public List<Accident> getAllAccidents() {
        List<Accident> all = new ArrayList<>(accidents.values());
        all.sort(Comparator.comparing(Accident::getReportedAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return all;
    }

    public Accident getAccidentById(String id) {
        return accidents.get(id);
    }

    public Accident updateAccident(String id, AccidentUpdateRequest request, AuthenticatedUser user) {
        Accident existing = getByIdOrThrow(id);
        ensureCanModify(existing, user);

        if (request.getTitle() != null) {
            existing.setTitle(request.getTitle().trim());
        }
        if (request.getDescription() != null) {
            existing.setDescription(request.getDescription().trim());
        }
        if (request.getAddress() != null) {
            existing.setAddress(request.getAddress().trim());
        }
        if (request.getLatitude() != null && request.getLongitude() != null) {
            existing.setLatitude(request.getLatitude());
            existing.setLongitude(request.getLongitude());
        }
        if (request.getSeverity() != null) {
            existing.setSeverity(request.getSeverity());
        }
        if (request.getStatus() != null) {
            existing.setStatus(request.getStatus());
        }
        if (request.getLocationSource() != null) {
            existing.setLocationSource(normalizeOptionalString(request.getLocationSource()));
        }
        if (request.getLocationAccuracyMeters() != null) {
            existing.setLocationAccuracyMeters(request.getLocationAccuracyMeters());
        }
        if (request.getIncidentRadiusMeters() != null) {
            existing.setIncidentRadiusMeters(request.getIncidentRadiusMeters());
        }
        if (request.getGoogleMapsUrl() != null) {
            existing.setGoogleMapsUrl(normalizeOptionalString(request.getGoogleMapsUrl()));
        }
        if (request.getMediaAttachments() != null) {
            existing.setMediaAttachments(mapMedia(request.getMediaAttachments()));
        }

        existing.setUpdatedAt(LocalDateTime.now());
        accidents.put(existing.getId(), existing);
        return existing;
    }

    public void deleteAccident(String id, AuthenticatedUser user) {
        Accident existing = getByIdOrThrow(id);
        ensureCanModify(existing, user);
        accidents.remove(id);
    }

    public List<Accident> getNearbyAccidents(Double latitude, Double longitude, Double radiusKm)
            {
        List<Accident> allAccidents = getAllAccidents();
        List<Accident> nearbyAccidents = new ArrayList<>();

        for (Accident accident : allAccidents) {
            if (accident.getLatitude() == null || accident.getLongitude() == null) {
                continue;
            }
            double distance = calculateDistance(latitude, longitude, accident.getLatitude(), accident.getLongitude());
            if (distance <= radiusKm) {
                nearbyAccidents.add(accident);
            }
        }

        return nearbyAccidents;
    }

    private Accident getByIdOrThrow(String id) {
        Accident accident = accidents.get(id);
        if (accident == null) {
            throw new ResourceNotFoundException("Accident with id " + id + " was not found");
        }
        return accident;
    }

    private void ensureCanModify(Accident accident, AuthenticatedUser user) {
        if (user == null) {
            throw new ForbiddenOperationException("You are not authorized to modify this report");
        }
        if (user.isAdmin()) {
            return;
        }
        if (!Objects.equals(accident.getReporterId(), user.getUid())) {
            throw new ForbiddenOperationException("Only the report owner or an admin can modify this report");
        }
    }

    private List<MediaAttachment> mapMedia(List<MediaAttachmentRequest> requests) {
        if (requests == null) {
            return new ArrayList<>();
        }

        return requests.stream().map(request ->
                        new MediaAttachment(
                                request.getUrl(),
                                request.getType(),
                                normalizeOptionalString(request.getName()),
                                normalizeOptionalString(request.getProvider()),
                                request.getBytes()
                        ))
                .collect(Collectors.toList());
    }

    private String normalizeOptionalString(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private boolean hasPotentialDuplicate(AccidentCreateRequest request, LocalDateTime now) {
        for (Accident existing : accidents.values()) {
            if (existing.getLatitude() == null || existing.getLongitude() == null || existing.getReportedAt() == null) {
                continue;
            }
            if (existing.getStatus() == AccidentStatus.RESOLVED) {
                continue;
            }

            if (existing.getReportedAt().isBefore(now.minusHours(DUPLICATE_WINDOW_HOURS))) {
                continue;
            }

            double distanceKm = calculateDistance(
                    request.getLatitude(),
                    request.getLongitude(),
                    existing.getLatitude(),
                    existing.getLongitude()
            );
            if (distanceKm > DUPLICATE_RADIUS_KM) {
                continue;
            }

            double titleSimilarity = titleSimilarity(request.getTitle(), existing.getTitle());
            if (titleSimilarity >= 0.45) {
                return true;
            }
        }
        return false;
    }

    private void pruneIdempotencyRecords(LocalDateTime now) {
        idempotencyRecords.entrySet().removeIf(entry ->
                entry.getValue().createdAt.isBefore(now.minusHours(IDEMPOTENCY_TTL_HOURS))
        );
    }

    private double titleSimilarity(String first, String second) {
        String normalizedFirst = normalizeForSimilarity(first);
        String normalizedSecond = normalizeForSimilarity(second);
        if (normalizedFirst.isEmpty() || normalizedSecond.isEmpty()) {
            return 0;
        }

        String[] firstTokens = normalizedFirst.split(" ");
        String[] secondTokens = normalizedSecond.split(" ");
        int common = 0;
        for (String firstToken : firstTokens) {
            for (String secondToken : secondTokens) {
                if (firstToken.equals(secondToken) && firstToken.length() > 2) {
                    common += 1;
                    break;
                }
            }
        }

        int union = firstTokens.length + secondTokens.length - common;
        if (union <= 0) {
            return 0;
        }
        return (double) common / union;
    }

    private String normalizeForSimilarity(String value) {
        if (value == null) {
            return "";
        }
        return value.toLowerCase().replaceAll("[^a-z0-9\\s]", " ").replaceAll("\\s+", " ").trim();
    }

    private double calculateDistance(Double lat1, Double lon1, Double lat2, Double lon2) {
        final int EARTH_RADIUS = 6371;
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS * c;
    }

    private static final class IdempotencyRecord {
        private final String accidentId;
        private final LocalDateTime createdAt;

        private IdempotencyRecord(String accidentId, LocalDateTime createdAt) {
            this.accidentId = accidentId;
            this.createdAt = createdAt;
        }
    }
}
