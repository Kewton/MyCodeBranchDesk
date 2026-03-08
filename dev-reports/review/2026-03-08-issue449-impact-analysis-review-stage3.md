# Issue #449 Stage 3 影響分析レビュー

**日付**: 2026-03-08
**対象**: サイドバー リポジトリ単位グループ化 設計方針書
**レビュー種別**: 影響範囲 (Impact Scope)
**設計書**: `dev-reports/design/issue-449-sidebar-group-design-policy.md`

---

## レビュー結果サマリー

| 重要度 | 件数 |
|--------|------|
| Must Fix | 2 |
| Should Fix | 6 |
| Nice to Have | 2 |

---

## Must Fix

### DR3-003: SidebarContext.test.tsx の TestConsumer が viewMode を表示していない

**影響ファイル**: `tests/unit/contexts/SidebarContext.test.tsx`

既存の TestConsumer コンポーネントは SidebarContextValue の全フィールドをレンダリングしていない。SidebarContextValue に `viewMode` と `setViewMode` が追加された場合、新規テストで初期値やトグル動作を検証するために TestConsumer の拡張が必須となる。設計書のテスト変更ファイルセクションには「viewMode状態・localStorage永続化テスト追加」とあるが、既存 TestConsumer への具体的な変更内容が明示されていない。

**改善案**: 設計書のテスト変更ファイルセクションに、TestConsumer に `<span data-testid="viewMode">{context.viewMode}</span>` と `<button data-testid="setViewMode" onClick={() => context.setViewMode('flat')}>` を追加する旨を明記する。

### DR3-009: Sidebar.test.tsx のブランチ選択テストがグループ化表示で動作保証されていない

**影響ファイル**: `tests/unit/components/layout/Sidebar.test.tsx`

既存テスト 'should handle branch click' は `screen.getByText('feature/test-1').closest('[data-testid="branch-list-item"]')` でブランチ要素を取得している。デフォルト viewMode が 'grouped' の場合、ブランチは GroupHeader の子要素としてネストされるが、BranchListItem の `data-testid` は維持されるため closest() は動作する。ただし、`groupCollapsed` の初期値が空オブジェクトであり全グループがデフォルト展開されることが暗黙の前提となっている。

**改善案**: 設計書に「groupCollapsed の初期値は `{}` であり、全グループがデフォルトで展開される」ことを設計上の決定事項として明記し、既存テストがそのまま動作することを保証する注記を追加する。

---

## Should Fix

### DR3-001: useSidebar フックが viewMode/setViewMode を公開していない

**影響ファイル**: `src/hooks/useSidebar.ts`

`useSidebar` フックは `useSidebarContext()` からの返り値のサブセット（isOpen, width, isMobileDrawerOpen 等）のみを返している。viewMode と setViewMode は返り値に含まれない。現在は他コンポーネントから import されていないため実害はないが、設計書の変更ファイル一覧にも含まれていない。

**改善案**: 設計書の変更ファイル一覧に `src/hooks/useSidebar.ts` を追加するか、現在未使用であるため対象外とする旨を注記する。

### DR3-002: getAllByText('MyRepo') のカウント変更

**影響ファイル**: `tests/unit/components/layout/Sidebar.test.tsx`

既存テスト 'should show repository name for each branch' は `getAllByText('MyRepo')` の結果が 3 件であることを期待している。グループ化表示では GroupHeader にもリポジトリ名 'MyRepo' が表示されるため、カウントが 4 になりテストが失敗する。

**改善案**: 設計書のテスト変更説明にこの具体的なカウント変更を明記する。

### DR3-006: viewMode 永続化の useEffect による初期フラッシュ

**影響ファイル**: `src/contexts/SidebarContext.tsx`

viewMode の localStorage 読み込みは useEffect（非同期）で行われるため、localStorage に 'flat' が保存されている場合、初回レンダリングでは 'grouped'（デフォルト）で表示され、useEffect 完了後に 'flat' に切り替わるちらつきが発生する。viewMode の切り替えはレイアウトが大きく変わるため、sortKey よりも視覚的影響が大きい。

**改善案**: viewMode も groupCollapsed と同様に useState 初期化関数で同期読み込みするか、useReducer の初期値生成時に localStorage から読み込む方式を検討し、設計書にトレードオフを明記する。

