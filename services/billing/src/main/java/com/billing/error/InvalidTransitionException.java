package com.billing.error;

import com.billing.domain.InvoiceStatus;

import java.util.UUID;

/** Mapped to 409 Conflict. */
public class InvalidTransitionException extends RuntimeException {

    public InvalidTransitionException(UUID invoiceId, InvoiceStatus current, String action) {
        super("Cannot " + action + " invoice " + invoiceId + " while it is " + current);
    }
}
