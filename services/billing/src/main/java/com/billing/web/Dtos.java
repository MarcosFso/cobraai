package com.billing.web;

import com.billing.domain.Customer;
import com.billing.domain.Invoice;
import com.billing.domain.AppUser;
import com.billing.domain.InvoiceStatus;
import com.billing.domain.RecurringInvoice;
import com.billing.domain.Role;
import com.billing.service.RecurringService.RecurringView;
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
            @Size(max = 120) String company, // empty = no company yet: the account waits for an administrator
            @NotBlank @Size(max = 160) String email,
            @NotBlank @Size(max = 100) String password) {
    }

    public record LoginRequest(@NotBlank @Size(max = 160) String email, @NotBlank @Size(max = 100) String password) {
    }

    public record AuthResponse(String token, String email, String company, boolean demo, String role, boolean pending,
                               boolean mustChangePassword) {
        public static AuthResponse from(AuthResult result) {
            return new AuthResponse(result.token(), result.email(), result.company(), result.demo(), result.role(), result.pending(),
                    result.mustChangePassword());
        }
    }

    /** {@code token} is present only when the one in use is out of date (the person was added to or removed from a company). */
    public record MeResponse(String email, String company, boolean demo, String role, boolean pending,
                             boolean mustChangePassword, String token) {
    }

    public record ChangePasswordRequest(@NotBlank @Size(max = 100) String currentPassword,
                                        @NotBlank @Size(max = 100) String newPassword) {
    }

    // ----- team -----

    public record TemporaryPasswordResponse(String temporaryPassword) {
    }

    public record AddMemberRequest(@NotBlank @Size(max = 160) String email, Role role) {
    }

    public record RoleRequest(@NotNull Role role) {
    }

    public record MemberResponse(UUID id, String email, Role role, boolean you, Instant createdAt, boolean passwordResetPending) {
        public static MemberResponse from(AppUser user, UUID currentUserId) {
            return new MemberResponse(user.getId(), user.getEmail(), user.getRole(), user.getId().equals(currentUserId), user.getCreatedAt(),
                    user.isMustChangePassword());
        }
    }

    // ----- recurring -----

    public record CreateRecurringRequest(
            @NotNull UUID customerId,
            @NotBlank @Size(max = 200) String description,
            @Positive long amountCents,
            @NotNull LocalDate firstDueDate) {
    }

    public record RecurringResponse(UUID id, UUID customerId, String customerName, String description, long amountCents,
                                    int dayOfMonth, LocalDate nextDueDate, boolean active, Instant createdAt) {
        public static RecurringResponse from(RecurringView view) {
            RecurringInvoice r = view.recurring();
            Customer c = view.customer();
            return new RecurringResponse(r.getId(), r.getCustomerId(), c == null ? null : c.getName(), r.getDescription(),
                    r.getAmountCents(), r.getAnchorDay(), r.getNextDueDate(), r.isActive(), r.getCreatedAt());
        }
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
                                  long amountCents, LocalDate dueDate, InvoiceStatus status, Instant paidAt, Instant createdAt,
                                  boolean recurring) {
        public static InvoiceResponse from(InvoiceView view) {
            Invoice i = view.invoice();
            Customer c = view.customer();
            return new InvoiceResponse(i.getId(), i.getCustomerId(), c == null ? null : c.getName(), c == null ? null : c.getPhone(),
                    i.getDescription(), i.getAmountCents(), i.getDueDate(), i.getStatus(), i.getPaidAt(), i.getCreatedAt(),
                    i.getRecurringId() != null);
        }
    }
}
