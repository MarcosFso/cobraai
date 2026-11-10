package com.billing.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The whole HTTP layer with real security: login, tokens, and that one company never sees another's data. */
@SpringBootTest(properties = {"app.outbox.enabled=false", "app.topics.create=false"})
@AutoConfigureMockMvc
@Testcontainers
class AuthIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private JsonNode call(MockHttpServletRequestBuilder request, int expectedStatus) throws Exception {
        MvcResult result = mvc.perform(request).andExpect(status().is(expectedStatus)).andReturn();
        String body = result.getResponse().getContentAsString();
        return body.isBlank() ? json.createObjectNode() : json.readTree(body);
    }

    private MockHttpServletRequestBuilder post(String url, String token, Object body) throws Exception {
        MockHttpServletRequestBuilder request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        return token == null ? request : request.header("Authorization", "Bearer " + token);
    }

    private MockHttpServletRequestBuilder getWith(String url, String token) {
        MockHttpServletRequestBuilder request = get(url);
        return token == null ? request : request.header("Authorization", "Bearer " + token);
    }

    private String register(String company, String email) throws Exception {
        return call(post("/auth/register", null, java.util.Map.of("company", company, "email", email, "password", "senha-forte-123")), 201)
                .get("token").asText();
    }

    @Test
    void everyEndpointExceptHealthAndAuthNeedsAToken() throws Exception {
        mvc.perform(get("/health")).andExpect(status().isOk());
        mvc.perform(get("/customers")).andExpect(status().isUnauthorized());
        mvc.perform(get("/invoices")).andExpect(status().isUnauthorized());
        mvc.perform(getWith("/customers", "isto-nao-e-um-token")).andExpect(status().isUnauthorized());
    }

    @Test
    void registerThenLoginWithTheSamePassword() throws Exception {
        String email = "dono-" + UUID.randomUUID() + "@empresa.example";
        register("Padaria do Zé", email);

        JsonNode login = call(post("/auth/login", null, java.util.Map.of("email", email.toUpperCase(), "password", "senha-forte-123")), 200);
        assertEquals("Padaria do Zé", login.get("company").asText());
        assertFalse(login.get("demo").asBoolean());

        JsonNode me = call(getWith("/auth/me", login.get("token").asText()), 200);
        assertEquals(email, me.get("email").asText());
    }

    @Test
    void wrongPasswordAndUnknownEmailGiveTheSameAnswer() throws Exception {
        String email = "dono-" + UUID.randomUUID() + "@empresa.example";
        register("Empresa", email);

        JsonNode wrongPassword = call(post("/auth/login", null, java.util.Map.of("email", email, "password", "senha-errada-123")), 401);
        JsonNode unknownEmail = call(post("/auth/login", null, java.util.Map.of("email", "ninguem@empresa.example", "password", "senha-forte-123")), 401);
        assertEquals(wrongPassword.get("detail").asText(), unknownEmail.get("detail").asText());
    }

    @Test
    void registrationRules() throws Exception {
        String email = "dono-" + UUID.randomUUID() + "@empresa.example";
        register("Empresa", email);
        call(post("/auth/register", null, java.util.Map.of("company", "Outra", "email", email, "password", "senha-forte-123")), 409);
        call(post("/auth/register", null, java.util.Map.of("company", "Outra", "email", "sem-arroba", "password", "senha-forte-123")), 400);
        call(post("/auth/register", null, java.util.Map.of("company", "Outra", "email", "novo-" + UUID.randomUUID() + "@x.example", "password", "curta")), 400);
    }

    @Test
    void oneCompanyNeverSeesAnotherCompanysData() throws Exception {
        String tokenA = register("Empresa A", "a-" + UUID.randomUUID() + "@a.example");
        String tokenB = register("Empresa B", "b-" + UUID.randomUUID() + "@b.example");

        JsonNode customer = call(post("/customers", tokenA, java.util.Map.of(
                "name", "Cliente secreto de A", "document", "529.982.247-25", "email", "segredo@a.example", "phone", "(11) 91234-5678")), 201);
        assertEquals("5511912345678", customer.get("phone").asText());
        String customerId = customer.get("id").asText();
        JsonNode invoice = call(post("/invoices", tokenA, java.util.Map.of(
                "customerId", customerId, "description", "Cobrança secreta", "amountCents", 123456,
                "dueDate", LocalDate.now().plusDays(10).toString())), 201);
        String invoiceId = invoice.get("id").asText();
        assertEquals("Cliente secreto de A", invoice.get("customerName").asText());
        assertEquals("5511912345678", invoice.get("customerPhone").asText());

        // A sees its own data
        assertEquals(1, call(getWith("/customers", tokenA), 200).size());
        assertEquals(1, call(getWith("/invoices", tokenA), 200).size());

        // B sees nothing of A, by list or by id, and cannot act on it
        assertEquals(0, call(getWith("/customers", tokenB), 200).size());
        assertEquals(0, call(getWith("/invoices", tokenB), 200).size());
        call(getWith("/customers/" + customerId, tokenB), 404);
        call(getWith("/invoices/" + invoiceId, tokenB), 404);
        call(post("/invoices/" + invoiceId + "/pay", tokenB, java.util.Map.of()), 404);
        call(post("/invoices/" + invoiceId + "/cancel", tokenB, java.util.Map.of()), 404);

        // B can register the very same CPF as its own customer
        call(post("/customers", tokenB, java.util.Map.of(
                "name", "Mesma pessoa, outra empresa", "document", "52998224725", "email", "x@b.example")), 201);

        // and A's invoice is still open
        assertEquals("OPEN", call(getWith("/invoices/" + invoiceId, tokenA), 200).get("status").asText());
    }

    @Test
    void visitorGetsItsOwnSandboxWithSampleData() throws Exception {
        JsonNode first = call(post("/auth/demo", null, java.util.Map.of()), 201);
        JsonNode second = call(post("/auth/demo", null, java.util.Map.of()), 201);
        assertTrue(first.get("demo").asBoolean());
        assertNotEquals(first.get("token").asText(), second.get("token").asText());

        String token = first.get("token").asText();
        assertEquals(6, call(getWith("/customers", token), 200).size());
        assertEquals(23, call(getWith("/invoices", token), 200).size());
        assertEquals(3, call(getWith("/invoices?status=OVERDUE", token), 200).size());

        // changes in one sandbox do not appear in the other
        call(post("/customers", token, java.util.Map.of("name", "Só neste", "document", "12.345.678/0001-95", "email", "a@b.example")), 201);
        assertEquals(7, call(getWith("/customers", token), 200).size());
        assertEquals(6, call(getWith("/customers", second.get("token").asText()), 200).size());
    }
}
