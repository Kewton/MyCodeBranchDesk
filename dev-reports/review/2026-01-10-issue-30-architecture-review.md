# Issue #30 アーキテクチャレビュー

## レビュー対象

| 項目 | 内容 |
|------|------|
| Issue番号 | #30 |
| タイトル | 深い階層のファイルが見れない |
| 設計方針書 | `dev-reports/design/issue-30-deep-hierarchy-design-policy.md` |
| レビュー日 | 2026-01-10 |
| レビュアー | Claude Code (Senior Architect) |

---

## 1. 設計原則の遵守確認

### 1.1 SOLID原則チェック

| 原則 | 評価 | コメント |
|------|:----:|---------|
| **S**ingle Responsibility | :white_check_mark: | `getIndentStyle`関数は単一責務（インデント計算）を持つ |
| **O**pen/Closed | :white_check_mark: | インラインstyle方式により、深さ拡張時に修正不要 |
| **L**iskov Substitution | N/A | 継承関係なし |
| **I**nterface Segregation | N/A | インターフェース分離なし |
| **D**ependency Inversion | :white_check_mark: | 適切に分離されたユーティリティ関数 |

### 1.2 その他の設計原則

| 原則 | 評価 | コメント |
|------|:----:|---------|
| **KISS** | :white_check_mark: | インラインstyle方式は最もシンプルな解決策 |
| **YAGNI** | :white_check_mark: | MAX_DEPTH実装を見送る判断は適切 |
| **DRY** | :white_check_mark: | インデント計算は1箇所に集約 |

---

## 2. アーキテクチャ評価

### 2.1 構造的品質

| 評価項目 | スコア | コメント |
|---------|:------:|---------|
| **モジュール性** | 5/5 | `getIndentStyle`は独立したユーティリティ関数として適切に分離 |
| **結合度** | 4/5 | コンポーネントとユーティリティ関数間の結合は低い |
| **凝集度** | 5/5 | FileTreeView.tsx内で関連機能が集約されている |
| **拡張性** | 5/5 | インラインstyle方式により無制限の深さに対応 |
| **保守性** | 5/5 | 計算ロジックが明確で理解しやすい |

**総合スコア: 4.8/5** :star::star::star::star::star:

### 2.2 パフォーマンス観点

| 項目 | 評価 | 詳細 |
|------|:----:|------|
| **レスポンスタイム** | :white_check_mark: | インラインstyle計算はO(1)で高速 |
| **メモリ使用量** | :white_check_mark: | 追加のメモリオーバーヘッドなし |
| **スケーラビリティ** | :white_check_mark: | 遅延読み込み+キャッシングで大量ファイル対応 |
| **再レンダリング** | :white_check_mark: | `React.memo`による最適化が既存で実装済み |

### 2.3 既存の最適化実装（確認済み）

```typescript
// FileTreeView.tsx
- TreeNode: memo(function TreeNode(...))  // Line 168
- ChevronIcon: memo(function ChevronIcon(...))  // Line 86
- FolderIcon: memo(function FolderIcon(...))  // Line 106
- FileIcon: memo(function FileIcon(...))  // Line 124
- useMemo for iconColor  // Line 126
- useCallback for event handlers  // Lines 185, 198
- キャッシング: cache.set(path, data.items)  // Line 374
```

---

## 3. セキュリティレビュー

### 3.1 OWASP Top 10 チェック

| 脅威 | 対策状況 | 実装箇所 |
|------|:--------:|---------|
| **パストラバーサル攻撃** | :white_check_mark: | `src/lib/path-validator.ts:isPathSafe()` |
| **Null Byte Injection** | :white_check_mark: | `path-validator.ts:36, 50` |
| **URL Encoding Bypass** | :white_check_mark: | `path-validator.ts:41-47` |
| **除外パターン回避** | :white_check_mark: | `route.ts:hasExcludedSegment()` |
| **XSS** | :white_check_mark: | ReactのJSXエスケープ機能 |

### 3.2 セキュリティ実装確認

**path-validator.ts (Lines 29-68)**:
```typescript
export function isPathSafe(targetPath: string, rootDir: string): boolean {
  // 1. 空パスチェック
  // 2. Null byteチェック
  // 3. URL decoding
  // 4. 相対パス検証
  // ...
}
```

**route.ts (Lines 62-81)**:
```typescript
// セキュリティ: 除外パターンチェック
if (hasExcludedSegment(params.path)) { ... }

// セキュリティ: パス検証
if (!isPathSafe(relativePath, worktree.path)) { ... }
```

