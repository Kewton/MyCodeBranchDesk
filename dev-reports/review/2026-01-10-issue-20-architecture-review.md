# アーキテクチャレビュー: Issue #20 スマホ利用時決定キーで改行

## レビュー概要

| 項目 | 内容 |
|------|------|
| **レビュー対象** | Issue #20 設計方針書 |
| **レビュー日** | 2026-01-10 |
| **レビュアー** | Claude (Architecture Review) |
| **設計書パス** | `dev-reports/design/issue-20-mobile-enter-key-design-policy.md` |

---

## 1. 設計原則の遵守確認

### SOLID原則チェック

| 原則 | 評価 | コメント |
|------|------|---------|
| **S**ingle Responsibility | :white_check_mark: | `handleKeyDown`は入力処理に専念。デバイス判定は`useIsMobile`に委譲 |
| **O**pen/Closed | :white_check_mark: | 将来の拡張（設定オプション、仮想KB検出）に開いている |
| **L**iskov Substitution | N/A | 継承を使用していない |
| **I**nterface Segregation | :white_check_mark: | `useIsMobile`は必要最小限のインターフェース |
| **D**ependency Inversion | :white_check_mark: | デバイス判定ロジックがフックに抽象化されている |

### その他の原則

| 原則 | 評価 | コメント |
|------|------|---------|
| **KISS** | :white_check_mark: 優秀 | 条件分岐1つ追加のみ。過度な抽象化を回避 |
| **YAGNI** | :white_check_mark: 優秀 | 設定オプションを将来対応とし、現時点では未実装 |
| **DRY** | :white_check_mark: | 既存の`useIsMobile`フックを再利用 |

---

## 2. アーキテクチャ評価

### 2.1 構造的品質

| 評価項目 | スコア(1-5) | コメント |
|---------|------------|----------|
| **モジュール性** | 5 | デバイス判定が独立したフック、変更が局所化 |
| **結合度** | 5 (低結合) | `MessageInput`と`useIsMobile`の疎結合を維持 |
| **凝集度** | 5 (高凝集) | `handleKeyDown`内でキー入力処理が完結 |
| **拡張性** | 4 | 設定・仮想KB検出への拡張パスが明確。ただし実装は未着手 |
| **保守性** | 5 | 変更箇所が明確、既存コードへの影響が最小限 |

**総合スコア: 4.8/5**

### 2.2 変更影響範囲分析

```
変更ファイル:
├── src/components/worktree/MessageInput.tsx  ← 約10行の変更
│   └── handleKeyDown 関数のみ修正
└── tests/  ← テスト追加

影響なし:
├── src/hooks/useIsMobile.ts       (既存のまま利用)
├── src/hooks/useVirtualKeyboard.ts (変更なし)
├── API層                          (変更なし)
├── データベース層                  (変更なし)
└── 他のコンポーネント              (変更なし)
```

**評価**: 変更範囲が極めて限定的で、リグレッションリスクが低い

### 2.3 パフォーマンス観点

| 項目 | 評価 | コメント |
|------|------|---------|
| レスポンスタイム | 影響なし | 条件分岐1つ追加（ナノ秒レベル） |
| メモリ使用量 | 影響なし | 新規state/変数なし |
| バンドルサイズ | 影響なし | 新規依存なし |
| レンダリング | 影響なし | リレンダリング条件変更なし |

---

## 3. セキュリティレビュー

### OWASP Top 10 チェック

本機能はUI入力動作の変更のみであり、セキュリティ上のリスクはありません。

| チェック項目 | 評価 | コメント |
|-------------|------|---------|
| インジェクション | N/A | 入力内容は既存の送信処理で処理される |
| 認証の破綻 | N/A | 認証に影響なし |
| 機微データの露出 | N/A | 機微データを扱わない |
| XSS | N/A | DOM操作なし |
| アクセス制御 | N/A | アクセス制御に影響なし |

**セキュリティ評価**: リスクなし

---

## 4. 既存システムとの整合性

### 4.1 統合ポイント

| 統合項目 | 整合性 | コメント |
|---------|--------|---------|
| API互換性 | :white_check_mark: | API変更なし |
| データモデル | :white_check_mark: | データモデル変更なし |
| 既存フック活用 | :white_check_mark: | `useIsMobile`を再利用 |
| IME対応 | :white_check_mark: | 既存ロジックを維持 |
| スラッシュコマンド | :white_check_mark: | 既存動作に影響なし |

### 4.2 技術スタックの適合性

| 項目 | 評価 | コメント |
|------|------|---------|
| React/Next.js パターン | :white_check_mark: | Reactイベントハンドリングの標準パターン |
| TypeScript | :white_check_mark: | 型安全性維持 |
| テストフレームワーク | :white_check_mark: | Vitest/Playwrightで対応可能 |

---

