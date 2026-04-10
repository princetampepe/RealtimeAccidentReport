package com.accidentreport.service;

import com.accidentreport.model.Accident;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;

@Service
public class AccidentService {

    private final Map<String, Accident> accidents = new ConcurrentHashMap<>();

    public Accident reportAccident(Accident accident) throws ExecutionException, InterruptedException {
        accident.setId(UUID.randomUUID().toString());
        accident.setReportedAt(LocalDateTime.now());
        accident.setUpdatedAt(LocalDateTime.now());
        accident.setStatus("ACTIVE");
        accident.setResponseCount(0);

        accidents.put(accident.getId(), accident);

        return accident;
    }

    public List<Accident> getAllAccidents() throws ExecutionException, InterruptedException {
        List<Accident> all = new ArrayList<>(accidents.values());
        all.sort(Comparator.comparing(Accident::getReportedAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return all;
    }

    public Accident getAccidentById(String id) throws ExecutionException, InterruptedException {
        return accidents.get(id);
    }

    public Accident updateAccident(Accident accident) throws ExecutionException, InterruptedException {
        accident.setUpdatedAt(LocalDateTime.now());
        accidents.put(accident.getId(), accident);
        return accident;
    }

    public void deleteAccident(String id) throws ExecutionException, InterruptedException {
        accidents.remove(id);
    }

    public List<Accident> getNearbyAccidents(Double latitude, Double longitude, Double radiusKm)
            throws ExecutionException, InterruptedException {
        // Basic implementation - returns all accidents
        // In production, implement proper geo-queries with Cloud Firestore geo-indexing
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

    private double calculateDistance(Double lat1, Double lon1, Double lat2, Double lon2) {
        // Haversine formula for distance calculation
        final int EARTH_RADIUS = 6371;
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS * c;
    }
}
