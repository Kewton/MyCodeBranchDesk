# Issue #30: 深い階層のファイル表示 - 設計方針書

## 1. 概要

### 1.1 Issue情報
| 項目 | 内容 |
|------|------|
| Issue番号 | #30 |
| タイトル | 深い階層のファイルが見れない |
| 種類 | Bug |
| 影響範囲 | スマートフォン・PC両方のFiles表示機能 |

### 1.2 問題の現象
5階層目以降のファイル・ディレクトリが表示されない、または正しくインデントされない。

### 1.3 根本原因
**Tailwind CSSの動的クラス名生成の制限**

```typescript
// src/components/worktree/FileTreeView.tsx:70-79
function getIndentClass(depth: number): string {
  const paddingMap: Record<number, string> = {
    0: 'pl-2',   // ✓ 事前定義済み
    1: 'pl-6',   // ✓ 事前定義済み
    2: 'pl-10',  // ✓ 事前定義済み
    3: 'pl-14',  // ✓ 事前定義済み
    4: 'pl-18',  // ✓ 事前定義済み
    5: 'pl-22',  // ✓ 事前定義済み
  };
  return paddingMap[depth] || `pl-${2 + depth * 4}`;  // ✗ depth≥6で動的生成
}
```

Tailwind CSSはビルド時にクラス名を静的解析し、使用されているクラスのみをCSSに含める。
`pl-26`, `pl-30` などの動的に生成されるクラス名は検出されず、CSSが生成されない。

---

## 2. アーキテクチャ分析

### 2.1 現在のコンポーネント構成

```mermaid
graph TD
    subgraph "FileTreeView コンポーネント"
        FTV[FileTreeView] --> TN[TreeNode]
        TN --> TN
        TN --> GIC[getIndentClass]
    end

    subgraph "API層"
        API1[/api/worktrees/[id]/tree] --> FT[file-tree.ts]
        API2[/api/worktrees/[id]/tree/...path] --> FT
    end

    FTV --> API1
    FTV --> API2
```

### 2.2 データフロー

```
1. ユーザーがディレクトリをクリック
        ↓
2. fetchDirectory() で API 呼び出し
        ↓
3. file-tree.ts の readDirectory() がファイル一覧を返却
        ↓
4. TreeNode コンポーネントが再帰的に描画
        ↓
5. getIndentClass(depth) でインデント計算  ← 問題発生箇所
        ↓
6. depth ≥ 6 の場合、CSSが存在せず表示崩れ
```

### 2.3 関連ファイル一覧

| ファイル | 役割 | 修正必要 |
|---------|------|:--------:|
| `src/components/worktree/FileTreeView.tsx` | ファイルツリー表示 | ✓ |
| `src/lib/file-tree.ts` | ファイル読み込みロジック | ○ |
| `tailwind.config.js` | Tailwind設定 | △ |
| `tests/unit/components/worktree/FileTreeView.test.tsx` | ユニットテスト | ✓ |
| `tests/integration/api-file-tree.test.ts` | 結合テスト | ○ |

---

## 3. 設計方針

### 3.1 設計原則

| 原則 | 適用方法 |
|------|---------|
| **KISS** | インラインstyle使用で最もシンプルに解決 |
| **YAGNI** | MAX_DEPTH制限は実装不要（現状10階層で十分） |
| **DRY** | インデント計算ロジックを1箇所に集約 |
| **防御的プログラミング** | 深さの上限チェックを追加 |

### 3.2 採用方針: インラインstyle方式

```typescript
// 推奨実装
function getIndentStyle(depth: number): React.CSSProperties {
  const maxDepth = 20; // 安全な上限
  const clampedDepth = Math.min(depth, maxDepth);
  return {
    paddingLeft: `${0.5 + clampedDepth * 1}rem`, // 8px + depth * 16px
  };
}
```

#### 採用理由
1. **Tailwindの制約を完全に回避**: 動的な値も確実に適用
2. **無制限の深さに対応**: depth値に上限なし
3. **シンプルな実装**: 追加設定不要
4. **パフォーマンス影響なし**: インラインstyleは高速

---

## 4. 代替案の比較

### 4.1 比較表

