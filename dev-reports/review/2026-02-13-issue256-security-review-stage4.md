# Issue #256 Security Architecture Review (Stage 4)

## Executive Summary

| Item | Value |
|------|-------|
| **Issue** | #256 - 選択メッセージ検出改善 |
| **Review Type** | セキュリティレビュー (OWASP Top 10 + Auto-Yes Safety) |
| **Stage** | 4 / 4 |
| **Status** | conditionally_approved |
| **Score** | 4 / 5 |
| **Date** | 2026-02-13 |

### Verdict

設計方針書のセキュリティ設計は全体として良好であり、既存の多層防御構造（Layer 1-5）を維持しながら検出精度を向上させる方針は妥当である。ReDoSリスクはなく、入力検証も適切に設計されている。条件付き承認とする理由は、Pattern 2（行内`?`チェック）に特化したFalse Positiveテストケースの追加が必要なためである。

---

## 1. Auto-Yes機能への影響分析 (重点レビュー項目1)

### 1.1 Auto-Yesフロー概要

Auto-Yes機能は以下のフローで動作する。

```
pollAutoYes() [auto-yes-manager.ts L274]
  -> captureSessionOutput()
  -> stripAnsi()
  -> detectThinking() [Layer 1]
  -> detectPrompt() [Layer 2-5]
     -> detectMultipleChoicePrompt()
        -> Pass 1: cursor existence check [Layer 2]
        -> Pass 2: option collection + questionEndIndex
        -> Layer 3: isConsecutiveFromOne()
        -> Layer 4: hasDefaultIndicator / options >= 2
        -> Layer 5: SEC-001a/SEC-001b [修正対象]
  -> resolveAutoAnswer()
  -> sendKeys() / sendSpecialKeys()
```

### 1.2 False Positive時のリスク評価

False Positive（非プロンプト出力をプロンプトとして誤検出）が発生した場合の影響は以下の通り。

| 影響 | 詳細 | 深刻度 |
|------|------|--------|
| tmuxセッションへの誤キー送信 | `sendSpecialKeys()`でArrow+Enterが送信される | High |
| Claude CLIの動作中断 | thinking中に意図しない入力が入り、セッション状態が破壊される可能性 | High |
| データ損失リスク | Auto-Yesが有効な状態で破壊的操作を自動承認する可能性 | High |

### 1.3 本修正による影響パスの分析

**Pattern 2（行内`?`チェック）の影響パス:**

1. `isQuestionLikeLine()`にPattern 2が追加される
2. SEC-001bガード内で`questionEndIndex`行が`isQuestionLikeLine()`に渡される
3. Pattern 2により行内に`?`を含む行がtrue判定される
4. プロンプトとして検出される -> Auto-Yesが応答を送信する

**防御層の有効性確認:**

| 防御層 | 本修正での有効性 | 根拠 |
|--------|-----------------|------|
| Layer 1: detectThinking() | 有効 | thinking中はprompt検出をスキップ（変更なし） |
| Layer 2: 2-pass cursor detection | 有効（requireDefault=true時） | cursor indicator存在チェック（変更なし） |
| Layer 3: isConsecutiveFromOne() | 有効 | 連番検証は変更なし |
| Layer 4: options >= 2 + hasDefault | 有効 | 最小オプション数チェック（変更なし） |
| Layer 5 SEC-001a: questionEndIndex existence | 有効 | questionEndIndex=-1拒否（変更なし） |
| Layer 5 SEC-001b: isQuestionLikeLine() | **拡張** | Pattern 2追加 + findQuestionLineInRange()上方走査 |

**結論:** Layer 1-4の防御層は変更されておらず、Layer 5のみが拡張される。Claude CLIで`requireDefaultIndicator=false`が使用される場合（`buildDetectPromptOptions('claude')`の返値）にのみSEC-001bが評価されるため、影響範囲は限定的である。ただし、Pattern 2に特化したFalse Positiveテストが設計方針書に不足している（MF-S4-001）。

### 1.4 resolveAutoAnswer()の安全弁

`requireDefaultIndicator=false`の場合、収集されたオプションのisDefaultは全てfalseとなる。`resolveAutoAnswer()`は`defaultOption`が存在しない場合に`promptData.options[0]`を選択する（auto-yes-resolver.ts L25）。これは安全な挙動ではあるが、False Positiveのプロンプトデータに対しても最初のオプション番号が送信されることを意味する。

