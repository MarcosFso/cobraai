package com.billing.web;

import com.billing.domain.Customer;
import com.billing.domain.Invoice;
import com.billing.domain.InvoiceStatus;
import com.billing.service.AuthService.AuthResult;
import com.billing.service.InvoiceView;
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

    // ----- auth -----

    public record RegisterRequest(
            @NotBlank @Size(max = 120) String company,
            @NotBlank @Size(max = 160) String email,
            @NotBlank @Size(max = 100) String password) {
    }

    public record LoginRequest(@NotBlank @Size(max = 160) String email, @NotBlank @Size(max = 100) String password) {
    }

    public record AuthResponse(String token, String email, String company, boolean demo) {
        public static AuthResponse from(AuthResult result) {
            return new AuthResponse(result.token(), result.email(), result.company(), result.demo());
        }
    }

    public record MeResponse(String email, String company, boolean demo) {
    }

    // ----- customers -----

    public record CreateCustomerRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank String document,
            @NotBlank @Email @Size(max = 160) String email,
            @Size(max = 30) String phone) {
    }

    public record CustomerResponse(UUID id, String name, String document, String email, String phone, Instant createdAt) {
        public static CustomerResponse from(Customer c) {
            return new CustomerResponse(c.getId(), c.getName(), c.getDocument(), c.getEmail(), c.getPhone(), c.getCreatedAt());
        }
    }

    // ----- invoices -----

    public record CreateInvoiceRequest(
            @NotNull UUID customerId,
            @NotBlank @Size(max = 200) String description,
            @Positive long amountCents,
            @NotNull LocalDate dueDate) {
    }

    public record InvoiceResponse(UUID id, UUID customerId, String customerName, String customerPhone, String description,
                                  long amountCents, LocalDate dueDate, InvoiceStatus status, Instant paidAt, Instant createdAt) {
        public static InvoiceResponse from(InvoiceView view) {
            Invoice i = view.invoice();
            Customer c = view.customer();
            return new InvoiceResponse(i.getId(), i.getCustomerId(), c == null ? null : c.getName(), c == null ? null : c.getPhone(),
                    i.getDescription(), i.getAmountCents(), i.getDueDate(), i.getStatus(), i.getPaidAt(), i.getCreatedAt());
        }
    }
}
