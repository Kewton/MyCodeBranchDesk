# Issue #100: Mermaid Diagram Rendering Design Policy

## 概要

マークダウンエディタのプレビュー機能で、mermaidダイアグラム（フローチャート、シーケンス図、ER図など）をSVGとして描画する機能を追加する。

## 設計方針

### 1. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────┐
│                    MarkdownEditor.tsx                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  ReactMarkdown                       │    │
│  │  ┌────────────────────────────────────────────────┐ │    │
│  │  │              remarkPlugins                      │ │    │
│  │  │  - remarkGfm                                    │ │    │
│  │  └────────────────────────────────────────────────┘ │    │
│  │  ┌────────────────────────────────────────────────┐ │    │
│  │  │              rehypePlugins                      │ │    │
│  │  │  - rehypeSanitize (XSS protection)             │ │    │
│  │  │  - rehypeHighlight                              │ │    │
│  │  │  - [NEW] mermaid handling                       │ │    │
│  │  └────────────────────────────────────────────────┘ │    │
│  │  ┌────────────────────────────────────────────────┐ │    │
│  │  │              components prop                    │ │    │
│  │  │  - code: MermaidCodeBlock (conditional)        │ │    │
│  │  └────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            MermaidDiagram (dynamic import)          │    │
│  │  - ssr: false                                        │    │
│  │  - mermaid.render() on client                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2. 選定アプローチ

**アプローチA: カスタムコンポーネント方式**（推奨）

ReactMarkdownの`components` propを使用して、mermaidコードブロックをカスタムコンポーネントで処理する。

**選定理由**:
- rehype-mermaidはNode.js環境での処理が前提であり、Next.js 14のApp Routerとの互換性検証が必要
- カスタムコンポーネント方式はクライアントサイド完結で動作が確実
- 既存のrehype-sanitize, rehype-highlightとの競合リスクが低い
- mermaidライブラリの直接制御が可能（securityLevel等）

### 3. コンポーネント設計

#### 3.1 MermaidDiagram コンポーネント

**ファイル**: `src/components/worktree/MermaidDiagram.tsx`

```tsx
/**
 * MermaidDiagram Component
 *
 * Renders mermaid diagram syntax as SVG using mermaid.js library.
 * Must be dynamically imported with ssr: false.
 *
 * @security Uses mermaid securityLevel='strict' to prevent XSS
 */
'use client';

interface MermaidDiagramProps {
  code: string;
  id?: string;
}

export function MermaidDiagram({ code, id }: MermaidDiagramProps): JSX.Element
```

**責務**:
- mermaidコードをSVGにレンダリング
- 構文エラー時のエラーメッセージ表示
- レンダリング中のローディング表示

**状態管理**:
- `svg`: レンダリング結果のSVG文字列
- `error`: エラーメッセージ
- `isLoading`: レンダリング中フラグ

#### 3.2 MermaidCodeBlock コンポーネント

**ファイル**: `src/components/worktree/MermaidCodeBlock.tsx`

```tsx
/**
 * MermaidCodeBlock Component
 *
 * Wrapper component for ReactMarkdown's code block.
 * Conditionally renders MermaidDiagram for mermaid language.
 */
'use client';

import dynamic from 'next/dynamic';

import { Loader2 } from 'lucide-react'; // [SF2-004] 既存スピナーアイコン利用

const MermaidDiagram = dynamic(
  () => import('./MermaidDiagram').then(mod => mod.MermaidDiagram),
  {
    ssr: false,
    // [SF2-004] 既存のローディングUIパターンに合わせてスピナーアイコンを使用
    loading: () => (
      <div className="mermaid-loading flex items-center gap-2 text-gray-500 p-4">
        <Loader2 className="animate-spin h-4 w-4" />
        <span>Loading diagram...</span>
      </div>
    )
  }
);

/**
 * MermaidCodeBlock Props Interface
 *
 * [SF2-001] ReactMarkdownのCodeComponent型との互換性を確保。
 * childrenはReactMarkdownから文字列または文字列配列として渡される可能性がある。
 *
 * @see ReactMarkdownProps['components']['code'] for type reference
 */
interface MermaidCodeBlockProps {
  className?: string;
  children?: React.ReactNode | string | string[];
  node?: Element; // ReactMarkdown passes AST node
  inline?: boolean; // インラインコードかどうか
}

export function MermaidCodeBlock({ className, children, inline }: MermaidCodeBlockProps): JSX.Element
```

**責務**:
- コードブロックの言語判定（mermaid vs その他）
- mermaidの場合はMermaidDiagramに委譲
- その他の場合は既存のcode要素をレンダリング

### 4. MarkdownEditor.tsx への統合

#### 4.1 変更箇所

```tsx
// 新規import追加
import { MermaidCodeBlock } from './MermaidCodeBlock';

// ReactMarkdown の components prop 追加
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[
    rehypeSanitize, // [SEC-MF-001] XSS protection
    rehypeHighlight,
  ]}
  components={{
    code: MermaidCodeBlock, // mermaidコードブロック対応
  }}
>
  {previewContent}
</ReactMarkdown>
```

