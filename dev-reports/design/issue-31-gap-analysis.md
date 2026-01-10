# Issue #31 ギャップ分析と対策

Issue #31: サイドバーのUX改善

作成日: 2026-01-10

---

## 1. 現状分析

### 1.1 左側インジケーター（BranchStatus）

| ステータス | 仕様 | 現状 | 状態 |
|-----------|------|------|------|
| `idle` | グレーの丸 | グレーの丸 (`bg-gray-500`) | OK |
| `ready` | 緑の丸 | 緑の丸 (`bg-green-500`) | OK |
| `running` | 青スピナー | 青スピナー (`border-blue-500`) | OK |
| `waiting` | **黄色の丸** | 緑の丸 (`bg-green-500`) | **要修正** |
| `generating` | 青スピナー | 青スピナー (`border-blue-500`) | OK |

**問題点**: `waiting` と `ready` が同じ緑色で区別できない

### 1.2 右側インジケーター（hasUnread）

| 項目 | 仕様 | 現状 | 状態 |
|------|------|------|------|
| 判定ロジック | `lastAssistantMessageAt > lastViewedAt` | `Boolean(lastUserMessageAt)` | **要修正** |
| DBカラム `last_viewed_at` | 必要 | なし | **要追加** |
| DBカラム `last_assistant_message_at` | 必要 | なし | **要追加** |
| 既読更新API | `PATCH /api/worktrees/:id/viewed` | なし | **要追加** |
| フロントエンド連携 | ブランチ選択時に既読更新 | なし | **要追加** |

**問題点**: 一度でもメッセージがあれば常に青丸が表示される

### 1.3 状態検出

| 項目 | 仕様 | 現状 | 状態 |
|------|------|------|------|
| ターミナル状態の直接検出 | 必要 | 実装済み | OK |
| thinking検出 | `✻ Considering...`等 | 実装済み | OK |
| プロンプト検出 | yes/no等 | 実装済み | OK |
| 入力プロンプト検出 | `❯` | 実装済み | OK |
| ポーリング間隔 | 約2秒 | 約2秒 | OK |

---

## 2. ギャップ一覧

### 2.1 高優先度（機能不全）

| # | ギャップ | 影響 | 対策 |
|---|---------|------|------|
| G1 | `waiting`が緑色 | `ready`との区別不可 | 黄色に変更 |
| G2 | `hasUnread`が常にtrue | 青丸が消えない | ロジック修正 |
| G3 | `last_viewed_at`カラムなし | 既読管理不可 | DBスキーマ追加 |
| G4 | 既読更新APIなし | 既読にできない | API追加 |

### 2.2 中優先度（UX改善）

| # | ギャップ | 影響 | 対策 |
|---|---------|------|------|
| G5 | `last_assistant_message_at`カラムなし | 毎回計算が必要 | DBスキーマ追加 |
| G6 | フロントエンド既読連携なし | 手動で既読にできない | コンポーネント修正 |

### 2.3 低優先度（将来対応）

| # | ギャップ | 影響 | 対策 |
|---|---------|------|------|
| G7 | `running`/`generating`が同じ | 状態の粒度が粗い | 将来分離検討 |

---

## 3. 対策詳細

### 3.1 G1: waitingの色を黄色に変更

**ファイル**: `src/components/sidebar/BranchStatusIndicator.tsx`

```typescript
// 変更前
waiting: {
  color: 'bg-green-500',
  label: 'Waiting',
  type: 'dot',
},

// 変更後
waiting: {
  color: 'bg-yellow-500',
  label: 'Waiting for response',
  type: 'dot',
},
```

**関連ファイル**:
- `src/components/mobile/MobileHeader.tsx`
- `src/components/worktree/WorktreeDetailRefactored.tsx`

**工数**: 小（30分）

---

### 3.2 G2-G4: hasUnreadロジック修正（DBスキーマ + API + ロジック）

#### 3.2.1 DBスキーマ追加

**ファイル**: `src/lib/db-migrations.ts`

```typescript
{
  version: 11,
  name: 'add-viewed-tracking',
  up: (db) => {
    db.exec(`
      ALTER TABLE worktrees ADD COLUMN last_viewed_at TEXT;

      -- パフォーマンス最適化インデックス（MF2対応）
      CREATE INDEX IF NOT EXISTS idx_chat_messages_assistant_latest
      ON chat_messages(worktree_id, role, timestamp DESC)
      WHERE role = 'assistant';
    `);
  },
},
```

**工数**: 小（15分）

#### 3.2.2 既読更新API追加

**新規ファイル**: `src/app/api/worktrees/[id]/viewed/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getDbInstance();

  // MF1対応: worktree存在確認
  const worktree = getWorktreeById(db, params.id);
  if (!worktree) {
    return NextResponse.json(
      { error: `Worktree '${params.id}' not found` },
      { status: 404 }
    );
  }

  db.prepare(`
    UPDATE worktrees
    SET last_viewed_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), params.id);

  // ログ出力（SF2対応）
  console.log(`[viewed] Marked worktree ${params.id} as viewed`);

  return NextResponse.json({ success: true });
}
```

**工数**: 小（30分）

#### 3.2.3 hasUnreadロジック修正

**ファイル**: `src/types/sidebar.ts`

```typescript
// 変更前
const hasUnread = Boolean(worktree.lastUserMessageAt);

