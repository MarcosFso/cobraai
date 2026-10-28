package com.billing.error;

/** Mapped to 404 Not Found. */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