| 方式 | メリット | デメリット | 採用 |
|------|---------|-----------|:----:|
| **インラインstyle** | シンプル、無制限対応 | Tailwindの一貫性が少し崩れる | ✓ |
| Tailwind safelist | Tailwind統一 | 設定複雑、クラス肥大化 | - |
| CSS変数 | 柔軟性高い | 実装複雑 | - |
| paddingMapを20階層まで拡張 | 簡単 | 冗長、将来的に不足可能 | - |

### 4.2 代替案詳細

#### 代替案1: Tailwind safelist方式

```javascript
// tailwind.config.js
module.exports = {
  safelist: [
    { pattern: /^pl-(2|6|10|14|18|22|26|30|34|38|42|46|50)$/ },
  ],
}
```

**不採用理由**:
- 設定が複雑になる
- 未使用CSSも生成されファイルサイズ増加
- safelist管理のメンテナンスコスト

#### 代替案2: CSS変数方式

```css
.tree-node {
  --indent-base: 0.5rem;
  --indent-step: 1rem;
  padding-left: calc(var(--indent-base) + var(--depth) * var(--indent-step));
}
```

**不採用理由**:
- CSS変数の動的設定が複雑
- React側での実装が煩雑

#### 代替案3: paddingMap拡張方式

```typescript
const paddingMap: Record<number, string> = {
  0: 'pl-2', 1: 'pl-6', 2: 'pl-10', 3: 'pl-14',
  4: 'pl-18', 5: 'pl-22', 6: 'pl-26', 7: 'pl-30',
  8: 'pl-34', 9: 'pl-38', 10: 'pl-42', // ... 20階層まで
};
```

**不採用理由**:
- 冗長なコード
- 階層が増えた場合に再度修正が必要
- `tailwind.config.js`にsafelistも必要

---

## 5. 詳細設計

### 5.1 修正対象

#### FileTreeView.tsx の getIndentClass 関数

**Before (問題のあるコード)**:
```typescript
function getIndentClass(depth: number): string {
  const paddingMap: Record<number, string> = {
    0: 'pl-2', 1: 'pl-6', 2: 'pl-10',
    3: 'pl-14', 4: 'pl-18', 5: 'pl-22',
  };
  return paddingMap[depth] || `pl-${2 + depth * 4}`;
}
```

**After (修正後のコード)**:
```typescript
/**
 * Calculate indent style based on depth
 * Uses inline style to avoid Tailwind dynamic class issues
 */
function getIndentStyle(depth: number): React.CSSProperties {
  // Safety clamp to prevent excessive indentation
  const maxVisualDepth = 20;
  const effectiveDepth = Math.min(depth, maxVisualDepth);

  // Base: 8px (0.5rem), Step: 16px (1rem) per level
  const paddingLeft = 0.5 + effectiveDepth * 1;

  return {
    paddingLeft: `${paddingLeft}rem`,
  };
}
```

### 5.2 TreeNodeコンポーネントの修正

**Before**:
```typescript
<div className={`... ${getIndentClass(depth)}`}>
```

**After**:
```typescript
<div className={`...`} style={getIndentStyle(depth)}>
```

### 5.3 インデント計算式

| depth | paddingLeft (rem) | paddingLeft (px) |
|------:|------------------:|-----------------:|
| 0 | 0.5 | 8 |
| 1 | 1.5 | 24 |
| 2 | 2.5 | 40 |
| 3 | 3.5 | 56 |
| 4 | 4.5 | 72 |
| 5 | 5.5 | 88 |
| 6 | 6.5 | 104 |
| 10 | 10.5 | 168 |
| 20 | 20.5 | 328 (上限) |

### 5.4 視覚的上限の設計

```
maxVisualDepth = 20
```

**理由**:
- 20階層を超える実用的なケースは稀
- depth > 20 でも表示はされる（20階層と同じインデント）
- 画面幅を超える極端なインデントを防止

---

## 6. テスト設計

### 6.1 追加すべきテストケース

#### ユニットテスト (FileTreeView.test.tsx)

```typescript
describe('getIndentStyle', () => {
  it('should return correct padding for depth 0', () => {
    expect(getIndentStyle(0)).toEqual({ paddingLeft: '0.5rem' });
  });

  it('should return correct padding for depth 5', () => {
    expect(getIndentStyle(5)).toEqual({ paddingLeft: '5.5rem' });
  });

  it('should return correct padding for depth 10', () => {
    expect(getIndentStyle(10)).toEqual({ paddingLeft: '10.5rem' });
  });

  it('should clamp depth at maxVisualDepth (20)', () => {
    expect(getIndentStyle(25)).toEqual({ paddingLeft: '20.5rem' });
  });
});

describe('TreeNode deep hierarchy', () => {
  it('should render files at depth 6 correctly', async () => {
    // depth 6のファイルが正しく表示されることを確認
  });

  it('should render files at depth 10 correctly', async () => {
    // depth 10のファイルが正しく表示されることを確認
  });
});
```

