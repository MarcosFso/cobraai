package com.billing.web;

import com.billing.job.RecurringJob;
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Several users per company, and monthly charges, through the real HTTP layer and security. */
@SpringBootTest(properties = {"app.outbox.enabled=false", "app.topics.create=false", "app.rate-limit.login-per-minute=100000", "app.rate-limit.register-per-minute=100000", "app.rate-limit.demo-per-minute=100000"})
@AutoConfigureMockMvc
@Testcontainers
class TeamAndRecurringIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired RecurringJob recurringJob;

    private JsonNode call(MockHttpServletRequestBuilder request, int expectedStatus) throws Exception {
        MvcResult result = mvc.perform(request).andExpect(status().is(expectedStatus)).andReturn();
        String body = result.getResponse().getContentAsString();
        return body.isBlank() ? json.createObjectNode() : json.readTree(body);
    }

    private MockHttpServletRequestBuilder req(String method, String url, String token, Object body) throws Exception {
        MockHttpServletRequestBuilder request = MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method), url);
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        }
        return token == null ? request : request.header("Authorization", "Bearer " + token);
    }

    private JsonNode register(String company, String email) throws Exception {
        Map<String, Object> body = new HashMap<>();
        if (company != null) {
            body.put("company", company);
        }
        body.put("email", email);
        body.put("password", "senha-forte-123");
        return call(req("POST", "/auth/register", null, body), 201);
    }

    private static String email(String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@example.test";
    }

    private String newCustomer(String token) throws Exception {
        // a fixed CNPJ is enough: the same document may be a customer of every company
        return call(req("POST", "/customers", token, Map.of("name", "Cliente", "document", "11222333000181",
                "email", "c@example.test")), 201).get("id").asText();
    }

    @Test
    void accountWithoutCompanyWaitsUntilAnAdministratorAddsIt() throws Exception {
        JsonNode admin = register("Empresa Equipe", email("admin"));
        assertEquals("ADMIN", admin.get("role").asText());
        newCustomer(admin.get("token").asText());

        String memberEmail = email("func");
        JsonNode waiting = register(null, memberEmail);
        assertTrue(waiting.get("pending").asBoolean());
        String oldToken = waiting.get("token").asText();

        // no company yet: no data at all
        call(req("GET", "/customers", oldToken, null), 401);
        JsonNode me = call(req("GET", "/auth/me", oldToken, null), 200);
        assertTrue(me.get("pending").asBoolean());
        assertNull(me.get("token"));

        // the administrator adds the e-mail
        call(req("POST", "/team", admin.get("token").asText(), Map.of("email", memberEmail)), 201);

        // the old token still has no company, but /auth/me hands out a fresh one that works
        call(req("GET", "/customers", oldToken, null), 401);
        JsonNode refreshed = call(req("GET", "/auth/me", oldToken, null), 200);
        assertFalse(refreshed.get("pending").asBoolean());
        assertEquals("MEMBER", refreshed.get("role").asText());
        String freshToken = refreshed.get("token").asText();
        assertEquals(1, call(req("GET", "/customers", freshToken, null), 200).size()); // sees the company's customer
        assertEquals(2, call(req("GET", "/team", freshToken, null), 200).size());

        // a member sees the company's data but cannot manage people
        call(req("POST", "/team", freshToken, Map.of("email", email("outro"))), 403);
    }

    @Test
    void removedMemberLosesAccessImmediatelyEvenWithAValidToken() throws Exception {
        JsonNode admin = register("Empresa Remocao", email("admin"));
        String adminToken = admin.get("token").asText();
        newCustomer(adminToken);

        String memberEmail = email("func");
        String oldToken = register(null, memberEmail).get("token").asText();
        call(req("POST", "/team", adminToken, Map.of("email", memberEmail)), 201);
        String memberToken = call(req("GET", "/auth/me", oldToken, null), 200).get("token").asText();
        call(req("GET", "/invoices", memberToken, null), 200);

        String memberId = null;
        for (JsonNode m : call(req("GET", "/team", adminToken, null), 200)) {
            if (m.get("email").asText().equals(memberEmail)) {
                memberId = m.get("id").asText();
            }
        }
        assertNotNull(memberId);
        call(req("DELETE", "/team/" + memberId, adminToken, null), 204);

        call(req("GET", "/invoices", memberToken, null), 401); // same token as before, no longer allowed
        call(req("GET", "/customers/" + UUID.randomUUID(), memberToken, null), 401);
        JsonNode me = call(req("GET", "/auth/me", memberToken, null), 200);
        assertTrue(me.get("pending").asBoolean()); // the account survives, without a company
    }

    @Test
    void cannotAddUnknownOrAlreadyAssignedAccountsAndGivesTheSameAnswer() throws Exception {
        JsonNode a = register("Empresa A", email("a"));
        String otherEmail = email("b");
        register("Empresa B", otherEmail);

        JsonNode unknown = call(req("POST", "/team", a.get("token").asText(), Map.of("email", email("naoexiste"))), 404);
        JsonNode assigned = call(req("POST", "/team", a.get("token").asText(), Map.of("email", otherEmail)), 404);
        assertEquals(unknown.get("detail").asText(), assigned.get("detail").asText());
    }

    @Test
    void administratorRulesAreEnforced() throws Exception {
        JsonNode admin = register("Empresa Regras", email("admin"));
        String adminToken = admin.get("token").asText();

        JsonNode members = call(req("GET", "/team", adminToken, null), 200);
        String selfId = members.get(0).get("id").asText();
        assertTrue(members.get(0).get("you").asBoolean());

        call(req("DELETE", "/team/" + selfId, adminToken, null), 400); // cannot remove yourself
        call(req("PUT", "/team/" + selfId + "/role", adminToken, Map.of("role", "MEMBER")), 400); // last administrator

        String second = email("segundo");
        String secondToken = register(null, second).get("token").asText();
        call(req("POST", "/team", adminToken, Map.of("email", second, "role", "ADMIN")), 201);
        String promoted = call(req("GET", "/auth/me", secondToken, null), 200).get("token").asText();
        call(req("POST", "/team", promoted, Map.of("email", email("terceiro"))), 404); // now an administrator: gets past the 403
        call(req("PUT", "/team/" + selfId + "/role", promoted, Map.of("role", "MEMBER")), 200); // two admins: allowed
    }

    @Test
    void membersOfOtherCompaniesAreNeverVisibleOrRemovable() throws Exception {
        JsonNode a = register("Empresa A2", email("a"));
        JsonNode b = register("Empresa B2", email("b"));
        String bId = call(req("GET", "/team", b.get("token").asText(), null), 200).get(0).get("id").asText();

        assertEquals(1, call(req("GET", "/team", a.get("token").asText(), null), 200).size());
        call(req("DELETE", "/team/" + bId, a.get("token").asText(), null), 404);
        call(req("PUT", "/team/" + bId + "/role", a.get("token").asText(), Map.of("role", "MEMBER")), 404);
    }

    @Test
    void recurringChargeIssuesTheFirstInvoiceNowAndTheNextOnesLater() throws Exception {
        String token = register("Empresa Recorrente", email("rec")).get("token").asText();
        String customerId = newCustomer(token);
        LocalDate firstDue = LocalDate.now().plusDays(10);

        JsonNode first = call(req("POST", "/recurring", token, Map.of("customerId", customerId, "description",
                "Honorarios mensais", "amountCents", 150000, "firstDueDate", firstDue.toString())), 201);
        assertTrue(first.get("recurring").asBoolean());
        assertEquals(firstDue.toString(), first.get("dueDate").asText());
        assertEquals(1, call(req("GET", "/invoices", token, null), 200).size());

        JsonNode list = call(req("GET", "/recurring", token, null), 200);
        assertEquals(1, list.size());
        assertEquals(firstDue.getDayOfMonth(), list.get(0).get("dayOfMonth").asInt());
        assertTrue(list.get(0).get("active").asBoolean());
        String recurringId = list.get(0).get("id").asText();

        // the job looking only a few days ahead has nothing to do: the second invoice is a month away
        recurringJob.runUntil(LocalDate.now().plusDays(5));
        assertEquals(1, call(req("GET", "/invoices", token, null), 200).size());

        // two months ahead: the invoices of the next months are issued, once each
        recurringJob.runUntil(LocalDate.now().plusDays(75));
        int afterFirstRun = call(req("GET", "/invoices", token, null), 200).size();
        assertTrue(afterFirstRun >= 3, "expected at least 3 invoices, got " + afterFirstRun);
        recurringJob.runUntil(LocalDate.now().plusDays(75));
        assertEquals(afterFirstRun, call(req("GET", "/invoices", token, null), 200).size()); // idempotent

        // stopping keeps the issued invoices and issues no more
        JsonNode stopped = call(req("POST", "/recurring/" + recurringId + "/stop", token, null), 200);
        assertFalse(stopped.get("active").asBoolean());
        recurringJob.runUntil(LocalDate.now().plusDays(400));
        assertEquals(afterFirstRun, call(req("GET", "/invoices", token, null), 200).size());
    }

    @Test
    void recurringChargesOfOneCompanyAreInvisibleToAnother() throws Exception {
        String tokenA = register("Empresa R-A", email("ra")).get("token").asText();
        String tokenB = register("Empresa R-B", email("rb")).get("token").asText();
        String customerA = newCustomer(tokenA);
        call(req("POST", "/recurring", tokenA, Map.of("customerId", customerA, "description", "Mensal",
                "amountCents", 5000, "firstDueDate", LocalDate.now().plusDays(3).toString())), 201);
        String recurringId = call(req("GET", "/recurring", tokenA, null), 200).get(0).get("id").asText();

        assertEquals(0, call(req("GET", "/recurring", tokenB, null), 200).size());
        call(req("POST", "/recurring/" + recurringId + "/stop", tokenB, null), 404);
        call(req("POST", "/recurring", tokenB, Map.of("customerId", customerA, "description", "x",
                "amountCents", 5000, "firstDueDate", LocalDate.now().plusDays(3).toString())), 404);
    }

    @Test
    void recurringRejectsPastDatesAndZeroAmounts() throws Exception {
        String token = register("Empresa Validacao", email("v")).get("token").asText();
        String customerId = newCustomer(token);
        call(req("POST", "/recurring", token, Map.of("customerId", customerId, "description", "x",
                "amountCents", 5000, "firstDueDate", LocalDate.now().minusDays(1).toString())), 400);
        call(req("POST", "/recurring", token, Map.of("customerId", customerId, "description", "x",
                "amountCents", 0, "firstDueDate", LocalDate.now().plusDays(1).toString())), 400);
    }
}
