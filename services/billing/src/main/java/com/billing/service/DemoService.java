package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.CustomerRepository;
import com.billing.domain.Invoice;
import com.billing.domain.InvoiceRepository;
import com.billing.domain.InvoiceStatus;
import com.billing.domain.RecurringInvoice;
import com.billing.domain.RecurringInvoiceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Fills a demo sandbox with sample customers and invoices in every state, with a history over the last months.
 * The events go through the normal outbox, flagged as "seed": the report service counts them (so the dashboard
 * has numbers and a chart) but the notification service does not send e-mails for them.
 */
@Service
public class DemoService {

    private record SampleCustomer(String name, String document, String email, String phone) {
    }

    private record SampleInvoice(int customer, String description, long cents, int dueOffsetDays, InvoiceStatus status,
                                 int createdDaysAgo, Integer paidDaysAgo) {
    }

    private static final List<SampleCustomer> CUSTOMERS = List.of(
            new SampleCustomer("Padaria Pão Quente Ltda", "11222333000181", "financeiro@paoquente.example", "5511987650001"),
            new SampleCustomer("Clínica Bem Viver", "11444777000161", "contas@bemviver.example", "5511987650002"),
            new SampleCustomer("Ana Souza", "52998224725", "ana.souza@example.com", "5511987650003"),
            new SampleCustomer("Oficina Mecânica Irmãos Lima", "45723174000110", "pagamentos@oficinalima.example", "5511987650004"),
            new SampleCustomer("Carlos Pereira", "11144477735", "carlos.pereira@example.com", "5511987650005"),
            new SampleCustomer("Mariana Costa", "39053344705", "mariana.costa@example.com", "5511987650006"));

    private static final List<SampleInvoice> INVOICES = List.of(
            new SampleInvoice(0, "Honorários de março", 150000, -235, InvoiceStatus.PAID, 245, 238),
            new SampleInvoice(1, "Mensalidade de abril", 89000, -205, InvoiceStatus.PAID, 215, 208),
            new SampleInvoice(2, "Consultoria de maio", 42000, -175, InvoiceStatus.PAID, 185, 176),
            new SampleInvoice(4, "Honorários de junho", 60000, -145, InvoiceStatus.PAID, 155, 147),
            new SampleInvoice(3, "Abertura de filial", 95000, -120, InvoiceStatus.PAID, 128, 119),
            new SampleInvoice(0, "Honorários de julho", 150000, -100, InvoiceStatus.PAID, 108, 98),
            new SampleInvoice(0, "Honorários de agosto", 150000, -75, InvoiceStatus.PAID, 80, 70),
            new SampleInvoice(1, "Mensalidade de agosto", 89000, -70, InvoiceStatus.PAID, 78, 68),
            new SampleInvoice(2, "Consultoria contábil", 42000, -60, InvoiceStatus.PAID, 65, 58),
            new SampleInvoice(0, "Honorários de setembro", 150000, -45, InvoiceStatus.PAID, 50, 44),
            new SampleInvoice(3, "Declaração de imposto", 35000, -40, InvoiceStatus.PAID, 48, 41),
            new SampleInvoice(1, "Mensalidade de setembro", 89000, -40, InvoiceStatus.PAID, 47, 38),
            new SampleInvoice(4, "Abertura de empresa", 120000, -30, InvoiceStatus.PAID, 36, 29),
            new SampleInvoice(5, "Honorários de outubro", 60000, -20, InvoiceStatus.PAID, 26, 0),
            new SampleInvoice(0, "Honorários de outubro", 150000, -12, InvoiceStatus.PAID, 20, 0),
            new SampleInvoice(2, "Balanço trimestral", 98000, -15, InvoiceStatus.OVERDUE, 25, null),
            new SampleInvoice(3, "Folha de pagamento de out.", 54000, -8, InvoiceStatus.OVERDUE, 18, null),
            new SampleInvoice(4, "Regularização fiscal", 76000, -3, InvoiceStatus.OVERDUE, 12, null),
            new SampleInvoice(1, "Mensalidade de outubro", 89000, 5, InvoiceStatus.OPEN, 5, null),
            new SampleInvoice(0, "Honorários de novembro", 150000, 12, InvoiceStatus.OPEN, 2, null),
            new SampleInvoice(5, "Honorários de novembro", 60000, 18, InvoiceStatus.OPEN, 1, null),
            new SampleInvoice(2, "Planejamento tributário", 135000, 25, InvoiceStatus.OPEN, 0, null),
            new SampleInvoice(3, "Contrato cancelado", 45000, 7, InvoiceStatus.CANCELED, 9, null));

    private final CustomerRepository customers;
    private final InvoiceRepository invoices;
    private final RecurringInvoiceRepository recurrings;
    private final EventRecorder events;
    private final Clock clock;

    public DemoService(CustomerRepository customers, InvoiceRepository invoices, RecurringInvoiceRepository recurrings,
                       EventRecorder events, Clock clock) {
        this.customers = customers;
        this.invoices = invoices;
        this.recurrings = recurrings;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public void seed(UUID orgId) {
        Instant now = Instant.now(clock);
        LocalDate today = LocalDate.now(clock);
        ZoneId zone = clock.getZone();

        List<Customer> created = new ArrayList<>();
        for (SampleCustomer sample : CUSTOMERS) {
            created.add(customers.save(new Customer(orgId, sample.name(), sample.document(), sample.email(), sample.phone())));
        }

        // One monthly charge, so the "Recorrentes" screen is not empty. Its next invoice is far enough away that the
        // job does not issue it during the 24 hours the sandbox lives.
        recurrings.save(RecurringInvoice.startingAt(orgId, created.get(0).getId(), "Honorários mensais", 150000, today.plusDays(25)));

        for (SampleInvoice sample : INVOICES) {
            Customer customer = created.get(sample.customer());
            Instant createdAt = now.minus(Duration.ofDays(sample.createdDaysAgo())).minusSeconds(sample.customer());
            Instant paidAt = sample.paidDaysAgo() == null ? null : now.minus(Duration.ofDays(sample.paidDaysAgo()));
            LocalDate due = today.plusDays(sample.dueOffsetDays());

            Invoice invoice = invoices.save(Invoice.seeded(orgId, customer.getId(), sample.description(), sample.cents(),
                    due, sample.status(), createdAt, paidAt));

            events.record(InvoiceService.CREATED, invoice, customer, createdAt, true);
            switch (sample.status()) {
                case PAID -> events.record(InvoiceService.PAID, invoice, customer, paidAt, true);
                case OVERDUE -> events.record(InvoiceService.OVERDUE, invoice, customer,
                        due.plusDays(1).atStartOfDay(zone).toInstant(), true);
                case CANCELED -> events.record(InvoiceService.CANCELED, invoice, customer, createdAt.plus(Duration.ofHours(2)), true);
                default -> { }
            }
        }
    }
}