---

## 2. ReDoS攻撃リスク分析 (重点レビュー項目2)

### 2.1 既存パターンのReDoS安全性

| パターン | 安全性 | 根拠 |
|---------|--------|------|
| `DEFAULT_OPTION_PATTERN` | ReDoS safe | 両端アンカー、`[0-9;]*`は線形時間 |
| `NORMAL_OPTION_PATTERN` | ReDoS safe | 両端アンカー、`[0-9;]*`は線形時間 |
| `SEPARATOR_LINE_PATTERN` | ReDoS safe | 両端アンカー、`[-─]+`は文字クラス繰返しのみ |
| `QUESTION_KEYWORD_PATTERN` | ReDoS safe | alternation-onlyパターン、ネスト量指定子なし |
| `YES_NO_PATTERNS` (4 patterns) | ReDoS safe | 各パターンは`^(.+)\s+...$m`形式で線形時間 |

### 2.2 本修正で追加/変更されるパターンのReDoS安全性

| コード | 手法 | ReDoSリスク |
|--------|------|-------------|
| `line.includes('?')` | リテラル文字列検索（String.includes） | **なし** - 正規表現不使用 |
| `line.includes('\uff1f')` | リテラル文字列検索（String.includes） | **なし** - 正規表現不使用 |
| `line.endsWith('?')` | リテラル文字列比較（String.endsWith） | **なし** - 正規表現不使用 |
| `SEPARATOR_LINE_PATTERN.test(candidateLine)` | 既存パターン再利用 | **なし** - ReDoS safe認定済み |
| `QUESTION_KEYWORD_PATTERN.test(line)` | 既存パターン再利用 | **なし** - alternation-onlyで線形時間 |

### 2.3 findQuestionLineInRange()のループ計算量

```typescript
const scanLimit = Math.max(lowerBound, startIndex - scanRange);
for (let i = startIndex - 1; i >= scanLimit; i--) { ... }
```

ループ回数は最大`scanRange`（= QUESTION_SCAN_RANGE = 3）回に制限されている。各イテレーションでは`String.trim()`、リテラル文字列チェック、正規表現テスト（線形時間パターン）のみが実行される。計算量は`O(scanRange * L)`（Lは行の平均長）であり、ReDoSリスクおよびDoSリスクはない。

**結論:** 本修正で追加される全てのパターンおよびロジックにReDoSリスクは存在しない。

---

## 3. 入力検証の妥当性 (重点レビュー項目3)

### 3.1 findQuestionLineInRange()の引数検証

```typescript
function findQuestionLineInRange(
  lines: string[],        // 外部入力（tmux capture-pane出力をsplitしたもの）
  startIndex: number,     // detectMultipleChoicePrompt()が計算した値
  scanRange: number,      // QUESTION_SCAN_RANGE定数（=3）
  lowerBound: number      // scanStart値（Math.max(0, effectiveEnd - 50)で計算）
): boolean
```

| 引数 | 現在の入力源 | 入力バリデーション | 評価 |
|------|-------------|-------------------|------|
| `lines` | `output.split('\n')` | なし（tmux出力が直接渡される） | **許容** - stripAnsi()適用済み |
| `startIndex` | `questionEndIndex`（Pass 2で計算） | `Math.max(lowerBound, startIndex - scanRange)`で境界保護 | **適切** |
| `scanRange` | `QUESTION_SCAN_RANGE`定数 | なし（module-private定数のみ使用） | **許容** - ただしSF-S4-001参照 |
| `lowerBound` | `scanStart`（`Math.max(0, effectiveEnd - 50)`） | Math.maxによる非負保証 | **適切** |

### 3.2 境界条件の安全性

```typescript
const scanLimit = Math.max(lowerBound, startIndex - scanRange);
```

- `startIndex - scanRange`が負になる場合: `lowerBound`（>= 0）が使用される -> 安全
- `startIndex`が0の場合: `scanLimit = Math.max(0, -3) = 0`、ループ`i = -1; i >= 0`で即終了 -> 安全
- `lines[i]`が存在しない場合: `?.trim() ?? ''`でnullish処理 -> 安全