### 3.3 セキュリティ総評

:white_check_mark: **本修正はセキュリティに影響なし**

- 修正対象の`getIndentStyle`はUI表示ロジックのみ
- API層・パス検証には変更なし
- XSSリスクなし（React JSXによるエスケープ）

---

## 4. 既存システムとの整合性

### 4.1 技術スタック適合性

| 技術 | 評価 | コメント |
|------|:----:|---------|
| **Next.js 14** | :white_check_mark: | Server Components パターンに影響なし |
| **TypeScript** | :white_check_mark: | 型安全性維持 (`React.CSSProperties`) |
| **Tailwind CSS** | :warning: | 一部Tailwindから離脱（詳細は下記） |
| **Vitest** | :white_check_mark: | テスト修正で対応可能 |

### 4.2 Tailwind CSS一貫性への影響

**影響評価**: 軽微

```typescript
// Before: Tailwindクラス使用
<div className={`... ${getIndentClass(depth)}`}>

// After: インラインstyle使用
<div className={`...`} style={getIndentStyle(depth)}>
```

**緩和策**:
- 影響範囲はTreeNodeコンポーネントのみ（1箇所）
- 他のスタイリングは引き続きTailwindを使用
- 動的値にはインラインstyleが業界標準

---

## 5. リスク評価

### 5.1 リスクマトリックス

| リスク | 影響度 | 発生確率 | 対策優先度 | 対策 |
|--------|:------:|:--------:|:----------:|------|
| 既存テスト失敗 | 中 | 高 | **高** | テスト修正必須 |
| インデント値変更 | 低 | 中 | 中 | 計算式調整 |
| スタイル競合 | 極低 | 低 | 低 | N/A |
| パフォーマンス低下 | 極低 | 極低 | 低 | N/A |

### 5.2 テスト修正が必要な箇所

**FileTreeView.test.tsx:291**:
```typescript
// 現在のテスト（修正が必要）
expect(indexItem).toHaveClass('pl-6');

// 修正後のテスト
expect(indexItem).toHaveStyle({ paddingLeft: '1.5rem' });
```

### 5.3 インデント値の比較

| depth | 現在 (Tailwind) | 提案 (inline) | 差異 |
|------:|---------------:|--------------:|:----:|
| 0 | pl-2 (8px) | 0.5rem (8px) | なし |
| 1 | pl-6 (24px) | 1.5rem (24px) | なし |
| 2 | pl-10 (40px) | 2.5rem (40px) | なし |
| 3 | pl-14 (56px) | 3.5rem (56px) | なし |
| 4 | pl-18 (72px) | 4.5rem (72px) | なし |
| 5 | pl-22 (88px) | 5.5rem (88px) | なし |
| 6 | N/A (CSS欠落) | 6.5rem (104px) | **修正** |

:white_check_mark: **depth 0-5は既存と同一の値を維持**

---

## 6. 改善提案

### 6.1 必須改善項目（Must Fix）

| # | 項目 | 理由 | 対応 |
|---|------|------|------|
| 1 | テスト修正 | 既存テストが失敗する | `toHaveStyle`に変更 |

### 6.2 推奨改善項目（Should Fix）

| # | 項目 | 理由 | 対応 |
|---|------|------|------|
| 1 | 深い階層テスト追加 | リグレッション防止 | depth 6-10のテスト追加 |
| 2 | JSDoc追加 | 保守性向上 | 関数ドキュメント追記 |

### 6.3 検討事項（Consider）

| # | 項目 | 理由 |
|---|------|------|
| 1 | CSS Custom Properties化 | 将来的なテーマ対応 |
| 2 | `LIMITS.MAX_DEPTH`実装 | API層での深さ制限 |

---

## 7. テスト設計レビュー

### 7.1 現在のテストカバレッジ

| カテゴリ | テスト数 | カバレッジ |
|---------|:--------:|:----------:|
| 基本レンダリング | 4 | :white_check_mark: |
| ディレクトリ展開/折りたたみ | 6 | :white_check_mark: |
| ファイル選択 | 3 | :white_check_mark: |
| アイコン | 2 | :white_check_mark: |
| インデント | 1 | :warning: 修正必要 |
| ファイルサイズ表示 | 2 | :white_check_mark: |
| エラーハンドリング | 2 | :white_check_mark: |
| 空状態 | 1 | :white_check_mark: |
| ホバー/選択状態 | 1 | :white_check_mark: |
| アクセシビリティ | 3 | :white_check_mark: |
| キーボードナビゲーション | 2 | :white_check_mark: |
| **深い階層** | 0 | :x: 追加必要 |

