package com.accidentreport.controller;

import com.accidentreport.model.Accident;
import com.accidentreport.service.AccidentService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.concurrent.ExecutionException;

@RestController
@RequestMapping("/api/accidents")
public class AccidentController {

    private final AccidentService accidentService;

    public AccidentController(AccidentService accidentService) {
        this.accidentService = accidentService;
    }

    @PostMapping
    public ResponseEntity<Accident> reportAccident(@RequestBody Accident accident) throws ExecutionException, InterruptedException {
        Accident saved = accidentService.reportAccident(accident);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @GetMapping
    public ResponseEntity<List<Accident>> getAllAccidents() throws ExecutionException, InterruptedException {
        List<Accident> accidents = accidentService.getAllAccidents();
        return ResponseEntity.ok(accidents);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Accident> getAccidentById(@PathVariable String id) throws ExecutionException, InterruptedException {
        Accident accident = accidentService.getAccidentById(id);
        return accident != null ? ResponseEntity.ok(accident) : ResponseEntity.notFound().build();
    }

    @PutMapping("/{id}")
    public ResponseEntity<Accident> updateAccident(@PathVariable String id, @RequestBody Accident accident) throws ExecutionException, InterruptedException {
        accident.setId(id);
        Accident updated = accidentService.updateAccident(accident);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAccident(@PathVariable String id) throws ExecutionException, InterruptedException {
        accidentService.deleteAccident(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/nearby")
    public ResponseEntity<List<Accident>> getNearbyAccidents(
            @RequestParam Double latitude,
            @RequestParam Double longitude,
            @RequestParam(defaultValue = "10") Double radiusKm) throws ExecutionException, InterruptedException {
        List<Accident> nearby = accidentService.getNearbyAccidents(latitude, longitude, radiusKm);
        return ResponseEntity.ok(nearby);
    }
}
