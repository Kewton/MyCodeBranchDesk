# Architecture Review Report: Issue #376 - Stage 1 Design Principles

**Issue**: #376 - External Apps Proxy pathPrefix Fix
**Stage**: 1 (通常レビュー)
**Focus**: 設計原則 (SOLID / KISS / YAGNI / DRY)
**Date**: 2026-02-28
**Status**: Conditionally Approved
**Score**: 8/10

---

## Executive Summary

Issue #376 is a targeted bug fix for the proxy route handler that incorrectly strips the `pathPrefix` when forwarding requests to upstream applications. The design policy proposes a minimal 1-line code change in `route.ts` and a comment update in `handler.ts`, which aligns well with KISS and YAGNI principles.

The overall architecture of the proxy module is well-structured with clear separation of concerns. Two must-fix items were identified: an unused variable that will result from the proposed code change, and stale comments that contradict the corrected behavior. Two should-fix items address DRY improvements and test comment consistency.

---

## Review Targets

| File | Role |
|------|------|
| `src/app/proxy/[...path]/route.ts` | Proxy route handler (bug location) |
| `src/lib/proxy/handler.ts` | HTTP proxy core logic |
| `tests/unit/proxy/handler.test.ts` | Proxy handler unit tests |

---

## Design Principles Checklist

### SOLID Principles

| Principle | Status | Notes |
|-----------|--------|-------|
| Single Responsibility (SRP) | PASS | `route.ts` handles routing, `handler.ts` handles proxying, `config.ts` holds constants, `logger.ts` handles logging. Each module has a clear, focused responsibility. |
| Open/Closed (OCP) | PASS | Config constants are separated from core logic. Adding new proxy behaviors would not require modifying `handler.ts` internals. HTTP method handlers delegate to shared `handleProxy()`. |
| Liskov Substitution (LSP) | N/A | No inheritance hierarchies present. |
| Interface Segregation (ISP) | PASS | `ExternalApp` interface is well-scoped. `proxyHttp()` and `proxyWebSocket()` accept only the data they need. `ProxyLogEntry` is a focused interface. |
| Dependency Inversion (DIP) | PASS | `handler.ts` depends on types and config abstractions. No tight coupling to concrete implementations. |

### KISS Principle

| Item | Status | Notes |
|------|--------|-------|
| Minimal change approach | PASS | The fix targets exactly 1 line of code logic plus comment updates. No unnecessary abstractions introduced. |
| Unused variable after fix | FAIL | After changing line 31, the `rest` variable from the destructuring on line 30 becomes dead code. See SF1-001. |
| Simple path construction | PASS | `'/proxy/' + pathSegments.join('/')` is straightforward and easy to understand. |

### YAGNI Principle

| Item | Status | Notes |
|------|--------|-------|
| No premature abstractions | PASS | The fix does not introduce any new abstractions, classes, or patterns beyond what is needed. |
| No speculative features | PASS | The design policy explicitly scopes the change to the minimum required fix. |
| Proportional to problem | PASS | A 1-line bug produces a 1-line fix. |

### DRY Principle

| Item | Status | Notes |
|------|--------|-------|
| Shared handleProxy() | PASS | All 5 HTTP method exports delegate to a single `handleProxy()` function. |
| LogEntry construction | MINOR | Two nearly identical `ProxyLogEntry` construction blocks in `handleProxy()` (lines 68-77 and 86-98). See SF1-004. |
| Comment consistency | MINOR | Multiple comments across `handler.ts` and `handler.test.ts` describe the old behavior. See SF1-002 and SF1-003. |

---

## Findings

### Must Fix (2 items)

#### SF1-001: Unused `rest` variable after fix (KISS violation)

- **File**: `/Users/maenokota/share/work/github_kewton/commandmate-issue-376/src/app/proxy/[...path]/route.ts`
- **Line**: 30
- **Current code**:
  ```typescript
  const [pathPrefix, ...rest] = pathSegments;
  const path = '/' + rest.join('/');
  ```
- **After proposed fix**:
  ```typescript
  const [pathPrefix, ...rest] = pathSegments;  // rest is now unused
  const path = '/proxy/' + pathSegments.join('/');
  ```