### 3.3 getAnswerInput()のSEC-003維持

設計方針書はgetAnswerInput()に変更を加えないことを明示している。現在の実装はSEC-003（ユーザー入力をエラーメッセージに含めない）を維持しており、ログインジェクション防止が継続される。

**結論:** 入力検証は概ね適切。findQuestionLineInRange()のscanRange引数に対する防御的バリデーション追加を推奨する（SF-S4-001）。

---

## 4. セキュリティ防御層の維持 (重点レビュー項目4)

### 4.1 5層防御構造の維持状況

```
Layer 1: detectThinking() ---- [変更なし] thinking中はスキップ
Layer 2: 2-pass detection ---- [変更なし] cursor indicator存在チェック
Layer 3: isConsecutiveFromOne() [変更なし] 連番検証
Layer 4: hasDefaultIndicator --- [変更なし] 最小オプション数+indicator
Layer 5: SEC-001a/SEC-001b ---- [拡張] 上方走査追加
  |
  +-- SEC-001a: questionEndIndex existence [変更なし]
  +-- SEC-001b: isQuestionLikeLine() ---- [Pattern 2追加]
  +-- NEW: findQuestionLineInRange() ---- [上方走査追加]
```

### 4.2 SEC-001bの拡張による防御力の変化

**変更前:**
- `questionEndIndex`行のみをisQuestionLikeLine()で判定
- Pattern 1（末尾`?`/`?`）またはPattern 2（旧番号、末尾`:`+キーワード）でマッチ

**変更後:**
- `questionEndIndex`行をisQuestionLikeLine()で判定（Pattern 1 + Pattern 2（行内`?`）+ Pattern 3（末尾`:`+キーワード））
- 失敗した場合、上方3行をfindQuestionLineInRange()で走査

**防御力への影響:**

| 防御面 | 変更前 | 変更後 | 評価 |
|--------|--------|--------|------|
| True Positive率 | 末尾`?`/`:+keyword`のみ検出 | 行内`?` + 上方走査で検出率向上 | 改善 |
| False Positive率 | SEC-001bで厳密に制限 | Pattern 2追加で僅かに増加する可能性 | 微増（許容範囲） |
| 検出範囲 | questionEndIndex行のみ | questionEndIndex行 + 上方3行 | 拡大（制御済み） |

### 4.3 T11h-T11m False Positive防止テストへの影響分析

設計方針書セクション6.1の分析を検証する。

| テストID | パターン | questionEndIndex行 | isQuestionLikeLine結果 | 上方走査の影響 |
|---------|---------|-------------------|----------------------|--------------|
| T11h | `Recommendations:\n1. A\n2. B` | `Recommendations:` | Pattern 3（`:+keyword`）: `Recommendations`はQUESTION_KEYWORD_PATTERNにマッチしない -> false | 上方走査: 走査対象なし -> false | **安全** |
| T11i | `Steps:\n1. A\n2. B` | `Steps:` | `Steps`はキーワードにマッチしない -> false | 上方走査: 走査対象なし -> false | **安全** |
| T11j | `Changes Made:\n1. A\n2. B` | `Changes Made:` | キーワードにマッチしない -> false | 上方走査: 走査対象なし -> false | **安全** |
| T11k | `## Summary\n1. A\n2. B` | `## Summary` | `:` / `?`なし -> false | 上方走査: 走査対象なし -> false | **安全** |
| T11l | `Completed tasks:\n1. A\n2. B` | `Completed tasks:` | キーワードにマッチしない -> false | 上方走査: 走査対象なし -> false | **安全** |
| T11m | `I did the following:\n1. A\n2. B` | `I did the following:` | キーワードにマッチしない -> false | 上方走査: 走査対象なし -> false | **安全** |

**注記:** 上記テストケースは全て1行のヘッダ + 番号リストの構造であり、上方走査の対象行が存在しない（questionEndIndexが最初の非オプション行であり、その上方にはscanStart境界以前の行しかない）。したがって、上方走査がFalse Positiveを引き起こすリスクはない。

### 4.4 MF-001対応（Pass 2先行チェック）のセキュリティ影響

Pass 2逆スキャンループ内でisQuestionLikeLine()をisContinuationLine()の手前に配置する変更は、以下のセキュリティ上の影響がある。