// 変更後
function calculateHasUnread(worktree: Worktree): boolean {
  // アシスタントメッセージの最終時刻を取得（APIから）
  const lastAssistantAt = worktree.lastAssistantMessageAt;

  if (!lastAssistantAt) {
    return false;
  }

  if (!worktree.lastViewedAt) {
    return true;
  }

  return new Date(lastAssistantAt) > new Date(worktree.lastViewedAt);
}

const hasUnread = calculateHasUnread(worktree);
```

**関連修正**:
- `src/types/models.ts` - `lastViewedAt`, `lastAssistantMessageAt` 追加
- `src/lib/db.ts` - `getWorktreeById`, `getWorktrees` で取得
- `src/app/api/worktrees/route.ts` - レスポンスに含める
- `src/app/api/worktrees/[id]/route.ts` - レスポンスに含める

**工数**: 中（2時間）

---

### 3.3 G5: lastAssistantMessageAtの効率化

**選択肢A**: 毎回計算（シンプル）
```typescript
// getWorktreeById, getWorktrees で毎回サブクエリ
SELECT
  w.*,
  (SELECT MAX(timestamp) FROM chat_messages
   WHERE worktree_id = w.id AND role = 'assistant') as last_assistant_message_at
FROM worktrees w
```

**選択肢B**: カラム追加（効率的）
```sql
ALTER TABLE worktrees ADD COLUMN last_assistant_message_at TEXT;
```
+ メッセージ作成時に更新

**推奨**: 選択肢A（シンプル優先、パフォーマンス問題が出たらBに移行）

**工数**: 小（選択肢A: 30分）

---

### 3.4 G6: フロントエンド既読連携

**ファイル**: `src/components/sidebar/BranchList.tsx` または該当コンポーネント

```typescript
const handleBranchSelect = async (branchId: string) => {
  // 既存の選択処理
  setSelectedBranch(branchId);

  // 既読更新
  await fetch(`/api/worktrees/${branchId}/viewed`, { method: 'PATCH' });
};
```

**工数**: 小（30分）

---

## 4. 実装計画

### Phase 1: 視覚的区別（即時対応）

| # | タスク | 工数 | 優先度 |
|---|--------|------|--------|
| 1 | G1: waitingの色を黄色に変更 | 30分 | 高 |

**成果物**: `waiting`と`ready`の視覚的区別

### Phase 2: 未読管理基盤（必須）

| # | タスク | 工数 | 優先度 |
|---|--------|------|--------|
| 2 | G3: DBスキーマ追加 (last_viewed_at) | 15分 | 高 |
| 3 | G4: 既読更新API追加 | 30分 | 高 |
| 4 | G5: lastAssistantMessageAt取得 | 30分 | 高 |
| 5 | G2: hasUnreadロジック修正 | 1時間 | 高 |
| 6 | G6: フロントエンド既読連携 | 30分 | 中 |

**成果物**: 正常に動作する未読管理機能

### Phase 3: テスト・検証

| # | タスク | 工数 | 優先度 |
|---|--------|------|--------|
| 7 | ユニットテスト追加 | 1時間 | 中 |
| 8 | 手動テスト（状態遷移確認） | 30分 | 高 |

---

## 5. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| DBマイグレーション失敗 | データ損失 | バックアップ取得後に実行 |
| 既存データの`lastViewedAt`がnull | 全て未読表示 | 初回はfalseとして扱う（仕様通り） |
| ポーリング負荷増加 | パフォーマンス低下 | 必要に応じてキャッシュ導入 |

---

## 6. 完了条件

### 機能要件

- [ ] `waiting`ステータスが黄色で表示される
- [ ] ブランチ選択時に青丸（未読）が消える
- [ ] 別ブランチ作業中にClaudeが回答したら青丸が表示される
- [ ] 新規worktreeでは青丸が表示されない

### 非機能要件

- [ ] ビルドが成功する
- [ ] 既存のユニットテストがパスする
- [ ] 手動テストで状態遷移が仕様通り動作する

---

## 7. アーキテクチャレビュー対応

レビュー結果: `dev-reports/review/2026-01-10-issue-31-gap-analysis-review.md`

### 対応済み必須改善項目（Must Fix）

| # | 項目 | 対応内容 |
|---|------|---------|
| MF1 | 既読更新APIにworktree存在確認を追加 | 3.2.2節のAPIコードに`getWorktreeById`による存在確認を追加 |
| MF2 | パフォーマンス用インデックス追加 | 3.2.1節のマイグレーションに`idx_chat_messages_assistant_latest`を追加 |

### 対応済み推奨改善項目（Should Fix）

| # | 項目 | 対応内容 |
|---|------|---------|
| SF1 | 色設定の集約 | `src/config/status-colors.ts`を作成し、3コンポーネントの色設定を統一 |
| SF2 | 既読更新のログ追加 | 3.2.2節のAPIコードにログ出力を追加 |

### SF1実装詳細

**作成ファイル**: `src/config/status-colors.ts`

**更新ファイル**:
- `src/components/sidebar/BranchStatusIndicator.tsx` → `SIDEBAR_STATUS_CONFIG`を使用
- `src/components/mobile/MobileHeader.tsx` → `MOBILE_STATUS_CONFIG`を使用
- `src/components/worktree/WorktreeDetailRefactored.tsx` → `DESKTOP_STATUS_CONFIG`を使用

**G1も同時対応**: `waiting`ステータスの色を`bg-yellow-500`に統一

---

## 8. 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-01-10 | 初版作成 |
| 2026-01-10 | アーキテクチャレビュー反映: MF1, MF2, SF2対応 |
| 2026-01-10 | SF1実装: 色設定の集約、G1対応（waitingを黄色に変更） |
