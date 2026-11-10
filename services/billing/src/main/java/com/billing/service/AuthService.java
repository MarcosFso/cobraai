package com.billing.service;

import com.billing.domain.AppUser;
import com.billing.domain.Organization;
import com.billing.domain.OrganizationRepository;
import com.billing.domain.Role;
import com.billing.domain.UserRepository;
import com.billing.error.BusinessRuleException;
import com.billing.error.ConflictException;
import com.billing.error.UnauthorizedException;
import com.billing.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
public class AuthService {

    /** {@code company} and {@code role} are null while the person waits for an administrator to add them. */
    public record AuthResult(String token, String email, String company, boolean demo, String role, boolean pending,
                             boolean mustChangePassword) {
    }

    /** Active demo sandboxes are capped, so nobody can fill the database by pressing the visitor button in a loop. */
    public static final int MAX_DEMO_SANDBOXES = 300;

    private final UserRepository users;
    private final OrganizationRepository organizations;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwt;
    private final DemoService demo;
    // A real BCrypt hash of a random string: compared when the e-mail does not exist, so a wrong e-mail and a wrong
    // password take the same time and the answer does not reveal which e-mails have an account.
    private final String dummyHash;

    public AuthService(UserRepository users, OrganizationRepository organizations, PasswordEncoder passwordEncoder,
                       JwtService jwt, DemoService demo) {
        this.users = users;
        this.organizations = organizations;
        this.passwordEncoder = passwordEncoder;
        this.jwt = jwt;
        this.demo = demo;
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /**
     * Creates an account. With a company name it also creates the company and makes the person its administrator.
     * Without one, the account waits ("aguardando liberação") until an administrator of an existing company adds it.
     */
    @Transactional
    public AuthResult register(String company, String email, String password) {
        String normalizedEmail = email == null ? "" : email.trim().toLowerCase();
        if (!normalizedEmail.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$") || normalizedEmail.length() > 160) {
            throw new BusinessRuleException("E-mail inválido");
        }
        validatePassword(password);
        String name = company == null ? "" : company.trim();
        if (users.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new ConflictException("Já existe uma conta com esse e-mail");
        }

        if (name.isEmpty()) {
            AppUser waiting = users.save(new AppUser(null, Role.MEMBER, normalizedEmail, passwordEncoder.encode(password)));
            return result(waiting, null);
        }
        Organization org = organizations.save(new Organization(name.length() > 120 ? name.substring(0, 120) : name, false));
        AppUser user = users.save(new AppUser(org.getId(), Role.ADMIN, normalizedEmail, passwordEncoder.encode(password)));
        return result(user, org);
    }

    @Transactional(readOnly = true)
    public AuthResult login(String email, String password) {
        String normalizedEmail = email == null ? "" : email.trim().toLowerCase();
        AppUser user = users.findByEmailIgnoreCase(normalizedEmail).orElse(null);
        String hash = user == null ? dummyHash : user.getPasswordHash();
        boolean matches = password != null && passwordEncoder.matches(password, hash);
        if (user == null || !matches) {
            throw new UnauthorizedException("E-mail ou senha incorretos.");
        }
        return result(user, organizationOf(user));
    }

    /** "Entrar como visitante": a brand new sandbox company with sample data, owned by nobody who can log in again. */
    @Transactional
    public AuthResult startDemo() {
        if (organizations.countByDemoTrue() >= MAX_DEMO_SANDBOXES) {
            throw new BusinessRuleException("Há muitas demonstrações ativas agora. Tente de novo em alguns minutos.");
        }
        Organization org = organizations.save(new Organization("Empresa Demonstração", true));
        String email = "visitante-" + UUID.randomUUID().toString().substring(0, 8) + "@demo.invalid";
        AppUser user = users.save(new AppUser(org.getId(), Role.ADMIN, email, passwordEncoder.encode(UUID.randomUUID().toString())));
        demo.seed(org.getId());
        return result(user, org);
    }

    private static void validatePassword(String password) {
        if (password == null || password.length() < 8) {
            throw new BusinessRuleException("A senha precisa ter pelo menos 8 caracteres");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) { // BCrypt only reads the first 72 bytes
            throw new BusinessRuleException("A senha pode ter no máximo 72 caracteres");
        }
    }

    /**
     * The person chooses a new password, proving they know the current one (the temporary one, after an
     * administrator's reset). Returns a normal login, since the person is now free to use the system.
     */
    @Transactional
    public AuthResult changePassword(UUID userId, String currentPassword, String newPassword) {
        AppUser user = users.findById(userId).orElseThrow(() -> new UnauthorizedException("Conta não encontrada. Entre de novo."));
        if (currentPassword == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BusinessRuleException("A senha atual está incorreta");
        }
        validatePassword(newPassword);
        if (newPassword.equals(currentPassword)) {
            throw new BusinessRuleException("A nova senha precisa ser diferente da atual");
        }
        user.changePassword(passwordEncoder.encode(newPassword));
        users.saveAndFlush(user);
        return result(user, organizationOf(user));
    }

    /** The caller's current state, read from the database: a new token comes back when the token no longer matches it. */
    @Transactional(readOnly = true)
    public AuthResult refresh(UUID userId) {
        AppUser user = users.findById(userId).orElseThrow(() -> new UnauthorizedException("Conta não encontrada. Entre de novo."));
        return result(user, organizationOf(user));
    }

    private Organization organizationOf(AppUser user) {
        if (user.getOrgId() == null) {
            return null;
        }
        return organizations.findById(user.getOrgId()).orElse(null);
    }

    private AuthResult result(AppUser user, Organization org) {
        // While the password must be changed the token carries no company, so the report and notification
        // services refuse it just like they refuse an account waiting for a company.
        boolean mustChange = user.isMustChangePassword();
        return new AuthResult(jwt.issue(user, mustChange ? null : org), user.getEmail(), org == null ? null : org.getName(),
                org != null && org.isDemo(), org == null ? null : user.getRole().name(), org == null, mustChange);
    }
}
