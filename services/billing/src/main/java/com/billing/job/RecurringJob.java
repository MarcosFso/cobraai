package com.billing.job;

import com.billing.service.RecurringService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.UUID;

@Component
public class RecurringJob {

    private static final Logger log = LoggerFactory.getLogger(RecurringJob.class);

    /** If the job was down for months, it catches up, but never issues more than this many invoices per charge in one run. */
    private static final int MAX_CATCH_UP = 12;

    private final RecurringService service;

    public RecurringJob(RecurringService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.recurring.cron}", zone = "${app.timezone}")
    public void run() {
        MDC.put("correlationId", UUID.randomUUID().toString());
        try {
            int issued = runUntil(service.horizon());
            log.info("Recurring job finished issued={}", issued);
        } finally {
            MDC.remove("correlationId");
        }
    }

    /** Issues every invoice due up to the horizon. Public so tests can move "today" forward. */
    public int runUntil(LocalDate horizon) {
        int issued = 0;
        for (UUID id : service.findDue(horizon)) {
            try {
                for (int i = 0; i < MAX_CATCH_UP && service.issueNext(id, horizon); i++) {
                    issued++;
                }
            } catch (Exception e) {
                log.warn("Could not issue recurringId={}: {}", id, e.toString());
            }
        }
        return issued;
    }
}
