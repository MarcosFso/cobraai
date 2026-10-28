package com.billing.error;

/** Mapped to 409 Conflict (e.g. duplicated document). */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