### DR3-004: useMemo 化による全コンシューマーへの再レンダリング頻度変化

**影響ファイル**: `AppShell.tsx`, `SidebarToggle.tsx`, `SortSelector.tsx`, `WorktreeDetailRefactored.tsx`

SidebarContext の value を useMemo でラップすることで、既存コンシューマー 5 コンポーネントの再レンダリング頻度が減少する。パフォーマンス改善だが、設計書に影響範囲として明記されていない。

### DR3-007: 空状態メッセージの CSS クラス不一致

**影響ファイル**: `src/components/layout/Sidebar.tsx`

既存コードは `text-gray-400` を使用しているが、設計書のグループ化/フラット表示の空状態では `text-gray-500` を使用している。意図的な変更か誤りかが不明。

### DR3-010: 検索時のグループ折りたたみ状態の考慮不足

**影響ファイル**: `src/components/layout/Sidebar.tsx`

検索クエリがある状態でグループが折りたたまれている場合、マッチしたブランチが非表示のままになる。検索中はグループの折りたたみを一時的に無効化するロジックが設計書にない。

**改善案**: レンダリング条件を `(!groupCollapsed[group.repositoryName] || searchQuery.trim())` に変更することで、検索中は全グループを自動展開する。

---

## Nice to Have

### DR3-005: MobileHeader への影響なし（確認済み）

MobileHeader は useSidebarContext を使用せず props 経由でデータを受け取るため、影響なし。

### DR3-008: localStorage キー命名の不一致

既存の `sidebar-state` キー（useSidebar.ts）と `mcbd-` プレフィックスキーの混在は既存の技術的負債であり、今回のスコープ外。

---

## 影響範囲マップ

### 直接変更ファイル（設計書記載済み）

| ファイル | 変更種別 |
|---------|---------|
| `src/lib/sidebar-utils.ts` | ViewMode型, BranchGroup型, groupBranches()追加 |
| `src/contexts/SidebarContext.tsx` | viewMode状態, useMemoラップ |
| `src/components/layout/Sidebar.tsx` | グループ化レンダリング, ViewModeToggle |

### 間接影響ファイル（設計書で言及不足）

| ファイル | 影響内容 | 影響度 |
|---------|---------|--------|
| `src/hooks/useSidebar.ts` | viewMode/setViewModeが返り値に含まれない | 低（現在未使用） |
| `src/components/layout/AppShell.tsx` | useMemo化による再レンダリング頻度変化 | 低（改善方向） |
| `src/components/layout/SidebarToggle.tsx` | 同上 | 低（改善方向） |
| `src/components/sidebar/SortSelector.tsx` | 同上 | 低（改善方向） |
| `src/components/worktree/WorktreeDetailRefactored.tsx` | 同上 | 低（改善方向） |

### テスト影響ファイル

| ファイル | 影響内容 | 影響度 |
|---------|---------|--------|
| `tests/unit/components/layout/Sidebar.test.tsx` | getAllByText('MyRepo')カウント変更、グループ化デフォルトによる表示変化 | 高 |
| `tests/unit/contexts/SidebarContext.test.tsx` | TestConsumer拡張が必要 | 中 |
| `tests/unit/lib/sidebar-utils.test.ts` | 新規テスト追加のみ、既存テスト影響なし | 低 |

---

## 総合評価

設計方針書は変更対象の3ファイルに対する設計を詳細に記述しており、Stage 1/2 のレビュー指摘も適切に反映されている。しかし、影響範囲の分析において以下の改善が必要である。

1. **テスト影響の具体性不足**: 既存テストの破壊的変更（getAllByText カウント、TestConsumer 拡張）が具体的に記載されていない
2. **検索とグループ折りたたみの相互作用**: 検索中に折りたたまれたグループのブランチが非表示になるエッジケースが考慮されていない
3. **viewMode のちらつきリスク**: useEffect による非同期読み込みが sortKey と同じパターンだが、視覚的影響度が異なる点が未検討
4. **間接影響コンポーネント**: useMemo 化による全コンシューマーへのポジティブな影響が明示されていない

Must Fix 2件は設計書への注記追加で対応可能。Should Fix のうち DR3-010（検索時のグループ展開）は実装品質に直結する指摘であり、優先的に対応すべき。

---

*Generated by architecture-review-agent for Issue #449 Stage 3*
*Date: 2026-03-08*
