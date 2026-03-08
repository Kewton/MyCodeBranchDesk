# Issue #449 仮説検証レポート

## 検証日時
- 2026-03-08

## 検証結果サマリー

Issue #449「サイドバー表示改善: リポジトリ単位のグループ化（折りたたみ対応）」は純粋な機能追加Issueであり、バグ原因の仮説や既存動作に関する前提条件の主張は含まれない。

**判定: 仮説なし → フェーズスキップ**

## コードベース事前調査（背景理解）

以下はレビュー品質向上のための事前調査結果。

### 現在のサイドバー実装

| ファイル | 役割 |
|---------|------|
| `src/components/layout/Sidebar.tsx` | フラット一覧レンダリング、検索・ソート |
| `src/components/sidebar/BranchListItem.tsx` | 個別アイテム（repositoryName表示済み） |
| `src/contexts/SidebarContext.tsx` | localStorage永続化（ソート設定） |
| `src/types/sidebar.ts` | SidebarBranchItem型（repositoryName含む） |
| `src/types/models.ts` | Worktree型（repositoryName, repositoryPath含む） |
| `src/lib/sidebar-utils.ts` | sortBranches()、SortKey型 |

### グループ化に必要な既存データ
- `repositoryName` → Worktree型に既存 ✅
- `repositoryPath` → Worktree型に既存 ✅
- localStorageパターン → SidebarContext.tsxに既存 ✅

### 未実装の機能（追加が必要）
1. グループヘッダーUIコンポーネント
2. グループ開閉状態管理
3. グループ状態のlocalStorage永続化
4. Sidebarのグループ化レンダリングロジック
5. グループ化ユーティリティ関数

## Stage 1レビューへの申し送り事項

- 仮説検証: なし（機能追加Issue）
- 事前調査でデータ基盤は整備済みと確認
- 実装タスクと受入条件の網羅性に注目してレビューすること
