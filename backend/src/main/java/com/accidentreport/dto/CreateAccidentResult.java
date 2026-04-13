package com.accidentreport.dto;

import com.accidentreport.model.Accident;

public class CreateAccidentResult {
    private final Accident accident;
    private final boolean created;

    public CreateAccidentResult(Accident accident, boolean created) {
        this.accident = accident;
        this.created = created;
    }

    public Accident getAccident() {
        return accident;
    }

    public boolean isCreated() {
        return created;
    }
}