#### 4.2 変更ファイル一覧

| ファイル | 変更種別 | 変更内容 |
|---------|---------|---------|
| `src/config/mermaid-config.ts` | 新規作成 | mermaid設定定数（[SF-001]対応） |
| `src/components/worktree/MermaidDiagram.tsx` | 新規作成 | mermaid描画コンポーネント |
| `src/components/worktree/MermaidCodeBlock.tsx` | 新規作成 | コードブロックラッパー |
| `src/components/worktree/MarkdownEditor.tsx` | 修正 | components prop追加 |
| `package.json` | 修正 | mermaid依存追加 |
| `tests/unit/components/MermaidDiagram.test.tsx` | 新規作成 | ユニットテスト |
| `tests/unit/components/MermaidCodeBlock.test.tsx` | 新規作成 | ユニットテスト |

> **Note [SF3-004]**: スタイリングはTailwind CSSのインラインクラスで実装する。
> `.mermaid-container`、`.mermaid-loading`、`.mermaid-error`はTailwind utility classesで定義し、
> 別途CSSファイル（globals.css等）への追加は不要。
> これは既存のMarkdownEditorコンポーネントのスタイリングアプローチと一貫している。

### 5. セキュリティ設計

#### 5.1 mermaid設定の一元管理（[SF-001]対応）

**ファイル**: `src/config/mermaid-config.ts`

```tsx
/**
 * Mermaid configuration constants
 *
 * Centralizes all mermaid.initialize() settings for DRY principle.
 * Future theme switching or configuration changes should only modify this file.
 *
 * @module config/mermaid-config
 * @see https://mermaid.js.org/config/setup/modules/mermaidAPI.html#mermaidapi-configuration-defaults
 */

export const MERMAID_CONFIG = {
  /** [SEC-001] XSSスクリプト無効化 - must be 'strict' in production */
  securityLevel: 'strict' as const,
  /** 自動レンダリングを無効化（手動render呼び出しを使用） */
  startOnLoad: false,
  /** デフォルトテーマ - 将来的にダークモード対応時に変更可能 */
  theme: 'default' as const,
} as const;

/** Mermaid設定の型定義 */
export type MermaidConfig = typeof MERMAID_CONFIG;
```

**MermaidDiagram.tsx での使用**:

```tsx
import mermaid from 'mermaid';
import { MERMAID_CONFIG } from '@/config/mermaid-config';

// 初期化は1箇所のみ（useEffect内またはモジュールトップレベル）
mermaid.initialize(MERMAID_CONFIG);
```

**設計意図**:
- DRY原則: 設定値を単一ファイルに集約
- 将来の拡張: テーマ切替、セキュリティレベル変更が1箇所の修正で完了
- 型安全: as constによるリテラル型定義

#### 5.1.1 securityLevel検証のフェイルセーフ機構（[SEC-SF-003]対応）

設定の誤変更やmermaid.initialize()の呼び出し漏れに対するフェイルセーフを実装する。

**実装方針**:

```tsx
// MermaidDiagram.tsx での securityLevel 検証
import mermaid from 'mermaid';
import { MERMAID_CONFIG } from '@/config/mermaid-config';

/**
 * mermaid初期化時にsecurityLevelが'strict'であることを検証
 *
 * [SEC-SF-003] セキュリティ設定のフェイルセーフ機構
 * - securityLevel='strict'以外が設定された場合はエラーを投げる
 * - 本番環境でのXSS脆弱性を防止
 */
function initializeMermaidWithValidation(): void {
  // 設定検証: securityLevelが'strict'であることを確認
  if (MERMAID_CONFIG.securityLevel !== 'strict') {
    throw new Error(
      `[SECURITY] mermaid securityLevel must be 'strict', but got '${MERMAID_CONFIG.securityLevel}'. ` +
      'This is a security requirement to prevent XSS attacks.'
    );
  }

  mermaid.initialize(MERMAID_CONFIG);

  // 初期化後の検証（オプション: mermaidの内部状態を確認）
  // mermaidは設定をグローバル状態として保持するため、
  // 将来のバージョンでgetConfigが利用可能な場合に検証を追加可能
}
```

**テストでの検証**:

```tsx
// tests/unit/components/MermaidDiagram.test.tsx
describe('Security Configuration', () => {
  it('should use securityLevel strict', () => {
    expect(MERMAID_CONFIG.securityLevel).toBe('strict');
  });

  it('should throw error if securityLevel is not strict', () => {
    // モックで securityLevel を変更した場合のテスト
    const invalidConfig = { ...MERMAID_CONFIG, securityLevel: 'loose' };
    // 検証関数が例外を投げることを確認
  });
});
```

**mermaid-config.ts へのコメント追加**:

```tsx
export const MERMAID_CONFIG = {
  /**
   * [SEC-001] XSSスクリプト無効化 - must be 'strict' in production
   *
   * WARNING: この値を'strict'以外に変更しないでください。
   * 'strict'以外の値はXSS脆弱性を引き起こす可能性があります。
   * MermaidDiagram.tsxの初期化時にこの値が検証されます。
   *
   * @see SEC-SF-003 セキュリティレビュー指摘事項
   */
  securityLevel: 'strict' as const,
  // ... other settings
} as const;
```

