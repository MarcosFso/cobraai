package com.billing.web;

import com.billing.domain.AppUser;
import com.billing.security.CurrentUser;
import com.billing.service.TeamService;
import com.billing.web.Dtos.AddMemberRequest;
import com.billing.web.Dtos.MemberResponse;
import com.billing.web.Dtos.RoleRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** The people of the caller's company. Anyone in the company can see the list; only administrators change it. */
@RestController
@RequestMapping("/team")
public class TeamController {

    private final TeamService service;
    private final CurrentUser currentUser;

    public TeamController(TeamService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<MemberResponse> list() {
        AppUser me = currentUser.member();
        return service.list(me.getOrgId()).stream().map(u -> MemberResponse.from(u, me.getId())).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MemberResponse add(@Valid @RequestBody AddMemberRequest request) {
        AppUser admin = currentUser.admin();
        return MemberResponse.from(service.add(admin.getOrgId(), request.email(), request.role()), admin.getId());
    }

    @PutMapping("/{id}/role")
    public MemberResponse changeRole(@PathVariable UUID id, @Valid @RequestBody RoleRequest request) {
        AppUser admin = currentUser.admin();
        return MemberResponse.from(service.changeRole(admin.getOrgId(), id, request.role()), admin.getId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable UUID id) {
        AppUser admin = currentUser.admin();
        service.remove(admin.getOrgId(), admin.getId(), id);
    }
}
