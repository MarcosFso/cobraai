package com.billing.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** An administrator resets someone's password; the person must choose a new one before using anything else. */
@SpringBootTest(properties = {"app.outbox.enabled=false", "app.topics.create=false"})
@AutoConfigureMockMvc
@Testcontainers
class PasswordResetIntegrationTest {

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

    private MockHttpServletRequestBuilder req(String method, String url, String token, Object body) throws Exception {
        MockHttpServletRequestBuilder request = MockMvcRequestBuilders.request(HttpMethod.valueOf(method), url);
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        }
        return token == null ? request : request.header("Authorization", "Bearer " + token);
    }

    private static String email(String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@example.test";
    }

    private JsonNode register(String company, String email) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        if (company != null) {
            body.put("company", company);
        }
        body.put("email", email);
        body.put("password", "senha-forte-123");
        return call(req("POST", "/auth/register", null, body), 201);
    }

    /** A company with an administrator and one member; returns {adminToken, memberToken, memberId, memberEmail}. */
    private String[] companyWithMember() throws Exception {
        String adminToken = register("Empresa Senha", email("admin")).get("token").asText();
        String memberEmail = email("func");
        String waiting = register(null, memberEmail).get("token").asText();
        call(req("POST", "/team", adminToken, Map.of("email", memberEmail)), 201);
        String memberToken = call(req("GET", "/auth/me", waiting, null), 200).get("token").asText();
        String memberId = null;
        for (JsonNode m : call(req("GET", "/team", adminToken, null), 200)) {
            if (m.get("email").asText().equals(memberEmail)) {
                memberId = m.get("id").asText();
            }
        }
        return new String[] {adminToken, memberToken, memberId, memberEmail};
    }

    private JsonNode login(String email, String password, int expected) throws Exception {
        return call(req("POST", "/auth/login", null, Map.of("email", email, "password", password)), expected);
    }

    @Test
    void fullFlowFromResetToTheNewPassword() throws Exception {
        String[] c = companyWithMember();
        call(req("GET", "/customers", c[1], null), 200);

        JsonNode reset = call(req("POST", "/team/" + c[2] + "/reset-password", c[0], null), 200);
        String temp = reset.get("temporaryPassword").asText();
        assertEquals(12, temp.length());

        // the admin sees that this person has a pending reset
        for (JsonNode m : call(req("GET", "/team", c[0], null), 200)) {
            if (m.get("id").asText().equals(c[2])) {
                assertTrue(m.get("passwordResetPending").asBoolean());
            }
        }

        // the old password and the old token stop working at once
        login(c[3], "senha-forte-123", 401);
        call(req("GET", "/customers", c[1], null), 401);

        // the temporary password logs in, but only to change it: no company in the token, nothing opens
        JsonNode first = login(c[3], temp, 200);
        assertTrue(first.get("mustChangePassword").asBoolean());
        String tempToken = first.get("token").asText();
        call(req("GET", "/customers", tempToken, null), 401);
        call(req("GET", "/invoices", tempToken, null), 401);
        JsonNode me = call(req("GET", "/auth/me", tempToken, null), 200);
        assertTrue(me.get("mustChangePassword").asBoolean());

        // choosing the new password
        call(req("POST", "/auth/password", tempToken, Map.of("currentPassword", "errada-errada", "newPassword", "nova-senha-forte-1")), 400);
        call(req("POST", "/auth/password", tempToken, Map.of("currentPassword", temp, "newPassword", "curta")), 400);
        call(req("POST", "/auth/password", tempToken, Map.of("currentPassword", temp, "newPassword", temp)), 400);
        JsonNode changed = call(req("POST", "/auth/password", tempToken, Map.of("currentPassword", temp, "newPassword", "nova-senha-forte-1")), 200);
        assertFalse(changed.get("mustChangePassword").asBoolean());
        call(req("GET", "/customers", changed.get("token").asText(), null), 200);

        // from now on only the new password works, and the flag is gone
        login(c[3], temp, 401);
        assertFalse(login(c[3], "nova-senha-forte-1", 200).get("mustChangePassword").asBoolean());
    }

    @Test
    void onlyAnAdministratorOfTheSameCompanyCanReset() throws Exception {
        String[] c = companyWithMember();
        // a member cannot reset anyone
        call(req("POST", "/team/" + c[2] + "/reset-password", c[1], null), 403);
        // another company's administrator sees nothing (404), and the target keeps their password
        String otherAdmin = register("Outra Empresa", email("outro")).get("token").asText();
        call(req("POST", "/team/" + c[2] + "/reset-password", otherAdmin, null), 404);
        login(c[3], "senha-forte-123", 200);
        // no login at all
        call(req("POST", "/team/" + c[2] + "/reset-password", null, null), 401);
    }

    @Test
    void anAdministratorCannotResetTheirOwnPasswordHere() throws Exception {
        String[] c = companyWithMember();
        String selfId = null;
        for (JsonNode m : call(req("GET", "/team", c[0], null), 200)) {
            if (m.get("you").asBoolean()) {
                selfId = m.get("id").asText();
            }
        }
        call(req("POST", "/team/" + selfId + "/reset-password", c[0], null), 400);
    }

    @Test
    void temporaryPasswordsDifferEveryTime() throws Exception {
        String[] c = companyWithMember();
        String first = call(req("POST", "/team/" + c[2] + "/reset-password", c[0], null), 200).get("temporaryPassword").asText();
        String second = call(req("POST", "/team/" + c[2] + "/reset-password", c[0], null), 200).get("temporaryPassword").asText();
        assertNotEquals(first, second);
        login(c[3], first, 401); // the first one was replaced by the second
        login(c[3], second, 200);
    }

    @Test
    void anyoneCanChangeTheirOwnPasswordWhenLoggedIn() throws Exception {
        String email = email("dono");
        String token = register("Empresa Troca", email).get("token").asText();
        call(req("POST", "/auth/password", token, Map.of("currentPassword", "senha-forte-123", "newPassword", "outra-senha-forte-9")), 200);
        login(email, "senha-forte-123", 401);
        login(email, "outra-senha-forte-9", 200);
        call(req("POST", "/auth/password", null, Map.of("currentPassword", "x", "newPassword", "y")), 401);
    }
}
