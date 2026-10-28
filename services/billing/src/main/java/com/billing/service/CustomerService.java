package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.CustomerRepository;
import com.billing.error.BusinessRuleException;
import com.billing.error.ConflictException;
import com.billing.error.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class CustomerService {

    private final CustomerRepository customers;

    public CustomerService(CustomerRepository customers) {
        this.customers = customers;
    }

    @Transactional
    public Customer create(String name, String document, String email) {
        String digits = DocumentValidator.digitsOnly(document);
        if (!DocumentValidator.isValid(digits)) {
            throw new BusinessRuleException("Invalid CPF/CNPJ");
        }
        if (customers.existsByDocument(digits)) {
            throw new ConflictException("A customer with this document already exists");
        }
        return customers.save(new Customer(name.trim(), digits, email.trim()));
    }

    @Transactional(readOnly = true)
    public Customer get(UUID id) {
        return customers.findById(id).orElseThrow(() -> new NotFoundException("Customer not found: " + id));
    }

    @Transactional(readOnly = true)
    public List<Customer> list() {
        return customers.findAll();
    }
}