#### 5.2 rehype-sanitizeとの互換性とdangerouslySetInnerHTML使用の安全性根拠（[SEC-SF-001]対応）

##### mermaid securityLevel='strict'のXSS防止メカニズム

mermaidライブラリはsecurityLevel='strict'設定時、内部で**DOMPurify**を使用してSVG出力をサニタイズする。具体的な防止メカニズムは以下の通り:

1. **scriptタグの除去**: SVG内の`<script>`タグは完全に除去される
2. **イベントハンドラの無効化**: `onclick`, `onerror`, `onload`等のイベントハンドラ属性は除去される
3. **危険なURLスキームのブロック**: `javascript:`, `data:`, `vbscript:`スキームのURLは無害化される
4. **外部リソース制限**: 外部スクリプトや外部スタイルシートの読み込みはブロックされる

##### dangerouslySetInnerHTML使用の例外理由

Issue #49設計書ではdangerouslySetInnerHTML禁止が明記されているが、本設計では以下の理由により例外として扱う:

| 観点 | 説明 |
|-----|------|
| **サニタイズ済みコンテンツ** | mermaidが生成するSVGはライブラリ内部でDOMPurifyによりサニタイズ済み |
| **securityLevel='strict'** | mermaidの最も厳格なセキュリティ設定を使用 |
| **外部ライブラリの責務** | mermaidはダイアグラム描画専門ライブラリであり、セキュリティ対策が十分に施されている |
| **代替手段の不在** | mermaid.render()はSVG文字列を返すため、DOMへの挿入にはdangerouslySetInnerHTMLまたはDOM操作が必要 |

##### 設計上の整合性

```
┌─────────────────────────────────────────────────────────────┐
│               ReactMarkdown Processing Pipeline              │
├─────────────────────────────────────────────────────────────┤
│  非mermaidコンテンツ    │    mermaidコードブロック           │
│  ──────────────────────┼─────────────────────────────────── │
│  rehype-sanitize       │    MermaidDiagram                  │
│  (XSS protection)      │    (mermaid内部DOMPurify)          │
│                        │    + dangerouslySetInnerHTML       │
└─────────────────────────────────────────────────────────────┘
```

- **非mermaidコンテンツ**: rehype-sanitizeによるXSS防止（既存動作）
- **mermaidコードブロック**: mermaid内部のDOMPurifyによるサニタイズ後、dangerouslySetInnerHTMLで描画

この分離により、既存のdangerouslySetInnerHTML禁止ポリシーとの整合性を保ちつつ、mermaid描画に必要な例外を安全に許可する。

#### 5.2.1 Issue #95 SVG XSS対策との整合性（[SEC-SF-004]対応）

Issue #95では静的SVGファイルアップロード用に`validateSvgContent()`関数を実装し、5項目のXSS検証を行っている。mermaid動的生成SVGとの整合性を以下に示す。

##### Issue #95 SVG XSS対策項目とmermaid securityLevel='strict'の比較

| Issue #95 検証項目 | mermaid securityLevel='strict'での対応 | 整合性 |
|------------------|--------------------------------------|--------|
| 1. scriptタグ拒否 | DOMPurifyがscriptタグを除去 | OK |
| 2. イベントハンドラ属性(on*)拒否 | DOMPurifyがイベントハンドラを除去 | OK |
| 3. javascript:/data:/vbscript:スキーム拒否 | DOMPurifyが危険なURLスキームを無害化 | OK |
| 4. foreignObject要素拒否 | securityLevel='strict'でforeignObjectは制限される | OK |
| 5. (補足)XML宣言チェック | mermaid生成SVGはXML宣言を含まない | N/A |

##### 検証結果サマリ

mermaidのsecurityLevel='strict'は、Issue #95の`validateSvgContent()`が検証する主要な5項目すべてをカバーしている。ただし、以下の点で実装アプローチが異なる:

- **Issue #95**: 静的SVGファイルに対する**事前検証**（アップロード時にブロック）
- **Issue #100**: 動的生成SVGに対する**内部サニタイズ**（生成時にDOMPurifyで無害化）

##### テストでの整合性確認

8.4節のXSS回帰テストで、Issue #95の検証項目がmermaid出力でも防止されることを確認する:

```tsx
describe('Issue #95 SVG XSS alignment (SEC-SF-004)', () => {
  // Issue #95 検証項目1: scriptタグ
  it('should prevent script tags (Issue #95 item 1)', async () => {
    const code = 'graph TD\nA[<script>alert(1)</script>]';
    const result = await renderMermaid(code);
    expect(result).not.toContain('<script');
  });

  // Issue #95 検証項目2: イベントハンドラ
  it('should prevent event handlers (Issue #95 item 2)', async () => {
    const code = 'graph TD\nA[<div onclick="alert(1)">]';
    const result = await renderMermaid(code);
    expect(result).not.toMatch(/on\w+=/i);
  });

  // Issue #95 検証項目3: 危険なURLスキーム
  it('should prevent dangerous URL schemes (Issue #95 item 3)', async () => {
    const code = 'graph TD\nA[Click]\nclick A "javascript:alert(1)"';
    const result = await renderMermaid(code);
    expect(result).not.toContain('javascript:');
  });

  // Issue #95 検証項目4: foreignObject
  it('should restrict foreignObject (Issue #95 item 4)', async () => {
    // mermaid securityLevel='strict'ではforeignObjectの使用が制限される
    // テストでSVG出力にforeignObjectが含まれないことを確認
  });
});
```

