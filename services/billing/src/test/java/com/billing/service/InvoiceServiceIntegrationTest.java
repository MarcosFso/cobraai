package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.InvoiceStatus;
import com.billing.domain.Organization;
import com.billing.domain.OrganizationRepository;
import com.billing.domain.OutboxEvent;
import com.billing.domain.OutboxEventRepository;
import com.billing.error.BusinessRuleException;
import com.billing.error.ConflictException;
import com.billing.error.InvalidTransitionException;
import com.billing.error.NotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Real PostgreSQL via Testcontainers (needs Docker). Kafka is not involved: the outbox publisher is off. */
@SpringBootTest(properties = {"app.outbox.enabled=false", "app.topics.create=false", "app.rate-limit.login-per-minute=100000", "app.rate-limit.register-per-minute=100000", "app.rate-limit.demo-per-minute=100000"})
@Testcontainers
class InvoiceServiceIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired CustomerService customers;
    @Autowired InvoiceService invoices;
    @Autowired OrganizationRepository organizations;
    @Autowired OutboxEventRepository outbox;

    private UUID newOrg() {
        return organizations.save(new Organization("Empresa " + UUID.randomUUID(), false)).getId();
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

    private Customer newCustomer(UUID org) {
        return customers.create(org, "Maria", cpf(), "maria@example.com", "(11) 91234-5678");
    }

    private List<OutboxEvent> eventsOf(UUID invoiceId) {
        return outbox.findAll().stream().filter(e -> e.getAggregateId().equals(invoiceId.toString())).toList();
    }

    @Test
    void creatingAnInvoiceWritesTheCreatedEventInTheSameTransaction() {
        UUID org = newOrg();
        Customer c = newCustomer(org);
        InvoiceView view = invoices.create(org, c.getId(), "Honorarios", 150_000, invoices.today().plusDays(5));

        List<OutboxEvent> events = eventsOf(view.invoice().getId());
        assertEquals(1, events.size());
        assertEquals("invoice.created", events.get(0).getType());
        assertTrue(events.get(0).getPayload().contains("\"orgId\""), "events carry the company");
        assertTrue(events.get(0).getPayload().contains("\"amountCents\""));
    }

    @Test
    void phoneIsStoredWithTheCountryCode() {
        UUID org = newOrg();
        assertEquals("5511912345678", newCustomer(org).getPhone());
        assertThrows(BusinessRuleException.class,
                () -> customers.create(org, "Sem Telefone Valido", cpf(), "x@example.com", "123"));
    }

    @Test
    void payingTwiceIsRefusedAndEmitsOneEvent() {
        UUID org = newOrg();
        Customer c = newCustomer(org);
        UUID id = invoices.create(org, c.getId(), "Honorarios", 1_000, invoices.today().plusDays(1)).invoice().getId();

        invoices.pay(org, id);
        assertThrows(InvalidTransitionException.class, () -> invoices.pay(org, id));

        assertEquals(1, eventsOf(id).stream().filter(e -> e.getType().equals("invoice.paid")).count());
    }

    @Test
    void cancelingEmitsTheCanceledEvent() {
        UUID org = newOrg();
        Customer c = newCustomer(org);
        UUID id = invoices.create(org, c.getId(), "Honorarios", 1_000, invoices.today().plusDays(1)).invoice().getId();

        invoices.cancel(org, id);

        assertTrue(eventsOf(id).stream().anyMatch(e -> e.getType().equals("invoice.canceled")));
        assertEquals(InvoiceStatus.CANCELED, invoices.get(org, id).invoice().getStatus());
    }

    @Test
    void dueDateInThePastIsRefused() {
        UUID org = newOrg();
        Customer c = newCustomer(org);
        assertThrows(BusinessRuleException.class,
                () -> invoices.create(org, c.getId(), "Old", 1_000, invoices.today().minusDays(1)));
    }

    @Test
    void amountMustBePositive() {
        UUID org = newOrg();
        Customer c = newCustomer(org);
        assertThrows(BusinessRuleException.class,
                () -> invoices.create(org, c.getId(), "Zero", 0, invoices.today().plusDays(1)));
    }

    @Test
    void duplicatedDocumentIsRefusedInTheSameCompanyButAllowedInAnother() {
        UUID a = newOrg();
        UUID b = newOrg();
        String doc = cpf();
        customers.create(a, "A", doc, "a@example.com", null);
        assertThrows(ConflictException.class, () -> customers.create(a, "B", doc, "b@example.com", null));
        // the same person can be a customer of two companies
        customers.create(b, "A na outra empresa", doc, "a@example.com", null);
    }

    @Test
    void aCompanyCannotSeeOrChangeAnotherCompanysData() {
        UUID a = newOrg();
        UUID b = newOrg();
        Customer ca = newCustomer(a);
        UUID invoiceOfA = invoices.create(a, ca.getId(), "Segredo da empresa A", 99_000, invoices.today().plusDays(3))
                .invoice().getId();

        assertTrue(customers.list(b).isEmpty(), "B sees no customers of A");
        assertTrue(invoices.list(b, null).isEmpty(), "B sees no invoices of A");
        assertThrows(NotFoundException.class, () -> customers.get(b, ca.getId()));
        assertThrows(NotFoundException.class, () -> invoices.get(b, invoiceOfA));
        assertThrows(NotFoundException.class, () -> invoices.pay(b, invoiceOfA));
        assertThrows(NotFoundException.class, () -> invoices.cancel(b, invoiceOfA));
        assertThrows(NotFoundException.class,
                () -> invoices.create(b, ca.getId(), "Usando o cliente de outra empresa", 1_000, invoices.today().plusDays(1)));

        assertEquals(InvoiceStatus.OPEN, invoices.get(a, invoiceOfA).invoice().getStatus(), "A's invoice is untouched");
    }

    @Test
    void unknownCustomerIsRefused() {
        UUID org = newOrg();
        assertThrows(NotFoundException.class,
                () -> invoices.create(org, UUID.randomUUID(), "x", 1_000, invoices.today().plusDays(1)));
    }

    @Test
    void markOverdueDoesNothingForAnInvoiceDueToday() {
        UUID org = newOrg();
        Customer c = newCustomer(org);
        UUID id = invoices.create(org, c.getId(), "Honorarios", 1_000, invoices.today()).invoice().getId();

        // Due today: not overdue yet (the invoice only becomes OVERDUE the day after).
        assertEquals(false, invoices.markOverdue(id));
        assertTrue(invoices.findOverdueCandidates().stream().noneMatch(candidate -> candidate.equals(id)));
    }
}
