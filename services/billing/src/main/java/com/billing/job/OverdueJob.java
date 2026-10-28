package com.billing.job;

import com.billing.service.InvoiceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
public class OverdueJob {

    private static final Logger log = LoggerFactory.getLogger(OverdueJob.class);

    private final InvoiceService service;

    public OverdueJob(InvoiceService service) {
        this.service = service;
    }

    /** Runs once a day (Sao Paulo time). Safe to run twice: only OPEN invoices are touched. */
    @Scheduled(cron = "${app.overdue.cron}", zone = "${app.timezone}")
    public void run() {
        MDC.put("correlationId", UUID.randomUUID().toString());
        try {
            List<UUID> candidates = service.findOverdueCandidates();
            int changed = 0;
            for (UUID id : candidates) {
                try {
                    if (service.markOverdue(id)) {
                        changed++;
                    }
                } catch (Exception e) {
                    log.warn("Could not mark invoiceId={} overdue: {}", id, e.toString());
                }
            }
            log.info("Overdue job finished candidates={} changed={}", candidates.size(), changed);
        } finally {
            MDC.remove("correlationId");
        }
    }
}
