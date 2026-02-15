# Architecture Review: Issue #162 - Stage 2 Consistency Review

## Executive Summary

This review evaluates the consistency between the Issue #162 File Enhancement design policy document and the existing codebase patterns. The design document, which was already revised based on Stage 1 design principles review feedback, demonstrates strong alignment with existing architectural patterns in most areas. However, two must-fix items were identified related to i18n consistency, where the design assumes i18n capabilities in components that currently do not use internationalization at all.

**Status**: Conditionally Approved
**Score**: 4/5
**Date**: 2026-02-15
**Reviewer**: Architecture Review Agent

---

## Review Scope

- **Focus Area**: Consistency (design policy vs existing codebase patterns)
- **Design Document**: `dev-reports/design/issue-162-file-enhancement-design-policy.md`
- **Codebase Version**: Branch `feature/162-worktree`, commit `69d6910`

---

## Detailed Findings

### Consistency Matrix

| Area | Design Approach | Existing Pattern | Rating |
|------|----------------|-----------------|--------|
| File Operation Functions | `moveFileOrDirectory()` with `validateFileOperation()` helper | `renameFileOrDirectory()`, `deleteFileOrDirectory()` with inline validation | HIGH |
| API Route | PATCH `action: 'move'` dispatch via switch | PATCH `action: 'rename'` with if-check | HIGH |
| Error Code Mapping | Add `MOVE_SAME_PATH`, `MOVE_INTO_SELF` to centralized map | Centralized `ERROR_CODE_TO_HTTP_STATUS` in route.ts | HIGH |
| i18n | Add `fileTree` section to `worktree.json`, use `useTranslations('worktree')` | ContextMenu/FileTreeView/FileViewer have NO i18n | LOW |
| Component Dialog Pattern | `MoveDialog` with `Modal`, `useFileOperations` hook | `window.prompt()` for rename/create | MEDIUM |
| Data Model | `TreeItem.birthtime?: string` (ISO 8601) | `TreeItem` with optional `size?`, `extension?`, `itemCount?` | HIGH |
| Security Validation | `isPathSafe()` + `isProtectedDirectory()` for move | `isPathSafe()` for rename, `isProtectedDirectory()` for delete | HIGH |
| Custom Hooks | `useFileOperations()` in `src/hooks/` | `useContextMenu`, `useFileSearch`, etc. in `src/hooks/` | HIGH |

---

### Must Fix (2 items)

#### MF-S2-001: ContextMenu i18n Inconsistency

**Severity**: Must Fix
**Category**: i18n Consistency

The design specifies adding i18n keys like `fileTree.move` to `worktree.json` and using `useTranslations('worktree')` in components. However, the existing `ContextMenu.tsx` does NOT use i18n at all. All labels are hardcoded English strings:

```typescript
// src/components/worktree/ContextMenu.tsx lines 112-146
const menuItems: MenuItem[] = [
  { id: 'new-file',      label: 'New File',       ... },
  { id: 'new-directory', label: 'New Directory',  ... },
  { id: 'upload',        label: 'Upload File',    ... },
  { id: 'rename',        label: 'Rename',         ... },
  { id: 'delete',        label: 'Delete',         ... },
];
```

Adding a 'Move' item via i18n while other items remain hardcoded creates an inconsistency within the same component.

**Recommendation**: For this Issue, hardcode the 'Move' label in English to match existing ContextMenu patterns. If i18n for ContextMenu is desired, create a separate issue to internationalize all menu items consistently.

---

#### MF-S2-002: FileTreeView.tsx Lacks i18n Infrastructure for Locale-Dependent Formatting

**Severity**: Must Fix
**Category**: i18n Consistency

The design specifies `formatRelativeTime(item.birthtime, locale)` in `FileTreeView.tsx` (Section 3-2-3), but `FileTreeView.tsx` currently does not import or use `useTranslations`, `useLocale`, or any next-intl APIs. There is no existing `locale` variable available in the component or its `TreeNode` sub-component.

The design needs to specify how the locale parameter will be obtained -- either:
1. Add `useLocale()` from next-intl to `FileTreeView`, or
2. Pass locale as a prop from `WorktreeDetailRefactored` (which already uses `useTranslations`), or
3. Use a standalone approach such as reading from a cookie or browser API.

