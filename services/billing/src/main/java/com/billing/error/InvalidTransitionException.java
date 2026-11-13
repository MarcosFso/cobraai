package com.billing.error;

import com.billing.domain.InvoiceStatus;

import java.util.UUID;

/** Mapped to 409 Conflict. */
public class InvalidTransitionException extends RuntimeException {

    public InvalidTransitionException(UUID invoiceId, InvoiceStatus current, String action) {
        super("Não dá para " + ("pay".equals(action) ? "pagar" : "cancelar") + " a cobrança " + invoiceId + ": ela está " + label(current) + ".");
    }

    private static String label(InvoiceStatus status) {
        return switch (status) {
            case OPEN -> "em aberto";
            case PAID -> "paga";
            case OVERDUE -> "vencida";
            case CANCELED -> "cancelada";
        };
    }
}
