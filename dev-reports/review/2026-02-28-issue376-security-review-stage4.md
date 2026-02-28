# Architecture Review Report: Issue #376 - Stage 4 Security Review

## Review Metadata

| Item | Value |
|------|-------|
| Issue | #376 - External Apps proxy pathPrefix preservation fix |
| Stage | 4 - Security Review |
| Focus | OWASP Top 10 compliance, path traversal, SSRF, header injection, new risk assessment |
| Date | 2026-02-28 |
| Score | 9/10 |
| Reviewer | architecture-review-agent |

## Review Scope

### Target Files
- `src/app/proxy/[...path]/route.ts` - Proxy route handler (bug fix target)
- `src/lib/proxy/handler.ts` - HTTP proxy handler (comment/JSDoc updates)
- `src/lib/proxy/logger.ts` - Proxy logger (log message fix, JSDoc updates)
- `src/lib/proxy/config.ts` - Proxy configuration constants

### Related Files Reviewed
- `src/middleware.ts` - Authentication middleware
- `src/lib/external-apps/validation.ts` - Input validation
- `src/lib/external-apps/cache.ts` - External app cache
- `src/lib/external-apps/interfaces.ts` - Interface definitions
- `src/lib/external-apps/db.ts` - Database operations
- `src/types/external-apps.ts` - Type definitions

---

## Executive Summary

Issue #376 modifies the proxy path construction logic in `route.ts` to preserve `pathPrefix` when forwarding requests to upstream applications. The modification changes a single line from `const path = '/' + rest.join('/')` to `const path = '/proxy/' + pathSegments.join('/')`, along with corresponding log message fixes in `logger.ts` and JSDoc/comment updates in `handler.ts`.

The security review confirms that this modification does not introduce any new security vulnerabilities. The existing multi-layered defense mechanisms (pathPrefix regex validation, targetHost whitelist, port range restrictions, hop-by-hop header removal, timeout control, authentication middleware) remain fully intact and are not affected by the change.

Three low-severity advisory items were identified as pre-existing conditions, not introduced by this modification.

---

## Security Analysis

### 1. Path Traversal Attack Risk

**Status: PASS - No risk identified**

The proxy module is protected against path traversal attacks (`/proxy/../../etc/passwd` etc.) through multiple defense layers:

1. **Next.js catch-all route parsing**: The `[...path]` route handler receives `pathSegments` as a pre-parsed string array. Next.js normalizes URL path segments, removing `.` and `..` traversals during parsing.

2. **pathPrefix validation at registration**: The `PATH_PREFIX_PATTERN` (`/^[a-zA-Z0-9-]+$/`) in `src/lib/external-apps/validation.ts:31` ensures that only alphanumeric characters and hyphens can be used as pathPrefix values. Characters like `.`, `/`, `%`, and spaces are rejected at DB registration time.

3. **Exact match lookup**: `cache.getByPathPrefix(pathPrefix)` performs an exact string match against DB-registered pathPrefix values. Unregistered prefixes return null, resulting in a 404 response.

4. **Fixed prefix concatenation**: The modified path construction (`'/proxy/' + pathSegments.join('/')`) prepends a fixed string. Even if pathSegments contained traversal sequences, they would be treated as literal path segments in the upstream URL.

**Modification impact**: The change from `'/' + rest.join('/')` to `'/proxy/' + pathSegments.join('/')` does not weaken any of these defense layers. The path is still constructed from the same pre-parsed segments.

### 2. SSRF (Server Side Request Forgery) Risk

**Status: PASS - No risk identified**

SSRF is prevented through strict constraints on upstream connection parameters:

1. **targetHost whitelist**: `VALID_TARGET_HOSTS = ['localhost', '127.0.0.1']` in `validation.ts:25` limits upstream connections to loopback addresses only. External host forwarding is impossible.

2. **targetPort range**: `PORT_CONSTRAINTS = { MIN: 1024, MAX: 65535 }` in `validation.ts:14-19` prevents access to privileged ports.

3. **Fixed protocol**: `buildUpstreamUrl()` in `handler.ts:42` uses hardcoded `http://` protocol, preventing protocol smuggling.

