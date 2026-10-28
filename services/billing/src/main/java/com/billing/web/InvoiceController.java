package com.billing.web;

import com.billing.domain.InvoiceStatus;
import com.billing.service.InvoiceService;
import com.billing.web.Dtos.CreateInvoiceRequest;
import com.billing.web.Dtos.InvoiceResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/invoices")
public class InvoiceController {

    private final InvoiceService service;

    public InvoiceController(InvoiceService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public InvoiceResponse create(@Valid @RequestBody CreateInvoiceRequest request) {
        return InvoiceResponse.from(service.create(
                request.customerId(), request.description(), request.amountCents(), request.dueDate()));
    }

    @GetMapping
    public List<InvoiceResponse> list(@RequestParam(required = false) InvoiceStatus status) {
        return service.list(status).stream().map(InvoiceResponse::from).toList();
    }

    @GetMapping("/{id}")
    public InvoiceResponse get(@PathVariable UUID id) {
        return InvoiceResponse.from(service.get(id));
    }

    @PostMapping("/{id}/pay")
    public InvoiceResponse pay(@PathVariable UUID id) {
        return InvoiceResponse.from(service.pay(id));
    }

    @PostMapping("/{id}/cancel")
    public InvoiceResponse cancel(@PathVariable UUID id) {
        return InvoiceResponse.from(service.cancel(id));
    }
}
