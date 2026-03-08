# Issue #449 Stage 3 影響範囲レビューレポート

**レビュー日**: 2026-03-08
**フォーカス**: 影響範囲レビュー（1回目）
**ステージ**: Stage 3

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 1 |
| Should Fix | 4 |
| Nice to Have | 3 |

**総合評価**: Issue #449 の影響範囲は主にサイドバー関連のコンポーネント群に集中しており、バックエンドやAPIへの変更は不要。最大の懸念は SidebarContext への状態追加による再レンダリングの波及と、モバイルでのグループ化UIの具体的な検討不足。既存テストへの影響は確実に発生するため、テスト更新計画を事前に明確化すべき。破壊的変更はなく、既存のフラット表示は切替可能なため、後方互換性は維持される。

---

## Must Fix（必須対応）

### S3-004: モバイルドロワーでのグループ化表示のレンダリングパスが未特定

**カテゴリ**: 影響範囲
**影響ファイル**: `src/components/layout/AppShell.tsx`, `src/components/layout/Sidebar.tsx`

**問題**:
Issue の受入条件に「モバイルドロワーでもグループ化表示が適用される」とあるが、具体的な対応内容が不明確。AppShell.tsx を確認すると、モバイルドロワーは同じ Sidebar コンポーネントを表示しているため、Sidebar 内でグループ化を実装すれば自動的にモバイルにも適用される。しかし、モバイル画面幅（w-72 = 288px）でグループヘッダーUI（折りたたみアイコン + リポジトリ名）が十分に表示できるか、タッチ操作でのグループ開閉が使いやすいかの検討がされていない。

**証拠**:
- `src/components/layout/AppShell.tsx` 85行目: モバイルドロワー内で `<Sidebar />` を直接使用
- 実装タスクに「モバイルドロワーでのグループ化表示対応」があるが具体内容なし

**推奨対応**:
「モバイルドロワーでのグループ化表示対応」の実装タスクに具体的な内容を追記する。(1) w-72幅でのグループヘッダーUIレイアウト確認、(2) タッチ操作でのグループ開閉のタップ領域サイズ（最低44x44px推奨）、(3) モバイル固有のスタイル調整が必要かどうか。

---

## Should Fix（推奨対応）

### S3-001: SidebarContext への状態追加による全コンシューマーの再レンダリングリスク

**カテゴリ**: 影響範囲
**影響ファイル**: `src/contexts/SidebarContext.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/SidebarToggle.tsx`, `src/components/sidebar/SortSelector.tsx`, `src/components/worktree/WorktreeDetailRefactored.tsx`, `src/hooks/useSidebar.ts`

**問題**:
SidebarContext に viewMode と groupCollapsed を追加すると、Context value が変わるたびに全コンシューマーが再レンダリングされる。特に groupCollapsed は開閉トグル操作のたびに変化し、WorktreeDetailRefactored など無関係なコンポーネントまで再レンダリングが発生する。

現在 SidebarContext を消費しているコンポーネント一覧:
- `Sidebar.tsx` - sortKey, sortDirection, closeMobileDrawer
- `SortSelector.tsx` - sortKey, sortDirection, setSortKey, setSortDirection
- `SidebarToggle.tsx` - isOpen, toggle
- `AppShell.tsx` - isOpen, isMobileDrawerOpen, closeMobileDrawer
- `WorktreeDetailRefactored.tsx` - toggle, openMobileDrawer
- `useSidebar.ts` - isOpen, width, isMobileDrawerOpen, toggle 等

**推奨対応**:
groupCollapsed を Sidebar コンポーネント内部の useState で管理し、localStorage 永続化のみ useEffect で行う設計を推奨。viewMode のみ SidebarContext に追加すれば、他コンポーネントへの影響を最小限にできる。

---

### S3-002: 既存テスト Sidebar.test.tsx のフラットリスト前提テストが破壊される可能性

**カテゴリ**: 影響範囲
**影響ファイル**: `tests/unit/components/layout/Sidebar.test.tsx`

**問題**:
既存のテストはフラットなリスト表示を前提としている。グループ化表示がデフォルトになると、グループヘッダーにもリポジトリ名が表示されるため、以下のテストケースが影響を受ける:

1. **`should show repository name for each branch`** - `screen.getAllByText('MyRepo')` が3件を期待しているが、グループヘッダーが追加されると4件以上になる
2. **検索フィルタリング系テスト** - グループヘッダーの表示/非表示ロジックによりアサーションが変わる
3. **空状態テスト** - グループヘッダーが存在しない場合の表示確認が必要

**推奨対応**:
テスト観点セクションに「グループヘッダー要素の追加によるセレクタの変更対応」を追加し、影響を受ける具体的なテストケースを明記する。

---

### S3-003: SidebarContext.test.tsx のテスト拡張が必要

**カテゴリ**: 影響範囲
**影響ファイル**: `tests/unit/contexts/SidebarContext.test.tsx`

**問題**:
現在のテストは isOpen, width, isMobileDrawerOpen のみをテストしている。viewMode を SidebarContext に追加する場合、TestConsumer コンポーネントの更新と新しいテストケースの追加が必要。