4. **Static configuration**: The upstream target (host:port) is determined by the ExternalApp DB record, not by request parameters. An attacker cannot influence the upstream destination through proxy request manipulation.

**Modification impact**: The path change only affects the URL path component, not the host, port, or protocol. SSRF defenses are unaffected.

### 3. Header Injection Risk

**Status: PASS - No risk identified**

Header injection is mitigated through hop-by-hop header removal:

1. **Request header filtering** (`handler.ts:61-68`): Removes `host`, `connection`, `keep-alive`, `transfer-encoding`, `te`, `trailer`, `upgrade` from proxied requests.

2. **Response header filtering** (`handler.ts:87-94`): Removes `transfer-encoding`, `connection`, `keep-alive` from proxied responses.

3. **Centralized configuration**: Header lists are managed in `config.ts` as `HOP_BY_HOP_REQUEST_HEADERS` and `HOP_BY_HOP_RESPONSE_HEADERS`.

This prevents:
- Host header injection for upstream impersonation
- Transfer-Encoding manipulation for HTTP desync attacks
- Connection state confusion through hop-by-hop header forwarding

**Modification impact**: No changes to header processing logic.

### 4. New Security Risks from Modification

**Status: PASS - No new risks introduced**

The modification consists of:
- `route.ts:31`: Path construction change (1 line)
- `logger.ts:60,88`: Log message format change (remove double prefix)
- `handler.ts:40-41`: Comment update
- `handler.ts:50`: JSDoc update
- `logger.ts:25,52,79`: JSDoc updates

None of these changes affect security-critical code paths (authentication, validation, header processing, timeout control).

### 5. OWASP Top 10 Compliance