## 5. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| **技術的** | IME対応ロジック破損 | 高 | 低 | 高 |
| **技術的** | テストカバレッジ不足 | 中 | 中 | 高 |
| **UX** | 既存ユーザーの混乱 | 低 | 低 | 低 |
| **運用** | デバイス判定の境界ケース | 低 | 中 | 中 |

### 5.1 リスク詳細分析

#### リスク1: IME対応ロジック破損（技術的・高影響）

**現状分析**:
設計書では既存のIME対応ロジックを維持する方針が明確に示されている。

```typescript
// 既存のIME対応チェック（維持）
if (keyCode === 229) return;
if (justFinishedComposingRef.current && e.key === 'Enter') return;
if (!isComposing) { /* 送信処理 */ }
```

**対策**:
- 既存のIMEテストを拡充（モバイル環境を含む）
- 手動テスト項目にIME入力を必須化

#### リスク2: デバイス判定の境界ケース（運用・中影響）

**懸念点**:
- iPad（768px～1024px）での動作
- タブレット+物理キーボード装着時

**対策**:
- 設計書で「将来対応」として明記済み
- visualViewport APIとの統合を次フェーズで検討

---

## 6. 改善提案

### 6.1 必須改善項目（Must Fix）

なし - 設計は適切

### 6.2 推奨改善項目（Should Fix）

#### 推奨1: テストケースの具体化

**現状**: 設計書にテストコード例が記載されているが、IMEテストが不足

**提案**: 以下のテストケースを追加

```typescript
describe('IME compatibility on mobile', () => {
  it('should not submit during IME composition on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true);
    render(<MessageInput {...defaultProps} />);

    const textarea = screen.getByRole('textbox');
    // Simulate IME composition
    fireEvent.compositionStart(textarea);
    await userEvent.keyboard('{Enter}');

    expect(mockOnMessageSent).not.toHaveBeenCalled();
  });
});
```

#### 推奨2: アクセシビリティ属性の追加

**現状**: 送信ボタンに明示的なaria-labelがない

**提案**:
```tsx
<button
  type="submit"
  aria-label="Send message"
  // ...
>
```

### 6.3 検討事項（Consider）

#### 検討1: ユーザー設定オプション（将来対応）

設計書で将来対応として記載済み。優先度は低いが、ユーザーフィードバック次第で検討。

#### 検討2: タブレット判定の改善

768px～1024pxの範囲（タブレット領域）での動作を明確化することを検討。

```typescript
// 将来の拡張案
const isTablet = useIsTablet(); // 768-1024px
const shouldUseMobileBehavior = isMobile && !hasPhysicalKeyboard;
```

---

## 7. ベストプラクティスとの比較

### 7.1 業界標準との比較

| アプリ | モバイルでのEnter動作 | 送信方法 |
|--------|---------------------|---------|
| LINE | 改行 | 送信ボタン |
| Slack | 改行 | 送信ボタン |
| WhatsApp | 改行 | 送信ボタン |
| Discord | 送信（設定可能） | Enter/ボタン |
| **本設計** | 改行 | 送信ボタン |

**評価**: 主要チャットアプリの標準に準拠。適切な設計判断。

### 7.2 代替アーキテクチャ分析

#### 代替案A: Context/Providerパターン

```typescript
// InputBehaviorContext で動作設定を管理
const InputBehaviorProvider = ({ children }) => {
  const [config, setConfig] = useState({ mobileEnterBehavior: 'newline' });
  return <Context.Provider value={config}>{children}</Context.Provider>;
};
```

**評価**: 現時点では過剰設計。将来の設定オプション実装時に検討。

#### 代替案B: カスタムフック抽出

```typescript
// useInputBehavior フックに動作ロジックを抽出
function useInputBehavior() {
  const isMobile = useIsMobile();
  return {
    shouldSendOnEnter: !isMobile,
    shouldNewlineOnEnter: isMobile,
  };
}
```

**評価**: 動作ロジックが複雑化した場合に有効。現時点では不要。

---

## 8. コード品質チェック

### 8.1 既存コードの品質

`MessageInput.tsx`の現在の実装を確認した結果：

| チェック項目 | 評価 | コメント |
|-------------|------|---------|
| TypeScript型定義 | :white_check_mark: | 適切な型定義 |
| コメント | :white_check_mark: | 重要なロジックにコメントあり |
| エラーハンドリング | :white_check_mark: | try-catchで適切に処理 |
| コンポーネント設計 | :white_check_mark: | 単一責任を維持 |
| フック活用 | :white_check_mark: | カスタムフックで関心分離 |

### 8.2 提案コードの品質

設計書記載の変更後コードを分析：

```typescript
// Enter key handling with device-specific behavior
if (e.key === 'Enter' && !isComposing && !showCommandSelector) {
  if (isMobile) {
    // Mobile: Enter inserts newline (default behavior)
    // Submit only via send button
    return;
  }

  // Desktop: Enter submits, Shift+Enter inserts newline
  if (!e.shiftKey) {
    e.preventDefault();
    void submitMessage();
  }
}
```