- **Impact**: ESLint `no-unused-vars` rule violation will cause CI failure. Dead code violates KISS principle.
- **Recommendation**: Change the destructuring to remove `rest`:
  ```typescript
  const [pathPrefix] = pathSegments;
  const path = '/proxy/' + pathSegments.join('/');
  ```
  Or use direct indexing:
  ```typescript
  const pathPrefix = pathSegments[0];
  const path = '/proxy/' + pathSegments.join('/');
  ```

#### SF1-002: Stale comments in `handler.ts` contradict corrected behavior

- **File**: `/Users/maenokota/share/work/github_kewton/commandmate-issue-376/src/lib/proxy/handler.ts`
- **Lines**: 40-41
- **Current comments**:
  ```typescript
  // Strip the path prefix and forward to the upstream app's root
  // This allows upstream apps to work without special basePath configuration
  ```
- **Impact**: After the fix, the behavior is the opposite -- the path prefix is preserved. Misleading comments are a maintenance hazard and violate the principle that code should be self-documenting.
- **Recommendation**: Update to the comments specified in the design policy:
  ```typescript
  // Forward the full path including proxy prefix to the upstream
  // Upstream apps must be configured with basePath: '/proxy/{pathPrefix}'
  ```

### Should Fix (2 items)

#### SF1-003: Test file comments describe old behavior

- **File**: `/Users/maenokota/share/work/github_kewton/commandmate-issue-376/tests/unit/proxy/handler.test.ts`
- **Lines**: 160-161, 230-231, 244, 259
- **Description**: Multiple comments in the test file refer to "strips the proxy prefix" and "without proxy prefix", which describes the buggy behavior. While the test assertions for `buildUpstreamUrl` remain valid (the function simply concatenates host:port with path), the contextual comments create confusion.
- **Recommendation**: Update comments to reflect the corrected architecture:
  - Line 160-161: "buildUpstreamUrl forwards the full path to upstream"
  - Line 230-231: Same update
  - Line 244: "Path is forwarded as-is to upstream"
  - Line 259: "Query strings are preserved in forwarded path"

#### SF1-004: Duplicated ProxyLogEntry construction in `route.ts` (DRY)

- **File**: `/Users/maenokota/share/work/github_kewton/commandmate-issue-376/src/app/proxy/[...path]/route.ts`
- **Lines**: 68-77, 86-98
- **Description**: The WebSocket and HTTP branches construct nearly identical `ProxyLogEntry` objects with only `isWebSocket` and optional `error` differing. This structural duplication could be extracted into a helper.
- **Recommendation**: This is outside the scope of Issue #376's minimal fix. Create a follow-up issue for refactoring `handleProxy()` to extract a `createLogEntry()` helper function. For now, this is acceptable.

---

## Risk Assessment

| Risk Type | Content | Impact | Probability | Priority |
|-----------|---------|--------|-------------|----------|
| Technical | ESLint failure from unused `rest` variable | High | High | P1 |
| Maintenance | Stale comments misleading future developers | Medium | High | P1 |
| Technical | Missing route.test.ts integration tests | Medium | Medium | P2 |

---

## Good Points

1. The fix follows a minimal-change philosophy that aligns with KISS and YAGNI principles
2. `buildUpstreamUrl()` is a pure function with high testability and clear SRP
3. The proxy module is well-decomposed into config/handler/logger/index with clean separation of concerns
4. The design policy document explicitly analyzes backward compatibility impact and references the original Issue #42 design
5. The five HTTP method handlers share a single `handleProxy()` function, demonstrating good DRY practice
6. `ExternalApp` interface is well-defined with ISP-compliant usage in the proxy layer
7. Constants are properly extracted into `config.ts`, supporting OCP
8. No premature optimization or over-engineering detected

---

## Conclusion

The proposed fix for Issue #376 is architecturally sound and follows design principles well. The two must-fix items (SF1-001 and SF1-002) are straightforward to address and do not require design changes. SF1-001 in particular is critical because it will cause CI failure if not addressed. The should-fix items are minor improvements that can be deferred to follow-up work.

**Approval**: Conditionally approved -- proceed after addressing SF1-001 and SF1-002.