**安全な影響:**
- isQuestionLikeLine()がtrueの行は即座にquestionEndIndexに設定されてbreakする
- この行は後続のSEC-001bチェックで再度isQuestionLikeLine()による検証を受ける（ただし同じ関数なのでパスする）
- isContinuationLine()のロジックは一切変更されない

**注意すべき点:**
- Pattern 2（行内`?`チェック）がPass 2先行チェックで適用される場合、インデント付きの行（例: `  See options below? Please choose.`）がquestionEndIndexに設定される可能性がある
- この行はSEC-001bでもisQuestionLikeLine()=trueとなるため、そのままプロンプトとして検出される
- 防御は**Layer 3**（連番検証）と**Layer 4**（最小オプション数）に依存する

---

## 5. OWASP Top 10 チェックリスト

| # | OWASP Category | Status | Notes |
|---|---------------|--------|-------|
| A01 | Broken Access Control | N/A | 認証・認可メカニズムへの変更なし |
| A02 | Cryptographic Failures | N/A | 暗号処理への変更なし |
| A03 | Injection | Pass | 正規表現パターンに外部入力不使用。SEC-003維持 |
| A04 | Insecure Design | Conditional Pass | 多層防御構造維持。Pattern 2のFalse Positiveテスト追加条件（MF-S4-001） |
| A05 | Security Misconfiguration | Pass | QUESTION_SCAN_RANGE=3は適切。変更ガイドライン明記済み |
| A06 | Vulnerable and Outdated Components | N/A | 新規依存パッケージの追加なし |
| A07 | Identification and Authentication Failures | N/A | 認証メカニズムへの変更なし |
| A08 | Software and Data Integrity Failures | Pass | データベーススキーマ変更なし。公開インターフェース不変 |
| A09 | Security Logging and Monitoring Failures | Pass | logger.debug/infoによるログ出力維持。SEC-003によるログインジェクション防止 |
| A10 | Server-Side Request Forgery | N/A | 外部リクエスト発行なし |

---

## 6. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| セキュリティ | Pattern 2のFalse Positive -> Auto-Yes誤応答 | High | Low | P2 |
| セキュリティ | findQuestionLineInRange()のscanRange境界不正 | Low | Very Low | P3 |
| 技術的 | Pass 2先行チェック + SEC-001b上方走査の暗黙的依存 | Medium | Low | P3 |
| 運用 | QUESTION_SCAN_RANGE値の将来的な増加によるFP増加 | Medium | Low | P3 |

---

## 7. 改善勧告

### 7.1 必須改善項目 (Must Fix)

#### MF-S4-001: Pattern 2に特化したFalse Positiveテストケースの追加

**問題:** Pattern 2（行内`?`チェック）が直接関与するFalse Positiveシナリオのテストケースが設計方針書に不足している。T-256-FP1/FP2は上方走査範囲外や非キーワードヘッダのテストであり、Pattern 2のincludes('?')が誤マッチするケースを直接検証していない。

**推奨対応:** T-256-FP3として以下のテストケースを追加する。

```typescript
// T-256-FP3: Pattern 2がquestionEndIndex行のURLパラメータで誤検出しないことを確認
it('should NOT detect prompt when questionEndIndex line contains URL with ?', () => {
  const output = [
    'See https://example.com/help?topic=models for details.',
    '1. Option A',
    '2. Option B',
  ].join('\n');
  const options: DetectPromptOptions = { requireDefaultIndicator: false };
  const result = detectPrompt(output, options);
  // Note: This test verifies the current behavior. If isQuestionLikeLine()
  // returns true for URL lines (due to Pattern 2), this test documents
  // the False Positive and its scope (SEC-001b guard limits impact).
  // The expected behavior depends on implementation choice.
});
```

**注記:** このテストの期待結果（`isPrompt`の値）は、URLパラメータ行がquestionEndIndexに設定された場合にPattern 2がtrueを返すことを考慮して決定する必要がある。設計方針書セクション5.2のFalse Positive分析では「極低リスク」と評価されているが、テストで実際の挙動を確認し文書化することが重要である。

### 7.2 推奨改善項目 (Should Fix)

