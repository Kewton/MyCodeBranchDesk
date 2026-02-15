# Architecture Review: Issue #162 - File Enhancement Design Policy

**Date**: 2026-02-15
**Reviewer**: Architecture Review Agent (Stage 1 - Design Principles)
**Status**: Conditionally Approved
**Score**: 4/5

---

## Executive Summary

Issue #162 proposes three file operation enhancements: file/directory move, file creation time display, and file content copy. The design policy document is well-structured with clear security considerations, appropriate use of existing patterns, and sound architectural decisions. The design largely adheres to SOLID, KISS, YAGNI, and DRY principles with a few areas needing improvement.

The two primary concerns are: (1) code duplication between the proposed `moveFileOrDirectory()` and existing `renameFileOrDirectory()`, and (2) further bloating of the already-oversized `WorktreeDetailRefactored.tsx` component. Both issues are addressable with targeted refactoring.

---

## Detailed Findings

### Must Fix (2 items)

#### MF-001: DRY Violation - moveFileOrDirectory() and renameFileOrDirectory() Code Duplication

**Principle**: DRY (Don't Repeat Yourself)
**Location**: `src/lib/file-operations.ts`
**Severity**: Medium

The design proposes adding `moveFileOrDirectory()` following the same pattern as `renameFileOrDirectory()`. Examining the existing `renameFileOrDirectory()` implementation (lines 432-484), both functions will share nearly identical logic:

1. Path validation with `isPathSafe()`
2. Source existence check with `existsSync()`
3. Destination existence check with `existsSync()`
4. `fs.rename()` call
5. Error handling (EACCES, INTERNAL_ERROR)

This results in significant code duplication across the two functions.

**Recommendation**: Extract a shared internal helper function:

```typescript
// Internal helper for common validation
async function validateMoveOrRename(
  worktreeRoot: string,
  sourcePath: string
): Promise<FileOperationResult | { fullPath: string }> {
  if (!isPathSafe(sourcePath, worktreeRoot)) {
    return createErrorResult('INVALID_PATH');
  }
  const fullPath = join(worktreeRoot, sourcePath);
  if (!existsSync(fullPath)) {
    return createErrorResult('FILE_NOT_FOUND');
  }
  return { fullPath };
}
```

Both `moveFileOrDirectory()` and `renameFileOrDirectory()` can then call this helper, reducing duplication and ensuring consistent validation.

---

#### MF-002: SRP Violation - WorktreeDetailRefactored Component Bloat

**Principle**: SRP (Single Responsibility Principle) / KISS
**Location**: `src/components/worktree/WorktreeDetailRefactored.tsx`
**Severity**: Medium

`WorktreeDetailRefactored.tsx` is already 2100 lines and contains file operation handlers for: `handleNewFile`, `handleNewDirectory`, `handleRename`, `handleDelete`, `handleUpload`, and `handleFileInputChange`. Adding `handleMove` and `MoveDialog` state management will worsen the SRP violation.

The component already manages: worktree metadata, terminal polling, prompt handling, message history, file tree operations, auto-yes state, CLI tool tabs, visibility change recovery, mobile/desktop layout, file viewer, markdown editor, upload, and toast notifications.

**Recommendation**: Extract file operation handlers into a dedicated custom hook:

```typescript
// src/hooks/useFileOperations.ts
export function useFileOperations(worktreeId: string) {
  // State: fileTreeRefresh, moveTarget, fileInputRef, etc.
  // Handlers: handleNewFile, handleNewDirectory, handleRename,
  //           handleDelete, handleUpload, handleMove
  return { handlers, fileTreeRefresh, moveTarget, ... };
}
```

This is consistent with the existing pattern of extracting hooks (e.g., `useDescriptionEditor`, `useFileSearch`, `useAutoYes`).

---

### Should Fix (4 items)

#### SF-001: DRY - formatRelativeTime() Placement

**Principle**: DRY
**Location**: `src/components/worktree/FileTreeView.tsx`

The design proposes adding `formatRelativeTime()` as a helper function inside `FileTreeView.tsx`. However, the project already has `src/lib/date-locale.ts` for date-related utilities. Placing business logic inside a presentation component reduces testability and reusability.

**Recommendation**: Create `formatRelativeTime()` in `src/lib/date-utils.ts` or extend `src/lib/date-locale.ts`. Import it in `FileTreeView.tsx`.

---

#### SF-002: KISS - MoveDialog Directory Fetching Complexity

**Principle**: KISS
**Location**: `src/components/worktree/MoveDialog.tsx`

MoveDialog reuses the tree API (`/api/worktrees/[id]/tree/[path]`) which returns both files and directories. The dialog must then filter directories client-side. While this avoids creating a new API endpoint (YAGNI-compliant), it transfers unnecessary data.

**Recommendation**: Accept the current design for initial implementation but note that a server-side `?type=directory` filter parameter should be considered if performance becomes an issue with large directory trees.

---

#### SF-003: OCP - PATCH Handler Action Dispatch

**Principle**: Open/Closed Principle
**Location**: `src/app/api/worktrees/[id]/files/[...path]/route.ts`

The current PATCH handler has a simple `if (action !== 'rename')` guard (line 374). Adding `action === 'move'` creates a growing if-else chain. With two actions this is acceptable, but the trend should be monitored.

**Recommendation**: Use a `switch` statement for clarity at minimum. Consider a handler map if a third action is ever needed:

```typescript
const ACTION_HANDLERS = {
  rename: handleRenameAction,
  move: handleMoveAction,
} as const;
```

---

#### SF-004: Consistency - i18n Namespace Placement

**Principle**: DRY / Consistency
**Location**: `locales/en/common.json`, `locales/ja/common.json`

The design places `fileTree` keys under `common.json`, but `common.json` contains generic keys (`cancel`, `confirm`, etc.). File-specific keys belong in `worktree.json` which already handles worktree-specific translations.

**Recommendation**: Move `fileTree` section to `locales/{lang}/worktree.json` for namespace consistency.

---

### Consider (3 items)

#### CO-001: YAGNI - mtime Field Inclusion

**Principle**: YAGNI
**Location**: `src/types/models.ts`, `src/lib/file-tree.ts`

The design adds both `birthtime` and `mtime` to `TreeItem`, but only `birthtime` is displayed in the UI. The `mtime` field is unused. However, since the data comes from the same `lstat()` call, the additional cost is negligible (~24 bytes per JSON item).

**Recommendation**: Acceptable either way. Including `mtime` has near-zero cost and may prevent a future API change. Excluding it is more YAGNI-pure.

---

#### CO-002: KISS - Native Tooltip for Exact Timestamp

**Principle**: KISS
**Location**: `src/components/worktree/FileTreeView.tsx`

The design notes that exact timestamps are not shown (only relative time). A minimal improvement would be adding `title={item.birthtime}` to the time display element, giving users a browser-native tooltip with the exact ISO timestamp at zero implementation cost.

---

#### CO-003: ISP - MoveDialogProps sourceType

**Principle**: Interface Segregation
**Location**: `src/components/worktree/MoveDialog.tsx`

`sourceType: 'file' | 'directory'` in `MoveDialogProps` is unclear in its purpose. If it only affects display text, it could be derived from context rather than passed explicitly.

---

### Compliant Items (8 items)

| ID | Principle | Description |
|-----|-----------|-------------|
| CP-001 | SRP | MoveDialog as a separate, focused component |
| CP-002 | DRY | Reuse of existing `copyToClipboard()` from clipboard-utils.ts |
| CP-003 | DRY | Reuse of existing `createErrorResult()` helper |
| CP-004 | KISS | `fs.rename()` for file move (simplest possible implementation) |
| CP-005 | Security | MOVE_INTO_SELF error code preventing directory self-nesting |
| CP-006 | Compatibility | Optional birthtime/mtime fields preserving backward compatibility |
| CP-007 | DRY/Consistency | Adding error codes to centralized ERROR_CODE_TO_HTTP_STATUS map |
| CP-008 | Consistency | Following existing PATCH action pattern for API integration |

---

## Risk Assessment

| Risk Category | Level | Description |
|--------------|-------|-------------|
| Technical | Low | All proposed changes follow established patterns. `fs.rename()` is well-understood and atomic within a filesystem. |
| Security | Low | Security design is thorough with path traversal prevention, protected directory checks, and self-move detection. Existing `isPathSafe()` and `isProtectedDirectory()` are reused appropriately. |
| Operational | Low | Changes are backward compatible (optional fields, additive API changes). No database schema changes. No deployment risk. |

---

## Principle Compliance Summary

| Principle | Status | Notes |
|-----------|--------|-------|
| Single Responsibility (S) | Partial | MoveDialog is well-separated, but WorktreeDetailRefactored grows further (MF-002) |
| Open/Closed (O) | Partial | PATCH handler action dispatch could be more extensible (SF-003) |
| Liskov Substitution (L) | Compliant | Not directly applicable; no inheritance hierarchy changes |
| Interface Segregation (I) | Compliant | MoveDialogProps is focused; minor question on sourceType (CO-003) |
| Dependency Inversion (D) | Compliant | file-operations.ts properly abstracts fs operations |
| KISS | Compliant | fs.rename(), existing API reuse, and clipboard-utils reuse are all simple |
| YAGNI | Partial | mtime field may be premature (CO-001), but cost is negligible |
| DRY | Partial | moveFileOrDirectory/renameFileOrDirectory duplication (MF-001), formatRelativeTime placement (SF-001) |

---

## Approval Decision

**Status: Conditionally Approved**

The design is sound overall with well-considered security measures, appropriate use of existing patterns, and clear documentation. The two must-fix items (MF-001: DRY violation in file-operations.ts, MF-002: SRP violation in WorktreeDetailRefactored.tsx) should be addressed before implementation proceeds. These are architectural refinements that will improve long-term maintainability without changing the functional design.

### Required Actions Before Implementation

1. **MF-001**: Introduce a shared validation helper in `file-operations.ts` to reduce duplication between `moveFileOrDirectory()` and `renameFileOrDirectory()`.
2. **MF-002**: Extract file operation handlers from `WorktreeDetailRefactored.tsx` into a `useFileOperations()` custom hook.

### Recommended Actions (Non-Blocking)

- SF-001: Place `formatRelativeTime()` in a utility module rather than inline in the component.
- SF-002: Monitor MoveDialog performance with large directory trees.
- SF-003: Use switch statement in PATCH handler for clarity.
- SF-004: Place i18n keys in `worktree.json` namespace instead of `common.json`.
