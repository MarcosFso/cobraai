package com.billing.job;

import com.billing.domain.OrganizationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/** Removes demo sandboxes older than a day; the database cascades to their users, customers and invoices. */
@Component
public class DemoCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(DemoCleanupJob.class);

    private final OrganizationRepository organizations;
    private final Duration maxAge;

    public DemoCleanupJob(OrganizationRepository organizations, @Value("${app.demo.max-age-hours}") long maxAgeHours) {
        this.organizations = organizations;
        this.maxAge = Duration.ofHours(maxAgeHours);
    }

    @Scheduled(cron = "${app.demo.cleanup-cron}", zone = "${app.timezone}")
    @Transactional
    public void run() {
        int removed = organizations.deleteDemoCreatedBefore(Instant.now().minus(maxAge));
        if (removed > 0) {
            log.info("Removed expired demo sandboxes count={}", removed);
        }
    }
}
