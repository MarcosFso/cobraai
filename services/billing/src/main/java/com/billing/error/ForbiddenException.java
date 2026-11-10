package com.billing.error;

/** Mapped to 403 Forbidden: the caller is logged in but is not allowed to do this (for example, a member managing people). */
public class ForbiddenException extends RuntimeException {

    public ForbiddenException(String message) {
        super(message);
    }
}