#### 結合テスト (api-file-tree.test.ts)

```typescript
describe('Deep hierarchy navigation', () => {
  it('should load directory at depth 6', async () => {
    // 6階層目のディレクトリが正しく読み込まれることを確認
  });

  it('should load directory at depth 10', async () => {
    // 10階層目のディレクトリが正しく読み込まれることを確認
  });
});
```

### 6.2 テストデータ

```
test-fixtures/
└── deep-hierarchy/
    └── level1/
        └── level2/
            └── level3/
                └── level4/
                    └── level5/
                        └── level6/
                            └── level7/
                                └── level8/
                                    └── level9/
                                        └── level10/
                                            └── test-file.txt
```

---

## 7. 実装計画

### 7.1 作業項目

| # | タスク | 優先度 | 影響範囲 |
|---|--------|:------:|---------|
| 1 | `getIndentClass` → `getIndentStyle` に変更 | 高 | FileTreeView.tsx |
| 2 | TreeNodeのclassName→style適用 | 高 | FileTreeView.tsx |
| 3 | 深い階層のユニットテスト追加 | 中 | テストファイル |
| 4 | 深い階層の結合テスト追加 | 中 | テストファイル |
| 5 | 既存テストの修正 | 低 | テストファイル |

### 7.2 リスク評価

| リスク | 影響度 | 対策 |
|--------|:------:|------|
| 既存のインデント表示が変わる | 低 | 計算式を既存と同等に調整 |
| スタイル競合 | 低 | inline styleは最優先で適用される |
| パフォーマンス低下 | 極低 | inline styleは高速 |

---

## 8. 品質基準

### 8.1 完了条件

- [ ] depth 0-10 のファイル/ディレクトリが正しく表示される
- [ ] depth 6以降でもインデントが正しく適用される
- [ ] モバイル・デスクトップ両方で動作確認
- [ ] 既存テストがすべてパス
- [ ] 新規テスト（深い階層）がすべてパス
- [ ] TypeScriptコンパイルエラーなし
- [ ] ESLintエラーなし

### 8.2 確認項目

```bash
# ビルド確認
npm run build

# テスト実行
npm run test:unit
npm run test:integration

# 型チェック
npx tsc --noEmit

# リント
npm run lint
```

---

## 9. 補足事項

### 9.1 LIMITS.MAX_DEPTHについて

`src/lib/file-tree.ts` に `MAX_DEPTH: 10` が定義されているが、現時点では実装されていない。

**方針**: 今回の修正では実装しない

**理由**:
- 視覚的な上限（maxVisualDepth=20）で十分
- 深い階層の制限はUX上好ましくない場合がある
- 必要に応じて将来的に実装可能

### 9.2 パフォーマンス考慮

現在の遅延読み込み（ディレクトリクリック時にAPI呼び出し）は維持。
深い階層でも各ディレクトリごとに個別に読み込むため、パフォーマンス問題は発生しない。

### 9.3 モバイル対応

深い階層ではインデントが画面幅を超える可能性がある。

**対策**:
- `maxVisualDepth = 20` でインデント上限を設定
- 必要に応じて水平スクロールで対応（既存の実装）

---

## 10. まとめ

| 項目 | 内容 |
|------|------|
| **問題** | Tailwind CSSの動的クラス生成制限により深い階層が表示されない |
| **解決策** | インラインstyle方式でpaddingLeftを直接指定 |
| **修正ファイル** | `src/components/worktree/FileTreeView.tsx` |
| **テスト追加** | 深い階層（depth 6-10）のテストケース |
| **リスク** | 低（既存動作への影響最小限） |

---

## 付録: 関連リソース

- [Tailwind CSS - Dynamic class names](https://tailwindcss.com/docs/content-configuration#dynamic-class-names)
- [React - Inline Styles](https://react.dev/reference/react-dom/components/common#applying-css-styles)
- Issue #30: https://github.com/Kewton/MyCodeBranchDesk/issues/30

---

*作成日: 2026-01-10*
*作成者: Claude Code*
