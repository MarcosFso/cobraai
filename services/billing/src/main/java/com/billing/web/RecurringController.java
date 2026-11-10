package com.billing.web;

import com.billing.security.CurrentUser;
import com.billing.service.RecurringService;
import com.billing.web.Dtos.CreateRecurringRequest;
import com.billing.web.Dtos.InvoiceResponse;
import com.billing.web.Dtos.RecurringResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/recurring")
public class RecurringController {

    private final RecurringService service;
    private final CurrentUser currentUser;

    public RecurringController(RecurringService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    /** Starts a monthly charge and returns its first invoice, issued right away. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public InvoiceResponse create(@Valid @RequestBody CreateRecurringRequest request) {
        return InvoiceResponse.from(service.create(currentUser.orgId(), request.customerId(), request.description(),
                request.amountCents(), request.firstDueDate()));
    }

    @GetMapping
    public List<RecurringResponse> list() {
        return service.list(currentUser.orgId()).stream().map(RecurringResponse::from).toList();
    }

    /** Stops future invoices; the ones already issued stay. */
    @PostMapping("/{id}/stop")
    public RecurringResponse stop(@PathVariable UUID id) {
        return RecurringResponse.from(service.stop(currentUser.orgId(), id));
    }
}
