package com.accidentreport.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashMap;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.security.require-auth=false",
        "firebase.enabled=false"
})
@AutoConfigureMockMvc
class AccidentControllerValidationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void reportAccident_whenPayloadInvalid_returns400WithFieldErrors() throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("title", "x");
        payload.put("description", "short");

        mockMvc.perform(post("/api/accidents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.validationErrors.title").exists())
                .andExpect(jsonPath("$.validationErrors.description").exists())
                .andExpect(jsonPath("$.validationErrors.latitude").exists())
                .andExpect(jsonPath("$.validationErrors.longitude").exists());
    }

    @Test
    void reportAccident_whenUnknownFieldProvided_returns400() throws Exception {
        Map<String, Object> payload = validPayload();
        payload.put("unexpectedField", "unexpected-value");

        mockMvc.perform(post("/api/accidents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed or unsupported JSON payload"));
    }

    @Test
    void reportAccident_whenValid_returns201() throws Exception {
        mockMvc.perform(post("/api/accidents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validPayload())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    private Map<String, Object> validPayload() {
        Map<String, Object> payload = new HashMap<>();
        payload.put("dispatchId", "DSP-VAL123456");
        payload.put("title", "Major road collision");
        payload.put("description", "Two vehicles collided near the IT Park intersection.");
        payload.put("address", "Jose Maria Del Mar Avenue, Cebu City");
        payload.put("latitude", 10.327);
        payload.put("longitude", 123.906);
        payload.put("severity", "HIGH");
        payload.put("locationSource", "gps");
        payload.put("locationAccuracyMeters", 15);
        payload.put("incidentRadiusMeters", 120);
        payload.put("googleMapsUrl", "https://www.google.com/maps?q=10.327,123.906");
        payload.put("forceDuplicate", true);
        return payload;
    }
}