**評価**:
- :white_check_mark: 可読性が高い
- :white_check_mark: コメントで意図を明確化
- :white_check_mark: 早期returnパターンで分岐を簡潔化
- :white_check_mark: 既存のIMEチェックを先行させている

---

## 9. テスト戦略評価

### 9.1 既存テストカバレッジ

| テスト対象 | カバレッジ | コメント |
|-----------|-----------|---------|
| `useIsMobile` | :white_check_mark: 完備 | 178行の包括的テスト |
| `useVirtualKeyboard` | :white_check_mark: 完備 | テストファイル存在 |
| `MessageInput` | :warning: 不足 | 専用テストファイルなし |

### 9.2 テスト戦略の妥当性

設計書のテスト戦略を評価：

| テスト種別 | 評価 | コメント |
|-----------|------|---------|
| ユニットテスト | :white_check_mark: | 適切なケース定義 |
| E2Eテスト | :white_check_mark: | モバイルエミュレーションを使用 |
| 手動テスト | :white_check_mark: | 実機テストを計画 |

**推奨追加テストケース**:

1. IME + モバイル環境での動作
2. コマンドセレクター表示中のEnterキー
3. 送信中（`sending=true`）のEnterキー
4. 空メッセージでのEnterキー

---

## 10. 総合評価

### 10.1 レビューサマリ

| 評価項目 | スコア |
|---------|--------|
| 設計原則遵守 | 5/5 |
| 構造的品質 | 4.8/5 |
| セキュリティ | 5/5 (リスクなし) |
| 既存システム整合性 | 5/5 |
| テスト戦略 | 4/5 |
| リスク管理 | 4.5/5 |

**全体評価**: **4.7/5** :star::star::star::star::star:

### 10.2 強み

1. **最小限の変更原則** - 既存コードへの影響を最小化
2. **既存インフラ再利用** - `useIsMobile`フックの活用
3. **業界標準準拠** - 主要チャットアプリのUXパターンに従う
4. **拡張性の確保** - 将来の設定オプション・仮想KB検出への道筋
5. **IME対応維持** - 日本語入力での誤送信防止を維持

### 10.3 弱み

1. **MessageInputの専用テストがない** - 新規テストファイル作成が必要
2. **タブレット境界ケースが未定義** - 768-1024pxの動作が曖昧
3. **アクセシビリティ改善の余地** - aria-label追加を推奨

### 10.4 総評

この設計は、シンプルさと拡張性のバランスが優れています。

**特に評価できる点**:
- KISS/YAGNI原則に忠実で、必要最小限の変更に留めている
- 既存のフックを再利用し、新規の複雑性を導入していない
- 将来の拡張パス（設定オプション、仮想KB検出）を明確に示している
- 業界標準のUXパターンに準拠している

**懸念点**:
- MessageInputのテストカバレッジが既存で不足しており、この機会に改善が必要

---

## 11. 承認判定

### :white_check_mark: 条件付き承認（Conditionally Approved）

以下の条件を満たした上で、実装を進めてよい：

#### 必須条件

1. **MessageInput用のユニットテストファイルを作成**
   - デスクトップでのEnter送信テスト
   - モバイルでのEnter改行テスト
   - IME入力中のEnterキー無視テスト

2. **送信ボタンにaria-label追加**（アクセシビリティ改善）
   ```tsx
   <button type="submit" aria-label="Send message">
   ```

#### 推奨条件

1. E2Eテストの追加（モバイルエミュレーション）
2. 実機（iOS/Android）での手動テスト実施

---

## 12. 次のステップ

1. :white_check_mark: 設計方針書の承認
2. :arrow_right: **MessageInputのテストファイル作成**（必須）
3. :arrow_right: **aria-label追加**（必須）
4. :arrow_right: handleKeyDown関数の修正
5. :arrow_right: E2Eテスト追加（推奨）
6. :arrow_right: 手動テスト・レビュー
7. :arrow_right: PRマージ

---

## 付録: チェックリスト

### 実装前チェック

- [x] 設計原則（SOLID, KISS, YAGNI, DRY）準拠
- [x] 既存コードとの整合性確認
- [x] セキュリティリスク評価
- [x] パフォーマンス影響評価
- [x] テスト戦略策定

### 実装時チェック

- [ ] MessageInput.tsxのhandleKeyDown修正
- [ ] aria-label追加
- [ ] ユニットテスト作成・実行
- [ ] E2Eテスト作成・実行
- [ ] 手動テスト（モバイル実機）

### 実装後チェック

- [ ] CIパス確認
- [ ] コードレビュー
- [ ] ドキュメント更新（必要に応じて）
