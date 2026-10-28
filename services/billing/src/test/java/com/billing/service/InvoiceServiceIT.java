package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.Invoice;
import com.billing.domain.InvoiceStatus;
import com.billing.domain.OutboxEvent;
import com.billing.domain.OutboxEventRepository;
import com.billing.error.BusinessRuleException;
import com.billing.error.ConflictException;
import com.billing.error.InvalidTransitionException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Real PostgreSQL via Testcontainers (needs Docker). Kafka is not involved: the outbox publisher is off. */
@SpringBootTest(properties = {"app.outbox.enabled=false", "app.topics.create=false"})
@Testcontainers
class InvoiceServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired CustomerService customers;
    @Autowired InvoiceService invoices;
    @Autowired OutboxEventRepository outbox;

    private Customer newCustomer() {
        // Unique valid CPFs are hard to generate, so each test uses a fresh CNPJ-like base only once per method.
        return customers.create("Maria", cpf(), "maria@example.com");
    }

    private static int cpfCounter = 0;

    /** Generates a valid CPF from a counter, so tests do not collide on the unique document. */
    private static String cpf() {
        String base = String.format("%09d", 100_000_000 + (++cpfCounter) * 7);
        int d1 = digit(base, 10);
        int d2 = digit(base + d1, 11);
        return base + d1 + d2;
    }

    private static int digit(String s, int startWeight) {
        int sum = 0;
        for (int i = 0; i < s.length(); i++) {
            sum += (s.charAt(i) - '0') * (startWeight - i);
        }
        int r = (sum * 10) % 11;
        return r == 10 ? 0 : r;
    }

    private List<OutboxEvent> eventsOf(Invoice invoice) {
        return outbox.findAll().stream()
                .filter(e -> e.getAggregateId().equals(invoice.getId().toString()))
                .toList();
    }

    @Test
    void creatingAnInvoiceWritesTheCreatedEventInTheSameTransaction() {
        Customer c = newCustomer();
        Invoice i = invoices.create(c.getId(), "Honorarios", 150_000, invoices.today().plusDays(5));

        List<OutboxEvent> events = eventsOf(i);
        assertEquals(1, events.size());
        assertEquals("invoice.created", events.get(0).getType());
        assertTrue(events.get(0).getPayload().contains("\"amountCents\""));
    }

    @Test
    void payingTwiceIsRefusedAndEmitsOneEvent() {
        Customer c = newCustomer();
        Invoice i = invoices.create(c.getId(), "Honorarios", 1_000, invoices.today().plusDays(1));

        invoices.pay(i.getId());
        assertThrows(InvalidTransitionException.class, () -> invoices.pay(i.getId()));

        long paidEvents = eventsOf(i).stream().filter(e -> e.getType().equals("invoice.paid")).count();
        assertEquals(1, paidEvents);
    }

    @Test
    void cancelingEmitsTheCanceledEvent() {
        Customer c = newCustomer();
        Invoice i = invoices.create(c.getId(), "Honorarios", 1_000, invoices.today().plusDays(1));

        invoices.cancel(i.getId());

        assertTrue(eventsOf(i).stream().anyMatch(e -> e.getType().equals("invoice.canceled")));
        assertEquals(InvoiceStatus.CANCELED, invoices.get(i.getId()).getStatus());
    }

    @Test
    void dueDateInThePastIsRefused() {
        Customer c = newCustomer();
        assertThrows(BusinessRuleException.class,
                () -> invoices.create(c.getId(), "Old", 1_000, invoices.today().minusDays(1)));
    }

    @Test
    void amountMustBePositive() {
        Customer c = newCustomer();
        assertThrows(BusinessRuleException.class,
                () -> invoices.create(c.getId(), "Zero", 0, invoices.today().plusDays(1)));
    }

    @Test
    void duplicatedDocumentIsRefused() {
        String doc = cpf();
        customers.create("A", doc, "a@example.com");
        assertThrows(ConflictException.class, () -> customers.create("B", doc, "b@example.com"));
    }

    @Test
    void unknownCustomerIsRefused() {
        assertThrows(RuntimeException.class,
                () -> invoices.create(UUID.randomUUID(), "x", 1_000, invoices.today().plusDays(1)));
    }

    @Test
    void markOverdueEmitsOnlyOnceEvenIfCalledTwice() {
        Customer c = newCustomer();
        Invoice i = invoices.create(c.getId(), "Honorarios", 1_000, invoices.today());

        // Due today: not overdue yet (the invoice only becomes OVERDUE the day after).
        assertEquals(false, invoices.markOverdue(i.getId()));
        assertTrue(invoices.findOverdueCandidates().stream().noneMatch(id -> id.equals(i.getId())));
        assertEquals(LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")), invoices.today());
    }
}