**Recommendation**: Use `useLocale()` from next-intl in `FileTreeView` (option 1) as it is the lightest approach and follows the pattern used in `WorktreeCard.tsx`, `PromptMessage.tsx`, and `MessageList.tsx`. Explicitly document this in the design.

---

### Should Fix (5 items)

#### SF-S2-001: Move Error Messages Should Follow error.json Pattern

The design places move failure messages in `worktree.json` (`fileTree.moveFailed`). However, the existing pattern for file operation error messages uses `error.json`:

```json
// locales/en/error.json
{
  "fileOps": {
    "failedToCreateFile": "Failed to create file",
    "failedToCreateDirectory": "Failed to create directory",
    "failedToRename": "Failed to rename",
    "failedToDelete": "Failed to delete"
  }
}
```

These are accessed via `tError('fileOps.failedToRename')` in `WorktreeDetailRefactored.tsx`.

**Recommendation**: Add `failedToMove` to `error.json` `fileOps` section for error messages. Keep UI labels (e.g., dialog title, button text) in `worktree.json`.

---

#### SF-S2-002: PATCH Handler Error Message Needs Update

The current PATCH handler returns:
```typescript
// route.ts line 374-376
if (action !== 'rename') {
  return createErrorResponse('INVALID_REQUEST', 'Unknown action. Supported: "rename"');
}
```

When `move` is added, this error message must be updated to list both supported actions. The design does not explicitly mention this update.

**Recommendation**: Document the error message change to `'Unknown action. Supported: "rename", "move"'` in the design.

---

#### SF-S2-003: validateFileOperation() Source Path Validation Scope

The design's validation responsibility table (Section 3-1-0) correctly delineates responsibilities between `validateFileOperation()` and `moveFileOrDirectory()`. The actual implementation of `renameFileOrDirectory()` validates both the source path via `isPathSafe()` and existence via `existsSync()` -- these are exactly the checks that `validateFileOperation()` is designed to extract.

**Recommendation**: Ensure that when refactoring `renameFileOrDirectory()` to use `validateFileOperation()`, the permission error handling (`EACCES`) for the existence check is also covered by the helper, as it currently sits in the try/catch of the rename operation itself.

---

#### SF-S2-004: FileViewer Copy Feedback - Icon vs Toast Ambiguity

The design lists i18n keys `copySuccess` and `copyFailed` in `worktree.json` but also describes an icon-based feedback approach (Copy -> Check icon, 2-second reset). FileViewer.tsx does not currently use i18n or Toast. If only icon feedback is used, the i18n keys are unnecessary.

**Recommendation**: Clarify whether copy feedback uses icon-only (no i18n keys needed) or Toast notification (i18n keys needed plus `useTranslations` import in FileViewer).

---

#### SF-S2-005: Protected Directory Check for Move Destination

The design correctly places protected directory checking in `moveFileOrDirectory()` (not in `validateFileOperation()`). The existing `isProtectedDirectory()` checks if a relative path starts with `.git`, `.github`, or `node_modules`. When a file is moved, the destination check must verify the full destination path (directory + filename), not just the destination directory.

**Recommendation**: Ensure the implementation checks `isProtectedDirectory(destinationDir)` and `isProtectedDirectory(join(destinationDir, basename(sourcePath)))` to prevent moving files into protected directories.

---

### Consider (4 items)

#### CO-S2-001: Mixed Interaction Patterns (window.prompt vs Dialog)

Existing file operations use `window.prompt()`/`window.alert()` for user interaction, while the new Move feature uses `MoveDialog` and Toast. This creates a visual inconsistency within the same component.

**Verdict**: Acceptable. The `useFileOperations()` hook is designed for phased migration, which is the right time to modernize all handlers.

---

#### CO-S2-002: PATCH Field Naming (destination vs newName)

The `move` action uses `destination` while `rename` uses `newName`. This is semantically appropriate given different operation types.

**Verdict**: No change needed.

---

#### CO-S2-003: Consolidation Opportunity for formatDistanceToNow

`WorktreeCard.tsx` calls `formatDistanceToNow()` inline. The new `formatRelativeTime()` in `date-utils.ts` wraps the same function. Future consolidation is possible.

**Verdict**: Document as future DRY improvement; out of scope for Issue #162.