#### SF-S4-001: findQuestionLineInRange()のscanRange防御的バリデーション

**推奨:** scanRange引数に対する上限チェックをJSDocまたはランタイムで追加する。

```typescript
// Option A: JSDocに有効範囲を明記
/** @param scanRange - Maximum number of lines to scan upward (recommended: 1-10) */

// Option B: ランタイムチェック
const effectiveScanRange = Math.min(Math.max(0, scanRange), 10);
```

#### SF-S4-002: Pattern 2とQUESTION_KEYWORD_PATTERNの相互作用の文書化

**推奨:** セクション6.1に以下の分析行を追加する。

| パターン組合せ | 影響 | リスク |
|--------------|------|--------|
| Pattern 2（行内?） + 上方走査でキーワード行発見 | 上方走査はisQuestionLikeLine()を使用するため、Pattern 2もPattern 3も適用される | 低（走査範囲=3行に制限） |

#### SF-S4-003: Pass 2先行チェックとSEC-001b上方走査の設計意図の明文化

**推奨:** セクション6.3に、両パスが同一のisQuestionLikeLine()を共有する設計意図と、Pattern 2が両パスで適用される点を追記する。

### 7.3 検討事項 (Consider)

#### C-S4-001: ReDoS安全性アノテーションの継続

新規関数findQuestionLineInRange()のJSDocに「ReDoS safe: uses only SEPARATOR_LINE_PATTERN (anchored) and isQuestionLikeLine (literal string checks + alternation-only regex)」のアノテーションを追加することを推奨する。

#### C-S4-002: SEC-S4-004制御文字耐性のPattern 2への影響

Pattern 2のincludes('?')は行内の任意位置を検索するため、tmux capture-pane残存制御文字による誤マッチの理論的可能性がある。実用上のリスクは極めて低いが、isQuestionLikeLine()のJSDocにPattern 2のSEC-S4-004影響メモを追記することを検討する。

#### C-S4-003: Auto-YesポーラーのFalse Positive時の挙動認識

requireDefaultIndicator=false時にFalse Positiveが発生した場合、resolveAutoAnswer()は最初のオプション番号を返す。この挙動は既存設計の範囲内であるが、Pattern 2追加によるFalse Positive増加の可能性をチーム内で認識しておくことを推奨する。

---

## 8. 総合評価

### 良好な点

1. **多層防御構造の維持**: Layer 1-5の構造が保持されており、単一レイヤーの変更が全体の安全性を損なわない設計になっている。
2. **ReDoSリスクの排除**: 新規コードは全てリテラル文字列チェックまたは既存のReDoS safe認定パターンの再利用であり、新たなReDoSリスクを導入していない。
3. **スコープ制約の明文化**: SF-001対応でPattern 2のスコープ制約（module-private、SEC-001bガード内）が詳細に文書化されている。
4. **isContinuationLine()のSRP維持**: MF-001対応により、isContinuationLine()への質問キーワード判定の混入を回避し、SRP/OCP準拠を維持している。
5. **QUESTION_SCAN_RANGE変更ガイドライン**: SF-002対応で、将来の値変更時の注意事項が明確に文書化されている。
6. **公開インターフェース不変宣言**: C-S3-003対応で、detectPrompt()、DetectPromptOptions、PromptDetectionResultの不変性が明示されている。

### 改善が必要な点

1. **Pattern 2のFalse Positiveテストカバレッジ**: 行内`?`チェックが直接関与するFalse Positiveシナリオの明示的テストが不足している（MF-S4-001）。
2. **防御パス間の暗黙的依存**: Pass 2先行チェックとSEC-001b上方走査が同一のisQuestionLikeLine()を共有していることの設計意図が明文化されていない（SF-S4-003）。

### 承認条件

本レビューは**条件付き承認**とする。以下の条件を実装フェーズで満たすこと。

1. **MF-S4-001**: Pattern 2（行内`?`チェック）に特化したFalse Positiveテストケースを最低1件追加し、Auto-Yes経路でのFalse Positive時の挙動を文書化する。

---

*Generated by architecture-review-agent for Issue #256 Stage 4*
*Review focus: セキュリティ (OWASP Top 10 + Auto-Yes Safety + ReDoS + Input Validation + Defense Layers)*
*Date: 2026-02-13*
