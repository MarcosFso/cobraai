package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.Invoice;

/** An invoice together with its customer (the screens show the customer's name and phone). */
public record InvoiceView(Invoice invoice, Customer customer) {
}
