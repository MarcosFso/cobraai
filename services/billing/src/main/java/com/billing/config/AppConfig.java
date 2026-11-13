package com.billing.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.common.config.TopicConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.time.Clock;
import java.time.ZoneId;

@Configuration
public class AppConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;

    public AppConfig(@Value("${app.cors.allowed-origins}") String[] allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    /** Due dates are calendar days, so "today" is always the Sao Paulo day. */
    @Bean
    Clock clock(@Value("${app.timezone}") String timezone) {
        return Clock.system(ZoneId.of(timezone));
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**").allowedOrigins(allowedOrigins).allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS");
    }

    /** Topics keep messages forever (retention.ms=-1) so the report service can rebuild from "earliest". */
    @Bean
    @ConditionalOnProperty(name = "app.topics.create", havingValue = "true", matchIfMissing = true)
    KafkaAdmin.NewTopics invoiceTopics(@Value("${app.topics.partitions}") int partitions,
                                       @Value("${app.topics.invoice-events}") String invoiceEvents) {
        return new KafkaAdmin.NewTopics(topic(invoiceEvents, partitions));
    }

    private static NewTopic topic(String name, int partitions) {
        return TopicBuilder.name(name).partitions(partitions).replicas(1)
                .config(TopicConfig.RETENTION_MS_CONFIG, "-1").build();
    }
}