---

#### CO-S2-004: Duplicate Cancel Key

The design adds `fileTree.moveCancel: 'Cancel'` to `worktree.json`, but `common.json` already has a `cancel` key.

**Verdict**: Use `tCommon('cancel')` for the MoveDialog cancel button instead of a duplicate key.

---

### Compliant (12 items)

| ID | Category | Item |
|----|----------|------|
| CP-S2-001 | API Pattern | PATCH action dispatch extends existing route.ts structure correctly |
| CP-S2-002 | Error Code Pattern | ERROR_CODE_TO_HTTP_STATUS map extension follows established DRY pattern |
| CP-S2-003 | Function Signature | `moveFileOrDirectory()` signature consistent with `renameFileOrDirectory()` |
| CP-S2-004 | Security Pattern | `isPathSafe()` on both source and destination follows defense-in-depth |
| CP-S2-005 | Component Pattern | MoveDialog uses existing `Modal` component from `src/components/ui/` |
| CP-S2-006 | Hook Pattern | `useFileOperations()` in `src/hooks/` follows naming convention (`use*.ts`) |
| CP-S2-007 | Data Model Pattern | `TreeItem.birthtime?: string` follows optional field backward compatibility |
| CP-S2-008 | Utility Pattern | `date-utils.ts` in `src/lib/` follows utility module placement |
| CP-S2-009 | Clipboard Pattern | Reuses `copyToClipboard()` from `clipboard-utils.ts` correctly |
| CP-S2-010 | FS Pattern | `lstat()` birthtime extraction adds no I/O overhead (already called) |
| CP-S2-011 | ContextMenu Pattern | `onMove?` callback follows optional callback prop pattern |
| CP-S2-012 | Error Result Pattern | `createErrorResult()` reuse follows DRY established pattern |

---

## Risk Assessment

| Risk Type | Level | Description | Mitigation |
|-----------|-------|-------------|------------|
| Technical | Low | Minor i18n inconsistencies identified, addressable before implementation | Apply MF-S2-001/002 fixes to design |
| Security | Low | Security patterns (isPathSafe, isProtectedDirectory) are well-aligned | Follow existing patterns precisely |
| Operational | Low | No deployment or runtime risks identified | N/A |

---

## Improvement Recommendations

### Required Before Implementation

1. **MF-S2-001**: Decide whether to hardcode 'Move' label (consistent with current ContextMenu) or add i18n to all ContextMenu labels (scope expansion). Recommended: hardcode for now.
2. **MF-S2-002**: Add `useLocale()` from next-intl to the design's FileTreeView changes, or specify locale prop passing from parent.

### Recommended

3. **SF-S2-001**: Move error message `failedToMove` to `error.json` `fileOps` section, not `worktree.json`.
4. **SF-S2-002**: Document PATCH handler error message update.
5. **SF-S2-004**: Clarify copy feedback mechanism (icon-only vs Toast).
6. **CO-S2-004**: Use `tCommon('cancel')` instead of adding `fileTree.moveCancel`.

---

## Approval

**Status**: Conditionally Approved

The design demonstrates strong consistency with existing codebase patterns in all core areas (API routes, file operations, security validation, data models, hooks, and component architecture). The two must-fix items are localized to the i18n strategy and can be resolved without structural changes to the design. The remaining should-fix and consider items are minor refinements. Once MF-S2-001 and MF-S2-002 are addressed, the design is ready for implementation.

---

## Files Reviewed

- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/lib/file-operations.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/lib/file-tree.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/lib/path-validator.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/lib/clipboard-utils.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/lib/date-locale.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/types/models.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/config/file-operations.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/config/system-directories.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/components/worktree/ContextMenu.tsx`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/components/worktree/FileTreeView.tsx`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/components/worktree/FileViewer.tsx`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/components/worktree/WorktreeDetailRefactored.tsx`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/components/worktree/WorktreeCard.tsx`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/components/ui/Modal.tsx`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/hooks/useContextMenu.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/src/app/api/worktrees/[id]/files/[...path]/route.ts`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/locales/en/worktree.json`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/locales/ja/worktree.json`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/locales/en/common.json`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/locales/en/error.json`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/locales/ja/error.json`
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-162/dev-reports/design/issue-162-file-enhancement-design-policy.md`
