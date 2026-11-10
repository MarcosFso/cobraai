package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.CustomerRepository;
import com.billing.domain.Organization;
import com.billing.domain.OrganizationRepository;
import com.billing.error.BusinessRuleException;
import com.billing.error.ConflictException;
import com.billing.error.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** Every method takes the company of the caller; there is no way to read or write another company's customers. */
@Service
public class CustomerService {

    public static final int DEMO_MAX_CUSTOMERS = 30;

    private final CustomerRepository customers;
    private final OrganizationRepository organizations;

    public CustomerService(CustomerRepository customers, OrganizationRepository organizations) {
        this.customers = customers;
        this.organizations = organizations;
    }

    @Transactional
    public Customer create(UUID orgId, String name, String document, String email, String phone) {
        String digits = DocumentValidator.digitsOnly(document);
        if (!DocumentValidator.isValid(digits)) {
            throw new BusinessRuleException("CPF/CNPJ inválido");
        }
        String normalizedPhone = PhoneNormalizer.normalize(phone);
        if (customers.existsByOrgIdAndDocument(orgId, digits)) {
            throw new ConflictException("Já existe um cliente com esse CPF/CNPJ");
        }
        if (organizations.findById(orgId).map(Organization::isDemo).orElse(false)
                && customers.countByOrgId(orgId) >= DEMO_MAX_CUSTOMERS) {
            throw new BusinessRuleException("Limite da demonstração atingido (" + DEMO_MAX_CUSTOMERS + " clientes)");
        }
        return customers.save(new Customer(orgId, name.trim(), digits, email.trim(), normalizedPhone));
    }

    @Transactional(readOnly = true)
    public Customer get(UUID orgId, UUID id) {
        return customers.findByIdAndOrgId(id, orgId).orElseThrow(() -> new NotFoundException("Cliente não encontrado"));
    }

    @Transactional(readOnly = true)
    public List<Customer> list(UUID orgId) {
        return customers.findByOrgIdOrderByNameAsc(orgId);
    }
}
