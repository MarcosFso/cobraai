package com.billing.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class RecurringInvoiceTest {

    private static RecurringInvoice starting(LocalDate firstDue) {
        return new RecurringInvoice(UUID.randomUUID(), UUID.randomUUID(), "Mensalidade", 10000, firstDue);
    }

    @Test
    void nextInvoiceIsDueOneMonthAfterTheFirst() {
        assertEquals(LocalDate.of(2027, 2, 10), starting(LocalDate.of(2027, 1, 10)).getNextDueDate());
    }

    @Test
    void day31GoesToTheLastDayOfShortMonthsAndComesBack() {
        RecurringInvoice r = starting(LocalDate.of(2027, 1, 31));
        assertEquals(LocalDate.of(2027, 2, 28), r.getNextDueDate());
        r.advance();
        assertEquals(LocalDate.of(2027, 3, 31), r.getNextDueDate()); // does not drift to the 28th
        r.advance();
        assertEquals(LocalDate.of(2027, 4, 30), r.getNextDueDate());
    }

    @Test
    void leapYearFebruary() {
        assertEquals(LocalDate.of(2028, 2, 29), starting(LocalDate.of(2028, 1, 31)).getNextDueDate());
    }

    @Test
    void yearChange() {
        assertEquals(LocalDate.of(2028, 1, 15), starting(LocalDate.of(2027, 12, 15)).getNextDueDate());
    }

    @Test
    void stopMakesItInactive() {
        RecurringInvoice r = starting(LocalDate.of(2027, 1, 10));
        r.stop();
        assertFalse(r.isActive());
    }
}
