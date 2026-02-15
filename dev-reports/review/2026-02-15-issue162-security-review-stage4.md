# Security Review (Stage 4): Issue #162 File Enhancement

**Review Date**: 2026-02-15
**Reviewer**: Architecture Review Agent
**Issue**: #162 File Enhancement (Move / Creation Time / Copy)
**Design Document**: `dev-reports/design/issue-162-file-enhancement-design-policy.md`
**Score**: 4/5
**Status**: Conditional Approval

---

## 1. Review Scope

This review evaluates the design policy for Issue #162 against OWASP Top 10 2021 criteria and additional security concerns specific to file system operations. The three features under review are:

1. File/directory move functionality
2. File creation time (birthtime) display
3. File content copy to clipboard

---

## 2. OWASP Top 10 2021 Assessment Summary

| Category | Status | Key Findings |
|----------|--------|-------------|
| A01: Broken Access Control | should-fix | TOCTOU race condition; symlink bypass for move destination |
| A02: Cryptographic Failures | compliant | No cryptographic operations in scope |
| A03: Injection | compliant | Path injection adequately mitigated by isPathSafe() |
| A04: Insecure Design | **must-fix** | Source path protected directory check missing |
| A05: Security Misconfiguration | should-fix | No auth/authz (existing issue, not Issue #162 specific) |
| A06: Vulnerable Components | compliant | No new dependencies added |
| A07: Auth Failures | compliant | Out of scope for local dev tool |
| A08: Data Integrity | should-fix | Final destination path isPathSafe() not explicitly designed |
| A09: Logging/Monitoring | optional | No security logging for file operations |
| A10: SSRF | compliant | No server-side HTTP requests |

---

## 3. Detailed Findings

### 3.1 Must Fix

#### SEC-S4-004: Source path protected directory check missing in moveFileOrDirectory()

**OWASP**: A04:2021 - Insecure Design
**Severity**: Must Fix
**Design Section**: 3-1-0, 3-1-1, 4-1

**Issue**: The design's validation responsibility table (Section 3-1-0) assigns protected directory checks only to the destination path. However, moving files **out of** a protected directory (e.g., `.git/config`, `.git/HEAD`) is equally dangerous -- the source file is removed from its original location, which can corrupt the Git repository. The existing `deleteFileOrDirectory()` applies `isProtectedDirectory()` to the source path, but `moveFileOrDirectory()` does not include this check.

**Affected Code Pattern** (from `src/lib/file-operations.ts`, line 364):
```typescript
// deleteFileOrDirectory() checks source path -- move should do the same
if (isProtectedDirectory(relativePath)) {
  return createErrorResult('PROTECTED_DIRECTORY');
}
```

**Recommendation**: Add `isProtectedDirectory(sourcePath)` check to `moveFileOrDirectory()` before proceeding with the move. Update the validation responsibility table in Section 3-1-0 to include a "Source protected directory check" row with `moveFileOrDirectory()` as the responsible function.

---

### 3.2 Should Fix

#### SEC-S4-001: TOCTOU race condition between existsSync() and rename()

**OWASP**: A01:2021 - Broken Access Control
**Severity**: Should Fix
**Design Section**: 3-1-1

**Issue**: The design uses `existsSync()` to check if the destination already exists, then calls `fs.rename()`. Between these two calls, another process could create a file at the destination, leading to unintended overwrite.

**Recommendation**: Keep `existsSync()` as a UX-friendly pre-check, but add `EEXIST`/`ENOTEMPTY` error handling in the `rename()` catch block to return `FILE_EXISTS` error. This provides defense-in-depth against the TOCTOU window:

```typescript
} catch (error) {
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError.code === 'EEXIST' || nodeError.code === 'ENOTEMPTY') {
    return createErrorResult('FILE_EXISTS');
  }
  // ... other error handling
}
```

---

#### SEC-S4-002: Symlink validation missing for move destination path

**OWASP**: A01:2021 - Broken Access Control
**Severity**: Should Fix
**Design Section**: 3-1-1, 4-1

**Issue**: Section 4-1's security table states symlink protection is "already handled by readDirectory()". However, `readDirectory()` only skips symlinks during tree display -- it does not protect `moveFileOrDirectory()`. If an attacker places a symlink as the destination directory, `fs.rename()` could write files outside the worktree boundary.

**Current readDirectory() symlink handling** (from `src/lib/file-tree.ts`, line 179-183):
```typescript
const entryStat = await lstat(entryPath);
// Skip symbolic links for security
if (entryStat.isSymbolicLink()) {
  continue;
}
```

This only protects directory listing, not move operations.

**Recommendation**: In `moveFileOrDirectory()`, resolve the destination directory to its real path using `fs.realpathSync()` and verify it remains within the worktree root:

```typescript
const realDestDir = fs.realpathSync(resolvedDestDir);
if (!isPathSafe(path.relative(worktreeRoot, realDestDir), worktreeRoot)) {
  return createErrorResult('INVALID_PATH');
}
```

---

#### SEC-S4-005: MOVE_INTO_SELF prefix check may false-positive without path separator

**OWASP**: A04:2021 - Insecure Design
**Severity**: Should Fix
**Design Section**: 3-1-1

**Issue**: The design states "verify if source path is a prefix of destination" for the MOVE_INTO_SELF check. A naive `startsWith()` comparison could produce false positives: moving directory `src` to `src-backup/` would incorrectly trigger the check because `"src-backup/src"` starts with `"src"`.

**Recommendation**: Explicitly specify that the prefix check must include a trailing path separator:

```typescript
// Correct: includes separator to prevent false positives
if (resolvedDest.startsWith(resolvedSource + path.sep)) {
  return createErrorResult('MOVE_INTO_SELF');
}
```

---

#### SEC-S4-006: No authentication/authorization on API endpoints

**OWASP**: A05:2021 - Security Misconfiguration
**Severity**: Should Fix (existing architectural issue)
**Design Section**: 10

**Issue**: No middleware.ts or authentication mechanism exists for any API route. The move operation has destructive side effects (files are removed from their original location). While this is acceptable for a local development tool, it should be documented as a known limitation.

**Recommendation**: Add a note to Section 10 (Constraints) stating that the tool assumes local-only access and that network exposure requires authentication. This is not an Issue #162 change but should be documented for security awareness.

---

#### SEC-S4-008: Final destination path (destDir + basename) not explicitly validated with isPathSafe()

**OWASP**: A08:2021 - Software and Data Integrity Failures
**Severity**: Should Fix
**Design Section**: 3-1-1

**Issue**: The design validates `destinationDir` with `isPathSafe()`, but the final path (`path.join(destinationDir, path.basename(sourcePath))`) is not explicitly validated. While `path.basename()` should strip traversal components, a defense-in-depth approach warrants explicit validation of the final computed path.

**Recommendation**: Add explicit `isPathSafe()` validation for the final destination path:

```typescript
const finalDestPath = path.join(destinationDir, path.basename(sourcePath));
if (!isPathSafe(finalDestPath, worktreeRoot)) {
  return createErrorResult('INVALID_PATH');
}
```

---

### 3.3 Optional

#### SEC-S4-003: No protection against moving files out of protected directories

**OWASP**: A01:2021 - Broken Access Control
**Severity**: Optional (partially addressed by SEC-S4-004)

If SEC-S4-004 is implemented (source path protected directory check), this concern is fully addressed. Listed separately for clarity of the attack vector: an attacker could exfiltrate `.git/config` by moving it to a publicly accessible directory.

---

#### SEC-S4-007: console.error may log stack traces with sensitive information

**OWASP**: A05:2021 - Security Misconfiguration
**Severity**: Optional

The PATCH handler's catch block logs the full error object. In production, this could include file paths in stack traces. Since this is a local development tool, the risk is minimal. Future improvement: use the structured `api-logger.ts` `withLogging()` pattern.

---

#### SEC-S4-009: No security audit logging for file move operations

**OWASP**: A09:2021 - Security Logging and Monitoring Failures
**Severity**: Optional

File operations (move, delete, create) are not recorded in security logs. The CLI module has a `security-logger.ts` pattern that could be extended to API operations in the future.

---

### 3.4 Compliant Items

| ID | Category | Description |
|----|----------|-------------|
| CP-S4-001 | A02 | No cryptographic operations in scope |
| CP-S4-002 | A03 | Path injection prevention via isPathSafe() with null byte, URL encoding, and traversal checks |
| CP-S4-003 | A03 | destination parameter validation designed (MF-S3-002) |
| CP-S4-004 | A06 | No new external dependencies added |
| CP-S4-005 | A07 | Authentication is out of scope for local dev tool |
| CP-S4-006 | A10 | No server-side HTTP requests (no SSRF risk) |
| CP-S4-007 | Path Traversal | isPathSafe() applied to both source and destination paths |
| CP-S4-008 | Dir Traversal | path.resolve() + path.relative() normalization |
| CP-S4-009 | Input Validation | Multi-layer validation (API handler, validateFileOperation, moveFileOrDirectory) |
| CP-S4-010 | Error Leakage | createErrorResult() prevents absolute path exposure in responses |
| CP-S4-011 | API Security | PATCH extension follows existing security patterns |
| CP-S4-012 | XSS | ANSI stripping in copyToClipboard(); React auto-escaping in JSX |

---

## 4. Positive Security Aspects

The design demonstrates several strong security practices:

1. **Defense-in-depth path validation**: isPathSafe() is applied at both the API route layer (getWorktreeAndValidatePath) and the business logic layer (validateFileOperation, moveFileOrDirectory).

2. **Error message hygiene**: createErrorResult() consistently avoids including absolute paths in client-facing error responses (SEC-SF-002).

3. **Protected directory pattern**: The reuse of isProtectedDirectory() for destination validation follows the existing deleteFileOrDirectory() security pattern.

4. **Overwrite prevention**: existsSync() check before rename prevents accidental file overwrite (SEC-003).

5. **Self-reference detection**: MOVE_INTO_SELF error code prevents recursive directory moves that would cause filesystem corruption.

6. **Input validation at API boundary**: MF-S3-002 ensures destination parameter type checking occurs before business logic execution.

---

## 5. Risk Assessment

| Risk Factor | Level | Rationale |
|------------|-------|-----------|
| Overall Risk | Medium | Move operation is destructive (removes source); protected directory bypass could corrupt .git |
| Exploitation Likelihood | Low | Local development tool; attacker requires filesystem access |
| Impact if Exploited | Medium-High | Repository corruption (.git manipulation); data loss (file moved to wrong location) |

**Highest Risk Items**:
1. SEC-S4-004: Protected directory files (e.g., `.git/HEAD`) can be moved out, corrupting the repository
2. SEC-S4-002: Symlinks in destination directory could allow writes outside worktree

---

## 6. Recommendations Priority

| Priority | ID | Action |
|----------|-----|--------|
| 1 (Must) | SEC-S4-004 | Add isProtectedDirectory() check for source path in moveFileOrDirectory() |
| 2 (Should) | SEC-S4-002 | Add realpathSync() validation for destination directory |
| 3 (Should) | SEC-S4-005 | Specify path separator in MOVE_INTO_SELF prefix check |
| 4 (Should) | SEC-S4-008 | Add isPathSafe() for final destination path (defense-in-depth) |
| 5 (Should) | SEC-S4-001 | Add EEXIST error handling in rename() catch block |
| 6 (Should) | SEC-S4-006 | Document local-only assumption in constraints section |

---

## 7. Conclusion

The design policy for Issue #162 demonstrates solid security fundamentals, properly leveraging the existing `isPathSafe()`, `isProtectedDirectory()`, and `createErrorResult()` patterns. The most critical finding (SEC-S4-004) is a gap where the move operation does not apply the same protected directory check to the source path that `deleteFileOrDirectory()` already implements. This is a straightforward fix that maintains consistency with existing patterns.

After addressing the must-fix item (SEC-S4-004) and the high-priority should-fix items (SEC-S4-002, SEC-S4-005), the design will meet the security requirements for a local development tool operating on the filesystem.

**Result**: Conditional Approval -- approved upon resolution of SEC-S4-004 (must-fix).