| OWASP Category | Status | Notes |
|---------------|--------|-------|
| A01: Broken Access Control | PASS | Middleware auth covers /proxy/* paths, IP restriction applied |
| A02: Cryptographic Failures | N/A | No cryptographic operations in proxy module |
| A03: Injection | PASS | pathPrefix regex validation, SQL parameterized queries, fixed URL templates |
| A04: Insecure Design | PASS | SRP-compliant module separation, pure function design |
| A05: Security Misconfiguration | ADVISORY | SF4-001: error.message exposure in 502 response |
| A06: Vulnerable Components | N/A | Uses native fetch API, no external proxy dependencies |
| A07: Auth Failures | PASS | Middleware auth applies to all proxy routes |
| A08: Software Integrity | N/A | Not applicable to proxy module |
| A09: Logging Failures | ADVISORY | SF4-002: error.stack in production logs |
| A10: SSRF | PASS | targetHost whitelist, port range, static configuration |

---

## Findings

### Must Fix Items

None. No critical or high-severity security issues were identified.

### Should Fix Items

#### SF4-001: Error message exposure in 502 response (Low)

**OWASP**: A05:2021 - Security Misconfiguration

**Location**: `src/app/proxy/[...path]/route.ts:107`

**Issue**: The catch block returns `(error as Error).message` directly to the client. This may expose internal network details such as `connect ECONNREFUSED 127.0.0.1:3012`.

**Current code**:
```typescript
// src/app/proxy/[...path]/route.ts:106-109
return NextResponse.json(
  { error: 'Proxy error', message: (error as Error).message },
  { status: 502 }
);
```

**Recommended code**:
```typescript
return NextResponse.json(
  { error: 'Proxy error', message: 'Unable to connect to upstream application' },
  { status: 502 }
);
```

**Rationale**: Detailed error information is already logged via `logProxyError()` on line 104. The `proxyHttp()` function in `handler.ts` already uses `PROXY_ERROR_MESSAGES` constants for its error responses, so the `route.ts` catch block should follow the same pattern.

**Risk assessment**: Low. targetHost is restricted to localhost/127.0.0.1, limiting the information value to attackers. However, this is a general best practice improvement.

#### SF4-002: Stack trace in production logs (Low)

**OWASP**: A09:2021 - Security Logging and Monitoring Failures

**Location**: `src/lib/proxy/logger.ts:93`

**Issue**: `logProxyError()` includes `error.stack` in the log entry, which may contain internal file paths, module structure, and dependency version information.

**Current code**:
```typescript
// src/lib/proxy/logger.ts:88-94
logger.error(`[Proxy] ${method} /proxy/${pathPrefix}${path} failed: ${error.message}`, {
  pathPrefix,
  method,
  path,
  error: error.message,
  stack: error.stack,
});
```

**Rationale**: For CommandMate as a local development tool, this risk is minimal. However, if logs are forwarded to external aggregation services, stack traces could expose internal implementation details. Consider limiting stack trace output to development environments.

#### SF4-003: Internal URL exposure in WebSocket 426 response (Low)

**OWASP**: A01:2021 - Broken Access Control

**Location**: `src/lib/proxy/handler.ts:150-157`

**Issue**: The `proxyWebSocket()` function returns the internal `directWsUrl` (`ws://localhost:PORT/path`) in the 426 response body. This exposes the upstream application's internal host and port.

**Rationale**: This is a design decision for developer convenience (guiding WebSocket clients to direct connections). Given CommandMate's use case as a local development tool with targetHost restricted to localhost, the practical risk is minimal.

---

## Good Design Points

### GP4-001: Multi-layered path traversal defense

The proxy module implements defense-in-depth against path traversal through four independent layers: Next.js route parsing, pathPrefix regex validation (`/^[a-zA-Z0-9-]+$/`), DB exact-match lookup, and fixed prefix concatenation. Each layer independently prevents traversal attempts, so even if one layer were bypassed, the others would catch the attack.

### GP4-002: Robust SSRF prevention

The targetHost whitelist (`localhost`, `127.0.0.1`) and port range restriction (`1024-65535`) are enforced at the validation layer (`validation.ts`), ensuring that only safe upstream targets can be registered. The `buildUpstreamUrl()` pure function uses a fixed `http://` protocol. The upstream target is determined by DB configuration, not by request parameters.

### GP4-003: Proper hop-by-hop header handling

Both request and response directions properly filter hop-by-hop headers, with the header lists centralized in `config.ts`. This prevents HTTP desync attacks and header injection.

### GP4-004: Timeout-based DoS protection

The `AbortController` with 30-second timeout (`PROXY_TIMEOUT.DEFAULT_MS`) prevents resource exhaustion from slow upstream responses.

### GP4-005: Authentication coverage of proxy routes

The `middleware.ts` matcher configuration ensures that `/proxy/*` paths are subject to authentication and IP restriction checks, preventing unauthorized proxy access.

### GP4-006: Security posture unchanged by modification

The Issue #376 modification only affects path construction and logging logic. All security-critical code (validation, authentication, header processing, timeout control) is untouched.

### GP4-007: pathPrefix validation as structural injection prevention

The `PATH_PREFIX_PATTERN = /^[a-zA-Z0-9-]+$/` validation at registration time structurally prevents injection of special characters (`.`, `/`, `%`, `<`, `>`, spaces) through pathPrefix, eliminating path traversal, URL injection, and XSS payload injection through this vector.

---

## Risk Assessment Summary

| Risk Category | Pre-modification | Post-modification | Change |
|--------------|-----------------|-------------------|--------|
| Path Traversal | Low (multi-layer defense) | Low (multi-layer defense) | No change |
| SSRF | Low (whitelist + port range) | Low (whitelist + port range) | No change |
| Header Injection | Low (hop-by-hop removal) | Low (hop-by-hop removal) | No change |
| DoS | Low (timeout control) | Low (timeout control) | No change |
| Information Leakage | Low (SF4-001, SF4-002, SF4-003) | Low (SF4-001, SF4-002, SF4-003) | No change |
| Authentication Bypass | Low (middleware coverage) | Low (middleware coverage) | No change |

---

## Conclusion

The Issue #376 modification is a safe, security-neutral change. The existing security architecture of the proxy module is well-designed with multiple defense layers, and the modification does not weaken any of these layers. The three advisory items identified (SF4-001, SF4-002, SF4-003) are pre-existing conditions with low severity, particularly given CommandMate's use case as a local development tool. No Must Fix items were identified.

**Overall Score: 9/10**

The score reflects the strong existing security design of the proxy module and the fact that the modification introduces no new risks. The 1-point deduction is for the pre-existing advisory items (error message exposure, stack trace logging, internal URL exposure) which, while low-risk in this context, represent areas for incremental improvement.