#### 5.3 セキュリティチェックリスト

| 項目 | 対策 | ステータス |
|-----|------|----------|
| mermaid SVG XSS | securityLevel='strict' | 設計済み |
| scriptタグ実行 | mermaid内部DOMPurifyで除去 | 設計済み |
| イベントハンドラ | securityLevel='strict'で除去 | 設計済み |
| 危険なURLスキーム | DOMPurifyで無害化 | 設計済み |
| foreignObject | securityLevel='strict'で制限 | 設計済み |
| 外部リソース読み込み | CSPヘッダーで制限 | 既存対策 |
| dangerouslySetInnerHTML | mermaid内部サニタイズ済みのため例外許可 | 設計済み([SEC-SF-001]) |
| Issue #95整合性 | 5項目すべてカバー確認 | 設計済み([SEC-SF-004]) |
| securityLevel検証 | フェイルセーフ機構で検証 | 設計済み([SEC-SF-003]) |

### 6. パフォーマンス設計

#### 6.1 バンドルサイズ最適化

```tsx
// 遅延読み込みによる初期バンドル影響なし
const MermaidDiagram = dynamic(
  () => import('./MermaidDiagram'),
  { ssr: false }
);
```

#### 6.2 レンダリング最適化

- `useMemo`でmermaidコードのハッシュ計算
- 同一コードの再レンダリング防止
- デバウンス適用（既存のPREVIEW_DEBOUNCE_MS利用）

#### 6.3 初回レンダリングの遅延（[SF3-002]対応）

mermaidライブラリは**遅延初期化（lazy initialization）**を行う。初回のダイアグラムレンダリング時に以下の処理が発生する:

1. `mermaid.initialize()`によるライブラリ初期化
2. 内部パーサーとレンダラーの初期化
3. デフォルトテーマとスタイルの読み込み

**初回レンダリング遅延**: 100-300ms（デバイス性能による）

**対応策**:
- dynamic importのloading UIでユーザーに待機中であることを視覚的に示す
- `Loader2`スピナーアイコンで「Loading diagram...」メッセージを表示
- 2回目以降のレンダリングは初期化済みのため高速（数ms）

**パフォーマンス監視のポイント**:
- 低スペックデバイスでの初回レンダリング時間
- 複数ダイアグラムを含むドキュメントの初期表示
- 将来的な最適化として、`mermaid.initialize()`をアプリケーション起動時に実行することも検討可能

#### 6.4 メモリ管理

- コンポーネントアンマウント時のクリーンアップ

> **Note [SF-002]**: SVGキャッシュ制限は初期実装スコープから除外。
> YAGNI原則に基づき、メモリ問題が実際に発生した場合に対応する。
> 詳細は「将来の拡張ポイント」セクションを参照。

### 7. エラーハンドリング設計

#### 7.1 エラー種別と対応

| エラー種別 | 原因 | 対応 |
|-----------|------|------|
| SyntaxError | mermaid構文エラー | エラーメッセージ表示 |
| RenderError | SVG生成失敗 | フォールバック表示 |
| LoadError | mermaidライブラリ読み込み失敗 | 「再読み込みしてください」メッセージ表示 |

> **Note [NTH-002]**: LoadErrorのリトライボタンは初期実装から除外。
> mermaidライブラリの読み込み失敗は稀であり、ページリロードで対応可能。
> KISS原則に基づき、シンプルなメッセージ表示のみとする。

#### 7.2 エラー表示UI

```tsx
<div className="mermaid-error bg-red-50 border border-red-200 p-4 rounded">
  <p className="text-red-600 font-medium">Diagram Error</p>
  <pre className="text-sm text-red-500 mt-2">{errorMessage}</pre>
</div>
```

### 8. テスト設計

#### 8.1 テスト環境設定（[SF2-003]対応）

