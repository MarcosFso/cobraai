package com.billing.domain;

import com.billing.error.InvalidTransitionException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Covers the status table of the project documentation, one test per row. */
class InvoiceTest {

    private static final LocalDate DUE = LocalDate.of(2026, 11, 10);

    private Invoice open() {
        return new Invoice(UUID.randomUUID(), UUID.randomUUID(), "Honorarios", 150_000, DUE);
    }

    private Invoice overdue() {
        Invoice i = open();
        assertTrue(i.markOverdue(DUE.plusDays(1)));
        return i;
    }

    @Test
    void openCanBePaid() {
        Invoice i = open();
        i.pay(Instant.now());
        assertEquals(InvoiceStatus.PAID, i.getStatus());
        assertNotNull(i.getPaidAt());
    }

    @Test
    void openCanBeCanceled() {
        Invoice i = open();
        i.cancel();
        assertEquals(InvoiceStatus.CANCELED, i.getStatus());
    }

    @Test
    void overdueCanBePaidOrCanceled() {
        Invoice paid = overdue();
        paid.pay(Instant.now());
        assertEquals(InvoiceStatus.PAID, paid.getStatus());

        Invoice canceled = overdue();
        canceled.cancel();
        assertEquals(InvoiceStatus.CANCELED, canceled.getStatus());
    }

    @Test
    void dueDateDayItselfIsNotOverdue() {
        Invoice i = open();
        assertFalse(i.markOverdue(DUE));
        assertEquals(InvoiceStatus.OPEN, i.getStatus());
        assertTrue(i.markOverdue(DUE.plusDays(1)));
    }

    @Test
    void markingOverdueTwiceChangesNothingTheSecondTime() {
        Invoice i = open();
        assertTrue(i.markOverdue(DUE.plusDays(1)));
        assertFalse(i.markOverdue(DUE.plusDays(2)));
    }

    @Test
    void paidCannotBePaidAgainOrCanceled() {
        Invoice i = open();
        i.pay(Instant.now());
        assertThrows(InvalidTransitionException.class, () -> i.pay(Instant.now()));
        assertThrows(InvalidTransitionException.class, i::cancel);
        assertEquals(InvoiceStatus.PAID, i.getStatus());
    }

    @Test
    void canceledCannotBePaidOrCanceledAgain() {
        Invoice i = open();
        i.cancel();
        assertThrows(InvalidTransitionException.class, () -> i.pay(Instant.now()));
        assertThrows(InvalidTransitionException.class, i::cancel);
    }

    @Test
    void paidOrCanceledNeverBecomeOverdue() {
        Invoice paid = open();
        paid.pay(Instant.now());
        assertFalse(paid.markOverdue(DUE.plusDays(5)));

        Invoice canceled = open();
        canceled.cancel();
        assertFalse(canceled.markOverdue(DUE.plusDays(5)));
    }
}
