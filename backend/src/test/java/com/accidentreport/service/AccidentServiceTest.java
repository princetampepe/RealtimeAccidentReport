package com.accidentreport.service;

import com.accidentreport.dto.AccidentCreateRequest;
import com.accidentreport.dto.AccidentUpdateRequest;
import com.accidentreport.dto.CreateAccidentResult;
import com.accidentreport.error.ConflictException;
import com.accidentreport.error.ForbiddenOperationException;
import com.accidentreport.model.AccidentSeverity;
import com.accidentreport.model.AccidentStatus;
import com.accidentreport.security.AuthenticatedUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccidentServiceTest {

    private AccidentService service;

    @BeforeEach
    void setUp() {
        service = new AccidentService();
    }

    @Test
    void reportAccident_setsDefaultsAndOwnership() {
        AuthenticatedUser user = new AuthenticatedUser("uid-1", "u1@example.com", false);
        AccidentCreateRequest request = createRequest("Bus crash", 10.327, 123.906);

        CreateAccidentResult result = service.reportAccident(request, user, "idem-1");

        assertTrue(result.isCreated());
        assertNotNull(result.getAccident().getId());
        assertEquals("uid-1", result.getAccident().getReporterId());
        assertEquals("u1@example.com", result.getAccident().getReporterEmail());
        assertEquals(AccidentStatus.ACTIVE, result.getAccident().getStatus());
    }

    @Test
    void reportAccident_withSameIdempotencyKeyReturnsExistingRecord() {
        AuthenticatedUser user = new AuthenticatedUser("uid-1", "u1@example.com", false);

        CreateAccidentResult first = service.reportAccident(
                createRequest("Truck collision", 10.3271, 123.9061),
                user,
                "idem-constant"
        );

        CreateAccidentResult second = service.reportAccident(
                createRequest("Truck collision updated title", 10.3272, 123.9062),
                user,
                "idem-constant"
        );

        assertTrue(first.isCreated());
        assertFalse(second.isCreated());
        assertEquals(first.getAccident().getId(), second.getAccident().getId());
    }

    @Test
    void reportAccident_rejectsPotentialDuplicateWithoutOverride() {
        AuthenticatedUser user = new AuthenticatedUser("uid-1", "u1@example.com", false);

        service.reportAccident(createRequest("Motorcycle collision", 10.327, 123.906), user, null);

        AccidentCreateRequest possibleDuplicate = createRequest("Motorcycle collision", 10.3271, 123.9061);
        possibleDuplicate.setForceDuplicate(false);

        assertThrows(ConflictException.class, () -> service.reportAccident(possibleDuplicate, user, null));
    }

    @Test
    void updateAccident_rejectsNonOwner() {
        AuthenticatedUser owner = new AuthenticatedUser("owner-1", "owner@example.com", false);
        AuthenticatedUser otherUser = new AuthenticatedUser("other-1", "other@example.com", false);

        CreateAccidentResult created = service.reportAccident(
                createRequest("Sedan crash", 10.32, 123.90),
                owner,
                "idem-owner"
        );

        AccidentUpdateRequest updateRequest = new AccidentUpdateRequest();
        updateRequest.setStatus(AccidentStatus.RESOLVED);

        assertThrows(ForbiddenOperationException.class,
                () -> service.updateAccident(created.getAccident().getId(), updateRequest, otherUser));
    }

    private AccidentCreateRequest createRequest(String title, double lat, double lng) {
        AccidentCreateRequest request = new AccidentCreateRequest();
        request.setDispatchId("DSP-TEST123");
        request.setTitle(title);
        request.setDescription("Multi-vehicle accident reported by patrol team.");
        request.setAddress("Jose Maria Del Mar Avenue, Cebu City");
        request.setLatitude(lat);
        request.setLongitude(lng);
        request.setSeverity(AccidentSeverity.HIGH);
        request.setLocationSource("gps");
        request.setLocationAccuracyMeters(20);
        request.setIncidentRadiusMeters(120);
        request.setGoogleMapsUrl("https://www.google.com/maps?q=" + lat + "," + lng);
        request.setForceDuplicate(false);
        return request;
    }
}
