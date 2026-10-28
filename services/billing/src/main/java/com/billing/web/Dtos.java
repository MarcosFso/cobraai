package com.billing.web;

import com.billing.domain.Customer;
import com.billing.domain.Invoice;
import com.billing.domain.InvoiceStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class Dtos {

    private Dtos() {
    }

    public record CreateCustomerRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank String document,
            @NotBlank @Email @Size(max = 160) String email) {
    }

    public record CustomerResponse(UUID id, String name, String document, String email, Instant createdAt) {
        public static CustomerResponse from(Customer c) {
            return new CustomerResponse(c.getId(), c.getName(), c.getDocument(), c.getEmail(), c.getCreatedAt());
        }
    }

    public record CreateInvoiceRequest(
            @NotNull UUID customerId,
            @NotBlank @Size(max = 200) String description,
            @Positive long amountCents,
            @NotNull LocalDate dueDate) {
    }

    public record InvoiceResponse(UUID id, UUID customerId, String description, long amountCents,
                                  LocalDate dueDate, InvoiceStatus status, Instant paidAt, Instant createdAt) {
        public static InvoiceResponse from(Invoice i) {
            return new InvoiceResponse(i.getId(), i.getCustomerId(), i.getDescription(), i.getAmountCents(),
                    i.getDueDate(), i.getStatus(), i.getPaidAt(), i.getCreatedAt());
        }
    }
}