### 7.2 追加すべきテストケース

```typescript
describe('Deep hierarchy indentation', () => {
  it('should apply correct padding for depth 6', async () => {
    // depth 6のファイルが正しくインデントされることを確認
    expect(item).toHaveStyle({ paddingLeft: '6.5rem' });
  });

  it('should apply correct padding for depth 10', async () => {
    // depth 10のファイルが正しくインデントされることを確認
    expect(item).toHaveStyle({ paddingLeft: '10.5rem' });
  });

  it('should clamp padding at maxVisualDepth (20)', async () => {
    // depth 25でも20階層分のインデントが適用されることを確認
    expect(item).toHaveStyle({ paddingLeft: '20.5rem' });
  });
});

describe('getIndentStyle', () => {
  it.each([
    [0, '0.5rem'],
    [5, '5.5rem'],
    [10, '10.5rem'],
    [20, '20.5rem'],
    [25, '20.5rem'], // clamped
  ])('returns correct padding for depth %i', (depth, expected) => {
    expect(getIndentStyle(depth)).toEqual({ paddingLeft: expected });
  });
});
```

---

## 8. 代替アーキテクチャとの比較

### 8.1 設計方針書の代替案評価

| 方式 | 設計方針書評価 | レビュー評価 | コメント |
|------|:-------------:|:------------:|---------|
| **インラインstyle** | 採用 | :white_check_mark: 適切 | 最もシンプルで確実 |
| Tailwind safelist | 不採用 | :white_check_mark: 適切 | 設定複雑、CSS肥大化 |
| CSS変数 | 不採用 | :white_check_mark: 適切 | オーバーエンジニアリング |
| paddingMap拡張 | 不採用 | :white_check_mark: 適切 | 冗長、メンテナンスコスト高 |

### 8.2 設計判断の妥当性

:white_check_mark: **インラインstyle方式の選択は適切**

**理由**:
1. Tailwindの制約を完全に回避
2. 実装コストが最も低い
3. 追加の設定ファイル変更不要
4. 将来的な深さ拡張に自動対応

---

## 9. 総合評価

### 9.1 レビューサマリ

| 項目 | 評価 |
|------|------|
| **全体評価** | :star::star::star::star::star: (5/5) |
| **設計品質** | 優秀 |
| **リスクレベル** | 低 |
| **実装難易度** | 低 |

### 9.2 強み

1. **シンプルな解決策**: 複雑な設定変更なしで問題解決
2. **将来対応力**: 無制限の深さに自動対応
3. **低リスク**: 既存動作への影響最小限
4. **セキュリティ維持**: API層に変更なし

### 9.3 弱み

1. **テスト修正必要**: 1箇所のテスト修正が必須
2. **Tailwind一貫性**: 一部でインラインstyleを使用

### 9.4 総評

設計方針書は問題の根本原因を正確に特定し、最もシンプルで効果的な解決策を提案している。SOLID原則、KISS、YAGNIに準拠しており、セキュリティへの影響もない。テスト修正を適切に行えば、安全に実装可能。

---

## 10. 承認判定

### :white_check_mark: **承認（Approved）**

### 承認条件

1. [x] 設計原則への準拠確認完了
2. [x] セキュリティリスクなし確認完了
3. [x] 既存システムとの整合性確認完了
4. [x] 代替案との比較検討完了

### 実装時の注意事項

1. **テスト修正を先に実施**: `FileTreeView.test.tsx:291`の`toHaveClass`→`toHaveStyle`変更
2. **深い階層テスト追加**: depth 6-10, 20, 25のテストケース追加
3. **ビジュアルリグレッションテスト**: モバイル・デスクトップで実機確認

---

## 11. 次のステップ

### 実装フロー

```mermaid
graph LR
    A[設計レビュー承認] --> B[テスト修正]
    B --> C[getIndentStyle実装]
    C --> D[TreeNode修正]
    D --> E[深い階層テスト追加]
    E --> F[CI/CD確認]
    F --> G[PR作成]
```

### 推奨コマンド

```bash
# 実装開始
/tdd-impl #30

# または手動で
npm run test:unit -- --watch
# テスト修正後に実装
```

---

*レビュー完了日: 2026-01-10*
*レビュアー: Claude Code (Senior Architect)*
