# Issue #449 レビューレポート - Stage 7

**レビュー日**: 2026-03-08
**フォーカス**: 影響範囲レビュー（2回目）
**ステージ**: 7/8

---

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 0 |
| Should Fix | 2 |
| Nice to Have | 3 |

---

## 前回指摘事項（Stage 3）の解決状況

全8件の指摘事項がIssue本文に反映済み。

| ID | 指摘内容 | ステータス |
|----|---------|-----------|
| S3-001 | SidebarContext再レンダリングリスク | 解決済み - groupCollapsedをSidebar内部useStateで管理する設計方針を明記 |
| S3-002 | Sidebar.test.tsxのテスト破壊リスク | 解決済み - テスト観点7番目にセレクタ変更対応を追加 |
| S3-003 | SidebarContext.test.tsxの拡張 | 解決済み - テスト観点8番目にviewMode切替・localStorage永続化テストを追加 |
| S3-004 | モバイルドロワー対応の具体化 | 解決済み - w-72幅レイアウト確認、44x44pxタップ領域対応を明記 |
| S3-005 | sortBranches/groupBranchesの関係整理 | 解決済み - groupBranches()関数、BranchGroup型export方針を明記 |
| S3-006 | 表示モード切替UIの配置位置 | 解決済み - SortSelector横のアイコンボタン配置で確定 |
| S3-007 | useSidebar.tsフックの拡張要否 | 解決済み - SidebarContext内useEffectパターンで完結、useSidebar拡張不要 |
| S3-008 | sidebar-utils.test.tsへのテスト追加 | 解決済み - テスト観点1番目に具体的テストケースとともに明記 |

---

## Should Fix（推奨対応）

### S7-001: SidebarProvider内のvalueオブジェクトがuseMemoで保護されていない既存問題がviewMode追加で悪化する

**カテゴリ**: 影響範囲
**影響ファイル**: `src/contexts/SidebarContext.tsx`, `src/components/worktree/WorktreeDetailRefactored.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/SidebarToggle.tsx`, `src/components/sidebar/SortSelector.tsx`

**問題**:
SidebarContext.tsx 225行目で SidebarContextValue オブジェクトが SidebarProvider のレンダーごとに新規作成されている（useMemoなし）。viewMode と setViewMode を追加することで Context の値変更機会が増える。WorktreeDetailRefactored は toggle と openMobileDrawer のみを使用しているが、viewMode 変更時にも再レンダリングされる。

これは既存の技術的負債であり Issue #449 固有の問題ではないが、viewMode 追加で影響が拡大するため注意喚起する。

**推奨対応**:
Issue #449 の実装時に value オブジェクトを useMemo でラップすることを検討する。ただし、既存パターンとの一貫性を考慮し、パフォーマンス問題が顕在化しない限りは現行パターン踏襲でも許容される。

---

### S7-002: ViewMode型の定義場所が未指定

**カテゴリ**: 影響範囲
**影響ファイル**: `src/lib/sidebar-utils.ts`, `src/contexts/SidebarContext.tsx`

**問題**:
viewMode 状態に使用する型（例: `type ViewMode = 'grouped' | 'flat'`）の定義場所が Issue に明記されていない。既存パターンでは SortKey 型が sidebar-utils.ts で定義され SidebarContext.tsx が import している。ViewMode 型も同じファイルに配置するのが整合的だが、実装者によって SidebarContext.tsx 内に定義される可能性がある。

**推奨対応**:
実装タスクに「ViewMode 型を sidebar-utils.ts に定義し、SidebarContext.tsx から import する」ことを追記する。

---

## Nice to Have（あれば良い）

### S7-003: viewModeとgroupCollapsedでlocalStorage復元タイミングが異なることの明示

**カテゴリ**: 影響範囲
**影響ファイル**: `src/contexts/SidebarContext.tsx`, `src/components/layout/Sidebar.tsx`

viewMode は SidebarContext 内の useEffect（非同期）で復元し、groupCollapsed は Sidebar 内の useState 初期化関数（同期）で復元する設計。viewMode が useEffect 経由の場合、初回レンダリングではデフォルト値で描画後に切り替わるちらつきが発生する可能性がある。sortKey では既にこの問題が存在するが、viewMode の場合は UI 変化がより大きい（グループ表示とフラット表示の切り替え）。

実装時にちらつきが気になる場合は、viewMode も useState 初期化関数で同期読み込みする方式を検討する。

---

### S7-004: E2Eテストへの影響は限定的

**カテゴリ**: 影響範囲
**影響ファイル**: `tests/e2e/worktree-list.spec.ts`, `tests/e2e/worktree-detail.spec.ts`

E2E テストを確認した結果、既存テストへの破壊的影響はない。worktree-list.spec.ts は別ページ（/）のテスト、worktree-detail.spec.ts の「sidebar information」は WorktreeDetail 内の情報表示であり、左サイドバーのグループ化とは無関係。

グループ化表示の E2E テスト追加は有効だが、必須ではない。

---

### S7-005: CLAUDE.mdのモジュール一覧への追記

**カテゴリ**: 影響範囲
**影響ファイル**: `CLAUDE.md`

グループヘッダーを新規コンポーネントとして作成する場合、CLAUDE.md の主要モジュール一覧に追記が必要。Sidebar.tsx 内のインラインコンポーネントとして実装する場合は不要。実装完了後に判断。

---

## 参照ファイル

### コード
- `src/contexts/SidebarContext.tsx`: viewMode追加のメインターゲット（225行目のvalueオブジェクト）
- `src/lib/sidebar-utils.ts`: groupBranches関数・BranchGroup型・ViewMode型の追加先
- `src/components/layout/Sidebar.tsx`: groupCollapsed管理・グループ化表示の実装先
- `tests/unit/components/layout/Sidebar.test.tsx`: 156行目のgetAllByText('MyRepo')件数変化（テスト観点で対応済み）

### ドキュメント
- `CLAUDE.md`: 新規コンポーネント作成時にモジュール一覧更新の可能性

---

## 総合評価

Stage 3 の全指摘事項が適切に反映されており、Issue #449 の影響範囲は十分に整理されている。新規の Should Fix 2件は実装時の品質向上に寄与するものであり、Must Fix は存在しない。実装着手可能な状態にある。
