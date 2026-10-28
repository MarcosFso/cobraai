package com.billing.web;

import com.billing.service.CustomerService;
import com.billing.web.Dtos.CreateCustomerRequest;
import com.billing.web.Dtos.CustomerResponse;
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
@RequestMapping("/customers")
public class CustomerController {

    private final CustomerService service;

    public CustomerController(CustomerService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerResponse create(@Valid @RequestBody CreateCustomerRequest request) {
        return CustomerResponse.from(service.create(request.name(), request.document(), request.email()));
    }

    @GetMapping("/{id}")
    public CustomerResponse get(@PathVariable UUID id) {
        return CustomerResponse.from(service.get(id));
    }

    @GetMapping
    public List<CustomerResponse> list() {
        return service.list().stream().map(CustomerResponse::from).toList();
    }
}
