package com.billing.service;

import com.billing.domain.AppUser;
import com.billing.domain.Organization;
import com.billing.domain.OrganizationRepository;
import com.billing.domain.Role;
import com.billing.domain.UserRepository;
import com.billing.error.BusinessRuleException;
import com.billing.error.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * The people of a company. A person first creates an ordinary account (with no company), then an administrator adds
 * that e-mail to the company, and from then on the person sees the company's data. Every method receives the
 * administrator's company from the verified login, never from the request.
 */
@Service
public class TeamService {

    private static final Logger log = LoggerFactory.getLogger(TeamService.class);

    private final UserRepository users;
    private final OrganizationRepository organizations;

    public TeamService(UserRepository users, OrganizationRepository organizations) {
        this.users = users;
        this.organizations = organizations;
    }

    @Transactional(readOnly = true)
    public List<AppUser> list(UUID orgId) {
        return users.findByOrgIdOrderByEmailAsc(orgId);
    }

    /** Adds an existing account that has no company yet. */
    @Transactional
    public AppUser add(UUID orgId, String email, Role role) {
        if (organizations.findById(orgId).map(Organization::isDemo).orElse(false)) {
            throw new BusinessRuleException("A equipe não está disponível na demonstração. Crie uma conta para usar.");
        }
        String normalized = email == null ? "" : email.trim().toLowerCase();
        // The same answer whether the e-mail has no account or the account already belongs to a company, so an
        // administrator cannot use this form to discover which e-mails are customers of the platform.
        AppUser user = users.findByEmailIgnoreCase(normalized).filter(u -> u.getOrgId() == null)
                .orElseThrow(() -> new NotFoundException(
                        "Não há uma conta aguardando liberação com esse e-mail. Peça para a pessoa criar a conta (sem nome de empresa) e tente de novo."));
        user.joinOrg(orgId, role == null ? Role.MEMBER : role);
        log.info("Team member added userId={} orgId={} role={}", user.getId(), orgId, user.getRole());
        return users.saveAndFlush(user);
    }

    @Transactional
    public void remove(UUID orgId, UUID actorId, UUID userId) {
        if (actorId.equals(userId)) {
            throw new BusinessRuleException("Você não pode remover a si mesmo. Peça a outro administrador.");
        }
        AppUser user = users.findByIdAndOrgId(userId, orgId).orElseThrow(() -> new NotFoundException("Pessoa não encontrada"));
        user.leaveOrg();
        users.saveAndFlush(user);
        log.info("Team member removed userId={} orgId={}", userId, orgId);
    }

    @Transactional
    public AppUser changeRole(UUID orgId, UUID userId, Role role) {
        AppUser user = users.findByIdAndOrgId(userId, orgId).orElseThrow(() -> new NotFoundException("Pessoa não encontrada"));
        if (user.getRole() == Role.ADMIN && role != Role.ADMIN && users.countByOrgIdAndRole(orgId, Role.ADMIN) <= 1) {
            throw new BusinessRuleException("A empresa precisa de pelo menos um administrador");
        }
        user.changeRole(role);
        return users.saveAndFlush(user);
    }
}