テストファイルには `@vitest-environment` ディレクティブを含めること。

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
```

#### 8.2 ユニットテスト

**MermaidDiagram.test.tsx**:
- 正常系: flowchart描画成功
- 正常系: sequenceDiagram描画成功
- 異常系: 構文エラー時のエラー表示
- 異常系: 空コードの処理

**MermaidCodeBlock.test.tsx**:
- mermaid言語の判定
- 非mermaidコードブロックの通過
- inline codeブロックのパススルー（[SF2-001]対応）

#### 8.3 統合テスト

**MarkdownEditor.test.tsx 追加ケース**:
- mermaidコードブロックを含むマークダウンのレンダリング
- 既存機能（GFMテーブル等）の回帰テスト
- rehype-sanitizeとの互換性

#### 8.4 XSS回帰テスト（[SF3-003]対応）

mermaidコードブロック内の悪意あるコンテンツに対するXSS防止テストを追加する。
これは既存のSEC-MF-001（rehype-sanitize XSS protection）の拡張として実装する。

**MermaidDiagram.test.tsx 追加ケース**:

```tsx
describe('XSS Prevention (SEC-MF-001 regression)', () => {
  it('should sanitize script tags in node labels', async () => {
    const maliciousCode = `
graph TD
A[<script>alert('xss')</script>]
B[Normal Node]
A --> B
`;
    // SVG出力にscriptタグが含まれていないことを検証
  });

  it('should sanitize event handlers in node labels', async () => {
    const maliciousCode = `
graph TD
A[<img src=x onerror="alert('xss')">]
B[Normal Node]
A --> B
`;
    // SVG出力にonerrorが含まれていないことを検証
  });

  it('should sanitize javascript: URLs in links', async () => {
    const maliciousCode = `
graph TD
A[Click me]
click A "javascript:alert('xss')"
`;
    // SVG出力にjavascript:が含まれていないことを検証
  });

  it('should handle nested malicious content', async () => {
    const maliciousCode = `
sequenceDiagram
Alice->>Bob: <script>document.cookie</script>
Bob-->>Alice: <img src=x onerror=alert(1)>
`;
    // SVG出力に悪意あるコンテンツが含まれていないことを検証
  });
});
```

**テストの検証ポイント**:
1. `<script>`タグがSVG出力に含まれていないこと
2. `onerror`、`onclick`等のイベントハンドラ属性が除去されていること
3. `javascript:`, `data:`, `vbscript:`スキームのURLが無害化されていること
4. mermaidの`securityLevel='strict'`設定が正しく機能していること

#### 8.5 セキュリティ設定検証テスト（[SEC-SF-003]対応）

mermaid設定のsecurityLevel検証をテストで担保する。

```tsx
describe('Security Configuration (SEC-SF-003)', () => {
  it('should have securityLevel set to strict', () => {
    expect(MERMAID_CONFIG.securityLevel).toBe('strict');
  });

  it('should throw error when securityLevel is not strict', () => {
    // initializeMermaidWithValidation関数のエラーハンドリングをテスト
  });

  it('should initialize mermaid with strict security level', () => {
    // mermaid.initialize()が正しい設定で呼び出されることを検証
  });
});
```

### 9. モバイル対応

#### 9.1 レスポンシブ表示

```css
.mermaid-container {
  max-width: 100%;
  overflow-x: auto;
}

.mermaid-container svg {
  max-width: 100%;
  height: auto;
}
```

#### 9.2 大きなダイアグラムの処理

- コンテナ内での横スクロール有効化
- ピンチズームは将来の拡張として検討

### 10. 依存関係

#### 10.1 新規依存パッケージ

```json
{
  "dependencies": {
    "mermaid": "^11.12.2"
  }
}
```

> **Note [SEC-SF-002]**: 初期導入時は最新安定版11.12.2を使用。
> セマンティックバージョニング（^11.12.2）によりパッチ適用が可能。
> package-lock.jsonで正確なバージョン管理を徹底する。

#### 10.2 mermaidパッケージの詳細情報（[SF3-001]対応）

mermaidパッケージは以下の特性を持つ大規模なライブラリである:

**依存関係の規模**:
- **直接依存**: 20パッケージ
- **主要な依存ライブラリ**:
  - d3（データ可視化）
  - cytoscape（グラフ描画）
  - katex（数式レンダリング）
  - marked（マークダウンパーサー）
  - dompurify（XSSサニタイズ）
  - dagre-d3-es（DAGレイアウト）

**パッケージサイズ**:
- **Unpacked size**: 66.2 MB
- **現在のnode_modules**: 約528MB
- **予想される増加**: 約10-12%（推定60-65MB増）

**バンドルサイズへの影響**:
- dynamic import（`ssr: false`）により**初期バンドルへの影響はなし**
- mermaidを使用するページのみでオンデマンドロード
- Tree-shakingによる最適化は限定的（mermaidは完全にバンドルされる）

**npm ci時間への影響**:
- 推定増加: 10-15秒
- 既存のCIキャッシュ機構で緩和される

#### 10.3 バージョン方針

- マイナーバージョン固定（^11.12.2）
- セキュリティアップデートは定期確認
- Dependabotまたはrenovateによる定期的なセキュリティアップデート監視を推奨
- CIでnpm auditを実行し、脆弱性を早期検出

### 11. 実装順序

1. **Phase 1**: mermaid設定ファイル作成（`src/config/mermaid-config.ts`）
2. **Phase 2**: MermaidDiagramコンポーネント実装
3. **Phase 3**: MermaidCodeBlockコンポーネント実装
4. **Phase 4**: MarkdownEditor.tsx統合
5. **Phase 5**: ユニットテスト追加
6. **Phase 6**: 統合テスト・回帰テスト
7. **Phase 7**: ドキュメント更新（CLAUDE.md）

---

## 設計原則への準拠

### SOLID原則

| 原則 | 準拠状況 | 説明 |
|------|---------|------|
| SRP | OK | MermaidDiagram: 描画のみ、MermaidCodeBlock: 判定のみ |
| OCP | OK (注1) | 新規コンポーネント追加で既存コードへの影響最小。将来の拡張ポイントを「将来の拡張ポイント」セクションに定義 |
| LSP | OK | MermaidCodeBlock は code 要素として置換可能 |
| ISP | OK | 必要最小限のpropsのみ定義 |
| DIP | OK | mermaidライブラリへの依存は MermaidDiagram 内に隔離 |

> **注1 [SF-003]**: OCP準拠を強化するため、将来の拡張ポイントを明確化。詳細は「将来の拡張ポイント」セクションを参照。

### その他の設計原則

| 原則 | 準拠状況 | 説明 |
|------|---------|------|
| KISS | OK | シンプルなコンポーネント分割、LoadErrorリトライ機能は省略 |
| YAGNI | OK | 必要機能のみ実装。SVGキャッシュ制限は問題発生時に対応 |
| DRY | OK | mermaid設定は`src/config/mermaid-config.ts`に一元管理 |

---

## 将来の拡張ポイント

### Phase 2: 他ダイアグラム言語対応（[SF-003]）

将来的にPlantUML、D2、Graphviz等の他ダイアグラム言語をサポートする場合の拡張設計。

#### DiagramRenderer インターフェース設計

```tsx
/**
 * 将来の拡張用: ダイアグラム言語レンダラーのインターフェース
 *
 * 新しいダイアグラム言語を追加する場合:
 * 1. DiagramRendererインターフェースを実装
 * 2. DIAGRAM_RENDERERSに登録
 * 3. MermaidCodeBlockの言語判定を更新（または共通DiagramCodeBlockに置換）
 */
