package com.billing.error;

/** Mapped to 401 Unauthorized (wrong e-mail or password, missing company in the token). */
public class UnauthorizedException extends RuntimeException {

    public UnauthorizedException(String message) {
        super(message);
    }
}