**推奨対応**:
テスト観点の「localStorage永続化の保存/復元テスト」を具体化する:
1. デフォルト viewMode の確認
2. viewMode 切替のディスパッチ
3. 不正な localStorage 値のフォールバック

---

### S3-005: sortBranches 関数とグループ化ロジックの関係が未整理

**カテゴリ**: 影響範囲
**影響ファイル**: `src/lib/sidebar-utils.ts`, `src/components/layout/Sidebar.tsx`

**問題**:
現在 Sidebar.tsx の filteredBranches useMemo 内で `sortBranches()` を呼んでフラットなソート済み配列を生成している（56行目）。グループ化表示では以下の2段階処理が必要:
1. repositoryName でグループ化 -> グループ間はリポジトリ名アルファベット順
2. グループ内はユーザー選択ソート（sortBranches 再利用）

既存の `sortBranches()` をどう組み合わせるか、新しいユーティリティ関数が必要かが明確でない。

**推奨対応**:
`sidebar-utils.ts` に `groupBranches()` 関数を追加する設計を推奨:
```typescript
type GroupedBranches = { repositoryName: string; branches: SidebarBranchItem[] }[];
function groupBranches(items: SidebarBranchItem[], sortKey: SortKey, sortDirection: SortDirection): GroupedBranches;
```
既存の `sortBranches()` はグループ内ソートとして再利用可能。

---

## Nice to Have（あれば良い）

### S3-006: 表示モード切替UIの配置位置がSortSelectorのレイアウトに影響する

**カテゴリ**: 影響範囲
**影響ファイル**: `src/components/layout/Sidebar.tsx`, `src/components/sidebar/SortSelector.tsx`

SortSelector 横にアイコンボタンを追加する場合、ヘッダーのレイアウト（flex items-center justify-between）に影響する。特にモバイル幅でのレイアウト崩れの可能性がある。アイコンのみのトグルボタンが適切。

---

### S3-007: useSidebar.ts フックの拡張が必要になる可能性

**カテゴリ**: 影響範囲
**影響ファイル**: `src/hooks/useSidebar.ts`, `src/contexts/SidebarContext.tsx`

新しい状態の localStorage 永続化は SidebarContext 内の useEffect パターン（sortKey/sortDirection と同様）に合わせて実装することを推奨。useSidebar.ts での追加対応は不要にできる。

---

### S3-008: sidebar-utils.test.ts へのグループ化ロジックテスト追加

**カテゴリ**: 影響範囲
**影響ファイル**: `tests/unit/lib/sidebar-utils.test.ts`

テスト観点の「グループ化ロジックの単体テスト」が `sidebar-utils.test.ts` への追加であることを明記する。

---

## 影響範囲マップ

### 直接変更が必要なファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/contexts/SidebarContext.tsx` | viewMode 状態、アクション、localStorage 永続化の追加 |
| `src/components/layout/Sidebar.tsx` | グループ化表示ロジック、グループヘッダーUI、表示モード切替ボタン |
| `src/lib/sidebar-utils.ts` | `groupBranches()` ユーティリティ関数の追加 |

### 新規作成が想定されるファイル

| ファイル | 内容 |
|---------|------|
| `src/components/sidebar/GroupHeader.tsx`（想定） | グループヘッダーコンポーネント |
| `src/components/sidebar/ViewModeToggle.tsx`（想定） | 表示モード切替ボタン |

### 変更不要だが確認が必要なファイル

| ファイル | 理由 |
|---------|------|
| `src/components/layout/AppShell.tsx` | モバイルドロワーで同じ Sidebar を使用するため動作確認が必要 |
| `src/components/sidebar/BranchListItem.tsx` | 変更不要。グループ内で従来通り使用 |
| `src/components/sidebar/SortSelector.tsx` | 隣接する表示モード切替UIとのレイアウト確認 |
| `src/components/worktree/WorktreeDetailRefactored.tsx` | SidebarContext 変更による再レンダリング影響確認 |

### テスト更新が必要なファイル

| ファイル | 更新内容 |
|---------|---------|
| `tests/unit/components/layout/Sidebar.test.tsx` | グループ化表示対応、既存テストのセレクタ修正 |
| `tests/unit/contexts/SidebarContext.test.tsx` | viewMode 状態のテスト追加 |
| `tests/unit/lib/sidebar-utils.test.ts` | `groupBranches()` のテスト追加 |

---

## 参照ファイル

### コード
- `src/contexts/SidebarContext.tsx`: 状態追加の主要ターゲット
- `src/components/layout/Sidebar.tsx`: グループ化表示ロジックとUIの主要変更箇所
- `src/lib/sidebar-utils.ts`: グループ化ユーティリティ関数の追加先
- `src/components/layout/AppShell.tsx`: モバイルドロワーで同じ Sidebar を使用
- `src/types/sidebar.ts`: SidebarBranchItem.repositoryName がグループ化キー

### テスト
- `tests/unit/components/layout/Sidebar.test.tsx`: 既存テストの修正必要
- `tests/unit/contexts/SidebarContext.test.tsx`: テスト拡張必要
- `tests/unit/lib/sidebar-utils.test.ts`: テスト追加必要