interface DiagramRenderer {
  /** サポートする言語名（コードブロックの言語指定） */
  language: string;
  /** ダイアグラムコードをSVG/HTMLにレンダリング */
  render: (code: string, id: string) => Promise<string>;
  /** レンダラーの初期化（必要な場合） */
  initialize?: () => Promise<void>;
  /** セキュリティ設定の検証 */
  validateSecurityConfig?: () => boolean;
}

/** レンダラーのレジストリ（将来の拡張時に使用） */
const DIAGRAM_RENDERERS: Record<string, DiagramRenderer> = {
  mermaid: MermaidRenderer,
  // plantuml: PlantUMLRenderer,  // Phase 2
  // d2: D2Renderer,              // Phase 2
};
```

#### 拡張時の実装方針

1. **Strategy パターン採用**: 各言語のレンダラーをStrategy として実装
2. **Registry パターン**: `DIAGRAM_RENDERERS`で動的に言語サポートを追加
3. **OCP準拠**: 新規言語追加時に既存コードの修正を最小化

> **実装タイミング**: 2つ目のダイアグラム言語サポート要求が発生した時点で実装を検討。
> YAGNI原則に基づき、現時点ではmermaid単独対応の設計で進める。

### SVGキャッシュ制限（[SF-002]）

メモリ使用量の問題が発生した場合の対応策。

#### 対応方針

1. **監視**: 実際のメモリ使用量を計測
2. **問題発生時の対策**:
   - LRUキャッシュの導入（最大エントリ数制限）
   - SVGサイズベースの制限（大きなダイアグラムは都度レンダリング）
   - WeakMapの活用（GC連動）

```tsx
// 将来の実装例（問題発生時）
const SVG_CACHE_CONFIG = {
  maxEntries: 50,
  maxSvgSizeBytes: 100 * 1024, // 100KB以上はキャッシュしない
};
```

---

## 実装チェックリスト

### Phase 1: 設定ファイル作成
- [ ] `src/config/mermaid-config.ts` を作成
- [ ] MERMAID_CONFIG定数を定義（securityLevel, startOnLoad, theme）
- [ ] 型定義（MermaidConfig）を追加
- [ ] securityLevel変更禁止のコメントを追加（[SEC-SF-003]）

### Phase 2: MermaidDiagramコンポーネント
- [ ] `src/components/worktree/MermaidDiagram.tsx` を作成
- [ ] mermaid-configからの設定読み込み
- [ ] mermaid.initialize()の実装
- [ ] securityLevel検証のフェイルセーフ機構を実装（[SEC-SF-003]）
- [ ] mermaid.render()によるSVG生成
- [ ] エラーハンドリング（SyntaxError, RenderError）
- [ ] ローディング状態の管理

### Phase 3: MermaidCodeBlockコンポーネント
- [ ] `src/components/worktree/MermaidCodeBlock.tsx` を作成
- [ ] 言語判定ロジック（className解析）
- [ ] MermaidDiagramのdynamic import
- [ ] 非mermaidコードブロックのパススルー

### Phase 4: MarkdownEditor統合
- [ ] `src/components/worktree/MarkdownEditor.tsx` の修正
- [ ] MermaidCodeBlockのimport追加
- [ ] ReactMarkdown components propへの追加

### Phase 5: テスト
- [ ] `tests/unit/components/MermaidDiagram.test.tsx` 作成
- [ ] `tests/unit/components/MermaidCodeBlock.test.tsx` 作成
- [ ] 既存MarkdownEditor.test.tsxへの回帰テスト追加
- [ ] XSS回帰テストケース追加（[SF3-003]対応）
- [ ] Issue #95 SVG XSS整合性テスト追加（[SEC-SF-004]対応）
- [ ] securityLevel検証テスト追加（[SEC-SF-003]対応）

### Phase 6: ドキュメント
- [ ] CLAUDE.mdの「最近の実装機能」セクション更新

---

## レビュー履歴

| 日付 | レビュー種別 | 結果 | 主要な指摘事項 |
|------|------------|------|---------------|
| 2026-01-30 | Stage 1: 通常レビュー（設計原則） | OK (must_fix: 0, should_fix: 3, nice_to_have: 3) | SF-001: mermaid設定の定数抽出、SF-002: SVGキャッシュのYAGNI適用、SF-003: 将来の拡張ポイント明確化 |
| 2026-01-31 | Stage 2: 整合性レビュー | OK (must_fix: 0, should_fix: 4, nice_to_have: 3) | SF2-001: MermaidCodeBlock型定義のReactMarkdown互換性、SF2-002: @moduleタグ追加、SF2-003: テスト環境ディレクティブ、SF2-004: ローディングUIスピナー |
| 2026-01-31 | Stage 3: 影響分析レビュー | OK (must_fix: 0, should_fix: 4, nice_to_have: 3) | SF3-001: 依存関係詳細の文書化、SF3-002: 初回レンダリング遅延の文書化、SF3-003: XSS回帰テスト追加、SF3-004: スタイリングアプローチ明確化 |
| 2026-01-31 | Stage 4: セキュリティレビュー | OK (must_fix: 0, should_fix: 4, nice_to_have: 3) | SEC-SF-001: dangerouslySetInnerHTML安全性根拠、SEC-SF-002: mermaidバージョン11.12.2、SEC-SF-003: securityLevel検証フェイルセーフ、SEC-SF-004: Issue #95 SVG XSS整合性 |

### Stage 1 レビュー詳細

#### 対応済み指摘事項

| ID | カテゴリ | 対応内容 |
|----|---------|---------|
| SF-001 | DRY | `src/config/mermaid-config.ts`を変更ファイル一覧に追加。5.1節に設定ファイルの詳細設計を追記 |
| SF-002 | YAGNI | 6.3節のSVGキャッシュ制限を初期実装スコープから除外。「将来の拡張ポイント」セクションに移動 |
| SF-003 | OCP | 「将来の拡張ポイント」セクションにDiagramRendererインターフェース設計を追加。Phase 2検討事項として明記 |

#### 検討の上スキップした指摘事項

| ID | カテゴリ | スキップ理由 |
|----|---------|-------------|
| NTH-001 | DIP | mermaidライブラリのモックはvitest.mockで対応可能。現時点では依存注入パターンは過剰設計 |
| NTH-002 | KISS | LoadErrorリトライ機能は省略し、メッセージ表示のみとする方針を7.1節に反映済み |
| NTH-003 | 型定義 | コンポーネント数が少ないため、コンポーネント内型定義で許容。複数コンポーネントで共有が必要になった時点で検討 |

### Stage 2 レビュー詳細

#### 整合性チェック結果

| チェック項目 | 結果 | 備考 |
|-------------|------|------|
| code_patterns | pass | コンポーネント構造、'use client'、named export、dynamic importパターンが既存と整合 |
| config_patterns | warning | @moduleタグ追加で対応済み |
| test_patterns | pass | ファイル命名、ディレクトリ構造が既存パターンと整合 |
| project_conventions | pass | CLAUDE.mdの規約と整合 |
| issue_requirements | pass | Issue #100の全要件をカバー |

#### 対応済み指摘事項

| ID | カテゴリ | 対応内容 |
|----|---------|---------|
| SF2-001 | code_patterns | MermaidCodeBlockPropsを拡張: `children?: React.ReactNode \| string \| string[]`, `node?: Element`, `inline?: boolean`を追加。ReactMarkdownのCodeComponent型との互換性を確保 |
| SF2-002 | config_patterns | mermaid-config.tsのJSDocに`@module config/mermaid-config`タグを追加。既存configファイルのスタイルと統一 |
| SF2-003 | test_patterns | テスト設計セクションに`@vitest-environment jsdom`ディレクティブの記載要件を追加 |
| SF2-004 | code_patterns | MermaidCodeBlockのloading UIにLoader2スピナーアイコン（lucide-react）を使用。既存のローディングUIパターンと統一 |

#### 検討の上スキップした指摘事項

| ID | カテゴリ | スキップ理由 |
|----|---------|-------------|
| NTH2-001 | code_patterns | エラーUIのAlertTriangleアイコン統一は将来の改善として検討。現状のTailwind CSSスタイルで機能要件は満たす |
| NTH2-002 | project_conventions | 現状の設計で問題なし（レビューコメント通り） |
| NTH2-003 | code_patterns | 現状の設計で問題なし（レビューコメント通り） |

### Stage 3 レビュー詳細

#### 影響分析チェック結果

| チェック項目 | 結果 | 備考 |
|-------------|------|------|
| affected_files | pass | 7ファイルを正しく特定。CSSはTailwind inlineで対応 |
| dependency_impact | warning | mermaid 66.2MB、20の直接依存。dynamic importで初期バンドルへの影響は緩和 |
| runtime_impact | pass | dynamic import、loading UI、debounceを適切に設計。初回100-300ms遅延は許容範囲 |
| test_coverage | warning | XSS回帰テストの追加を推奨 |
| ci_cd_impact | pass | npm ci時間+10-15秒、ワークフロー変更不要 |
| backward_compatibility | pass | 破壊的変更なし。mermaidコードブロックのみ新動作 |

#### 対応済み指摘事項

| ID | カテゴリ | 対応内容 |
|----|---------|---------|
| SF3-001 | dependency_impact | 10.2節に「mermaidパッケージの詳細情報」を追加。20の直接依存、66.2MB unpacked size、主要依存ライブラリ（d3, cytoscape, katex等）を文書化 |
| SF3-002 | runtime_impact | 6.3節に「初回レンダリングの遅延」を新規追加。遅延初期化の挙動（100-300ms）、対応策、パフォーマンス監視ポイントを記載 |
| SF3-003 | test_coverage | 8.4節に「XSS回帰テスト」を新規追加。mermaidコードブロック内の悪意あるコンテンツに対するテストケース4種を定義 |
| SF3-004 | affected_files | 4.2節にNoteを追加。スタイリングはTailwind CSSインラインクラスで実装し、globals.cssへの追加は不要であることを明記 |

#### 検討の上スキップした指摘事項

| ID | カテゴリ | スキップ理由 |
|----|---------|-------------|
| NTH3-001 | ci_cd_impact | CI/CDのnpm cacheは既存で対応済み。10-15秒の増加は許容範囲であり、追加のキャッシュ設定は不要 |
| NTH3-002 | backward_compatibility | 動作変更（コードブロックがダイアグラムとして描画）は機能追加として期待される動作。リリースノートへの記載は実装完了時に対応 |
| NTH3-003 | runtime_impact | メモリフットプリントの監視ガイダンスは、実際に問題が発生した場合にSF-002（SVGキャッシュ制限）と併せて対応 |

### Stage 4 レビュー詳細

#### OWASP Top 10 対応状況

| OWASP カテゴリ | 結果 | 備考 |
|--------------|------|------|
| A03:2021 Injection | warning | mermaid securityLevel='strict'でXSS防止。dangerouslySetInnerHTML使用の安全性根拠を設計書に追記 |
| A05:2021 Security Misconfiguration | pass | securityLevel='strict'、startOnLoad=false、設定の一元管理。フェイルセーフ追加で強化 |
| A06:2021 Vulnerable Components | pass | mermaid 11.12.2は既知の脆弱性なし。npm audit定期実行を推奨 |
| A08:2021 Integrity Failures | pass | dynamic importはNext.js標準機能。package-lock.jsonでハッシュ検証 |

#### 対応済み指摘事項

| ID | カテゴリ | 対応内容 |
|----|---------|---------|
| SEC-SF-001 | A03 Injection | 5.2節を拡張。mermaid securityLevel='strict'のXSS防止メカニズム（DOMPurify使用、scriptタグ除去、イベントハンドラ無効化）を詳細に文書化。dangerouslySetInnerHTML使用の例外理由を明記 |
| SEC-SF-002 | A06 Vulnerable Components | 10.1節のmermaidバージョンを^11.12.0から^11.12.2に更新。10.3節にDependabot/renovate推奨とnpm audit定期実行を追記 |
| SEC-SF-003 | A05 Security Misconfiguration | 5.1.1節を新規追加。securityLevel検証のフェイルセーフ機構を設計。実装チェックリストと8.5節のテスト要件に反映 |
| SEC-SF-004 | A03 Injection | 5.2.1節を新規追加。Issue #95 SVG XSS対策（validateSvgContent）との整合性確認を文書化。5項目すべてをmermaid securityLevel='strict'がカバーすることを確認 |

#### 検討の上スキップした指摘事項

| ID | カテゴリ | スキップ理由 |
|----|---------|-------------|
| SEC-NTH-001 | CSP Compatibility | mermaid securityLevel='strict'でインラインスクリプトは無効化済み。現状のCSP設定との互換性は問題なし。厳格なCSP導入時に再検討 |
| SEC-NTH-002 | Error Information Disclosure | mermaid構文エラーにはパスやバージョン情報は含まれない。ユーザーフレンドリーなエラー表示として現状の設計を維持 |
| SEC-NTH-003 | Supply Chain Security | Dependabot/renovate推奨を10.3節に追記済み。Snyk導入は運用コストを考慮し、将来検討事項とする |

---

*Created: 2026-01-30*
*Last Updated: 2026-01-31*
*Stage 1 Review Applied: 2026-01-30*
*Stage 2 Review Applied: 2026-01-31*
*Stage 3 Review Applied: 2026-01-31*
*Stage 4 Review Applied: 2026-01-31*
