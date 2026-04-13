package com.accidentreport.controller;

import com.accidentreport.dto.AccidentCreateRequest;
import com.accidentreport.dto.AccidentUpdateRequest;
import com.accidentreport.dto.CreateAccidentResult;
import com.accidentreport.model.Accident;
import com.accidentreport.rate.InMemoryRateLimiter;
import com.accidentreport.security.AuthenticatedUser;
import com.accidentreport.service.AccidentService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/api/accidents")
@Validated
public class AccidentController {

    private final AccidentService accidentService;
    private final InMemoryRateLimiter rateLimiter;

    public AccidentController(AccidentService accidentService,
                              InMemoryRateLimiter rateLimiter) {
        this.accidentService = accidentService;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping
    public ResponseEntity<Accident> reportAccident(@Valid @RequestBody AccidentCreateRequest request,
                                                   @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
                                                   @RequestHeader(name = "X-Forwarded-For", required = false) String forwardedFor,
                                                   Authentication authentication) {
        AuthenticatedUser user = asAuthenticatedUser(authentication);
        String actorKey = resolveActorKey(user, forwardedFor);
        rateLimiter.checkLimit(
                "report:" + actorKey,
                10,
                Duration.ofMinutes(1),
                "Rate limit exceeded: at most 10 report submissions per minute"
        );

        CreateAccidentResult result = accidentService.reportAccident(request, user, idempotencyKey);
        HttpStatus status = result.isCreated() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(result.getAccident());
    }

    @GetMapping
    public ResponseEntity<List<Accident>> getAllAccidents() {
        List<Accident> accidents = accidentService.getAllAccidents();
        return ResponseEntity.ok(accidents);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Accident> getAccidentById(@PathVariable String id) {
        Accident accident = accidentService.getAccidentById(id);
        return accident != null ? ResponseEntity.ok(accident) : ResponseEntity.notFound().build();
    }

    @PutMapping("/{id}")
    public ResponseEntity<Accident> updateAccident(@PathVariable String id,
                                                   @Valid @RequestBody AccidentUpdateRequest request,
                                                   @RequestHeader(name = "X-Forwarded-For", required = false) String forwardedFor,
                                                   Authentication authentication) {
        AuthenticatedUser user = asAuthenticatedUser(authentication);
        String actorKey = resolveActorKey(user, forwardedFor);
        rateLimiter.checkLimit(
                "update:" + actorKey,
                30,
                Duration.ofMinutes(1),
                "Rate limit exceeded: at most 30 updates per minute"
        );

        Accident updated = accidentService.updateAccident(id, request, user);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAccident(@PathVariable String id,
                                               @RequestHeader(name = "X-Forwarded-For", required = false) String forwardedFor,
                                               Authentication authentication) {
        AuthenticatedUser user = asAuthenticatedUser(authentication);
        String actorKey = resolveActorKey(user, forwardedFor);
        rateLimiter.checkLimit(
                "delete:" + actorKey,
                10,
                Duration.ofMinutes(1),
                "Rate limit exceeded: at most 10 deletions per minute"
        );

        accidentService.deleteAccident(id, user);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/nearby")
    public ResponseEntity<List<Accident>> getNearbyAccidents(
            @RequestParam @DecimalMin(value = "-90.0") @DecimalMax(value = "90.0") Double latitude,
            @RequestParam @DecimalMin(value = "-180.0") @DecimalMax(value = "180.0") Double longitude,
            @RequestParam(defaultValue = "10") @DecimalMin(value = "1.0") Double radiusKm) {
        List<Accident> nearby = accidentService.getNearbyAccidents(latitude, longitude, radiusKm);
        return ResponseEntity.ok(nearby);
    }

    private AuthenticatedUser asAuthenticatedUser(Authentication authentication) {
        if (authentication == null) {
            return null;
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof AuthenticatedUser user) {
            return user;
        }
        return null;
    }

    private String resolveActorKey(AuthenticatedUser user, String forwardedFor) {
        if (user != null && user.getUid() != null) {
            return user.getUid();
        }
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return "anonymous";
    }
}
