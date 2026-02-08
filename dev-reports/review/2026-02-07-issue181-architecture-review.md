# Architecture Review Report: Issue #181

## Executive Summary

| 項目 | 値 |
|------|-----|
| Issue番号 | #181 |
| レビューフォーカス | 設計原則 (SOLID/KISS/YAGNI/DRY) |
| ステータス | **Conditionally Approved** |
| スコア | **4/5** |
| Must Fix | 0件 |
| Should Fix | 3件 |
| Consider | 4件 |

Issue #181の設計方針書は、複数行にまたがるmultiple choiceオプションの検出失敗を修正するバグフィックスである。変更スコープが `src/lib/prompt-detector.ts` の `detectMultipleChoicePrompt()` 関数内部の継続行判定条件に限定されており、型変更なし、インターフェース変更なし、外部依存追加なしの最小限の修正として設計されている。設計原則への準拠は全体として良好だが、いくつかの改善推奨事項がある。

---

## 1. レビュー対象

### 設計方針書

- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/dev-reports/design/issue-181-multiline-option-continuation-design-policy.md`

### 照合した実装ファイル

| ファイル | 目的 |
|---------|------|
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/prompt-detector.ts` | 修正対象（line 292-295の継続行判定） |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/auto-yes-resolver.ts` | `option.number` 使用の確認 |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/auto-yes-manager.ts` | 呼び出し元のコンテキスト確認 |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/types/models.ts` | 型定義の整合性確認 |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/tests/unit/prompt-detector.test.ts` | 既存テストの確認 |

---

## 2. 設計原則評価

### 2-1. SOLID原則

#### SRP (Single Responsibility Principle) - 4/5

**評価: 良好**

設計方針書は変更対象を `detectMultipleChoicePrompt()` 内部の継続行判定ロジック（line 292-295）に限定しており、SRPの観点から適切なスコーピングがなされている。

実装コード（`/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/prompt-detector.ts`）を確認すると、`detectMultipleChoicePrompt` 関数自体が以下の複数の責務を持つ：

1. Pass 1: indicator検出（line 243-257）
2. Pass 2: オプション収集（line 266-306）
3. 継続行判定（line 288-300）
4. 連番検証（line 308-315）
5. 質問文抽出（line 327-341）

本Issueの修正はこれらの責務のうち「継続行判定」のみに影響するため、SRPへの違反はない。ただし、関数全体の責務が今後も拡大する場合、各Passや検証ロジックの関数分離を検討すべきである。

#### OCP (Open/Closed Principle) - 3/5

**評価: 要改善**

設計方針書セクション4-2の修正方針は、既存の `isContinuationLine` 条件に `|| isPathContinuation` を追加する形である。これは「拡張に開かれ、修正に閉じている」というOCPの理念に反する。

現在の実装（line 295）：
```typescript
const isContinuationLine = hasLeadingSpaces || isShortFragment;
```

修正後の設計：
```typescript
const isContinuationLine = hasLeadingSpaces || isShortFragment || isPathContinuation;
```

新しい継続行パターンが必要になるたびに、この行を直接修正する必要がある。設計書セクション9-3でも「全ての折り返しパターンをカバーしきれない可能性」が記載されており、将来の拡張は予見される。

ただし、バグ修正という性質上、過剰な設計変更はKISS/YAGNI原則に反するため、現時点ではこの方式が妥当な判断と言える。OCPへの完全準拠は将来のリファクタリングIssueとして記録することを推奨する。

#### LSP (Liskov Substitution Principle) - 5/5

**評価: 優秀**

設計方針書セクション2-3で明記されている通り、`PromptDetectionResult`, `PromptData`, `MultipleChoicePromptData` の型定義は一切変更しない。`detectPrompt()` の戻り値の契約は完全に維持される。

実際のコードベースの型定義（`/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/types/models.ts` line 167-171）を確認：

```typescript
export interface MultipleChoicePromptData extends BasePromptData {
  type: 'multiple_choice';
  options: MultipleChoiceOption[];
}
```

この型契約は変更されない。

#### ISP (Interface Segregation Principle) - 5/5

**評価: 優秀**

インターフェースの変更はない。呼び出し元（`auto-yes-manager.ts`, `status-detector.ts`, 各API route）のコードに変更は不要であり、ISPの問題は存在しない。

#### DIP (Dependency Inversion Principle) - 5/5

**評価: 優秀**

新しいモジュール依存は追加されない。`prompt-detector.ts` は引き続き `@/types/models` と `./logger` のみに依存する。設計書セクション2-1でCLIツール非依存性の維持が暗黙的に守られている。

### 2-2. KISS原則 - 4/5

**評価: 良好だが一部懸念**

設計方針書の修正内容は2つの正規表現の追加という最小限の変更であり、KISSの観点から概ね適切である。

**良好な点：**
- 代替案A（全非オプション行を継続行として扱う）を偽陽性リスクの高さから正しく排除
- 代替案B（ラベル連結）をKISS原則に基づいて正しく排除
- `continue` スキップの既存動作を維持し、新しい処理フローを追加しない

**懸念点：**

追加される2番目のパターン `/^[a-zA-Z0-9_-]+$/` は「パス断片やファイル名の折り返し」を意図しているが、実際にはより広い範囲の行にマッチする。設計書セクション5-2で中リスクと認識されているものの、「options.length > 0 の場合のみ評価」という暗黙的なガードに依存している点は、コードの意図が直感的に理解しにくくなる。

再現シナリオ（設計書セクション1-3）の実データ：
```
ndmate-issue-161
```
この行は `/^[a-zA-Z0-9_-]+$/` にマッチする。しかし、同じパターンは以下の行にもマッチする：
- `Yes`
- `Proceed`
- `Continue`
- `test-file`

これらが multiple choice のオプション間に出現した場合、意図せず継続行としてスキップされる可能性がある。設計書の分析では「オプション行は NORMAL_OPTION_PATTERN で先にキャッチされる」とあるが、これは `2. Yes` のような形式の行のみに適用される。番号なしの行（例えば質問文の一部）がスキップされるリスクは残る。

### 2-3. YAGNI原則 - 5/5

**評価: 優秀**

設計方針書は不必要な機能を含んでいない。

- ラベル連結機能を不採用とした判断は適切。`resolveAutoAnswer()` がoption.numberを使用することを確認済み（`/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/auto-yes-resolver.ts` line 35: `return target.number.toString()`）
- 全行継続行化（代替案A）を不採用とした判断も適切
- 型変更なし、新規インターフェースなし

### 2-4. DRY原則 - 4/5

**評価: 良好**

新規の重複コードは導入されない。ただし、継続行判定の条件が3つのORで結合される設計は、各条件の「行が継続行であるかを判定する」という共通の意図を、個別のboolean変数に分散させている。これを1つの判定関数に集約すれば、テスト時にも個別条件の検証が容易になる。

---

## 3. 設計パターンの適切性

### 3-1. 既存パターンの維持

設計書セクション4-1で、以下の既存パターンを維持すると明記されている：

| パターン | 実装の整合性 | 判定 |
|---------|------------|------|
| 2パス検出方式 | `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/prompt-detector.ts` line 243-306 | 一致 |
| 多層防御 (Layer 1-4) | Layer 1: `auto-yes-manager.ts` line 284, Layer 2-4: `prompt-detector.ts` line 243-324 | 一致 |
| 逆順スキャン | `prompt-detector.ts` line 266 (`for (let i = lines.length - 1; ...)`) | 一致 |

### 3-2. 条件加算的追加パターン

設計書セクション4-2の「`||` で追加するため、既存の動作に影響しない」という記述は正しい。boolean OR は個々の条件が独立しており、新条件の追加が既存条件の真偽値を変えることはない。

### 3-3. 処理順序による安全性

設計書セクション4-2の「DEFAULT_OPTION_PATTERN と NORMAL_OPTION_PATTERN のマッチングが line 270-285 で先に行われるため、正当なオプション行は isPathContinuation の評価に到達しない」という記述を実装コードで確認した：

```typescript
// line 270-275: DEFAULT_OPTION_PATTERN 先行マッチ
const defaultMatch = line.match(DEFAULT_OPTION_PATTERN);
if (defaultMatch) { ... continue; }

// line 279-285: NORMAL_OPTION_PATTERN 先行マッチ
const normalMatch = line.match(NORMAL_OPTION_PATTERN);
if (normalMatch) { ... continue; }

// line 288以降: 上記にマッチしなかった場合のみ継続行判定
```

この処理順序により、`isPathContinuation` は正当なオプション行に対して評価されないことが確認できた。

---

## 4. テスト設計の妥当性

### 4-1. テストカバレッジ

設計書セクション6-2のテストカテゴリは適切にバランスが取れている：

| カテゴリ | テスト数 | 妥当性 |
|---------|---------|--------|
| 正常系: 折り返し検出 | 2-3 | 再現シナリオに直結。適切 |
| 正常系: パス以外の継続行 | 1 | 拡張性確認。適切 |
| 偽陽性テスト | 3-4 | リスク分析に対応。適切 |
| 回帰テスト | 既存テスト | 既存48テストケースで担保 |
| ターミナル幅テスト | 2 | 実用シナリオ。適切 |
| ラベル非連結検証 | 1 | 意図的な設計決定の文書化。適切 |

### 4-2. テストケースの品質

設計書セクション6-3の具体的なテストケースを検証：

**テストケース6-3-1（正常系）**: 再現シナリオの忠実な再現。オプション数、ラベル内容、isDefault フラグの検証が含まれている。良好。

**テストケース6-3-2（偽陽性）**: パス行を含むyes/noプロンプトが multiple_choice として誤検出されないことの検証。交差影響の防御テストとして適切。

**テストケース6-3-3（ラベル非連結）**: 設計決定（ラベルに継続行テキストを連結しない）の明示的テスト。設計意図の文書化としても機能する。

### 4-3. 不足しているテストケース

以下のテストケースが設計書に含まれていない：

1. **`/^[a-zA-Z0-9_-]+$/` パターンの境界値テスト**: 英単語のみの行（例: `Continue`）がオプション間に存在するケースで、正しくスキップされることの確認
2. **空行を含む折り返しテスト**: 折り返し行の間に空行が存在するケース
3. **`/^[\/~]/` パターンの偽陽性テスト**: `/` で始まる通常テキスト行（例: `/dev/null is not available`）がオプション間に存在するケース

---

## 5. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | `/^[a-zA-Z0-9_-]+$/` パターンが想定外の行をスキップし、逆順スキャンの停止条件（questionEndIndex設定）を遅延させる | Low | Low | P3 |
| セキュリティ | ReDoSリスク: 追加パターンはアンカード。リスクなし | Low | Low | - |
| 運用リスク | 偽陽性によるAuto-Yes誤動作: 既存の多層防御（Layer 1-4）で緩和済み | Low | Low | P3 |

---

## 6. 推奨改善項目 (Should Fix)

### SF-001: isPathContinuation の `/^[a-zA-Z0-9_-]+$/` パターン範囲

**原則**: KISS
**場所**: 設計書セクション4-2

`/^[a-zA-Z0-9_-]+$/` は意図（パス断片の折り返し検出）よりも広い範囲の行にマッチする。最小長チェック（例: `line.length >= 2 && /^[a-zA-Z0-9_-]+$/.test(line)`）を追加するか、このパターンの適用条件に関するコメントを充実させることを推奨する。

なお、再現シナリオの `ndmate-issue-161` は16文字であり、最小長チェックの影響を受けない。実質的にはドキュメント・コメントの充実が主な対応となる。

### SF-002: 継続行判定条件の関数抽出

**原則**: DRY / SRP
**場所**: 設計書セクション4-2

3つの条件（`hasLeadingSpaces`, `isShortFragment`, `isPathContinuation`）を `isContinuationLine()` 関数として抽出することを推奨する。関数化により：
- 単体テストで個別条件の検証が容易になる
- 将来の条件追加時に見通しが良くなる
- JSDocで判定の意図を文書化できる

### SF-003: 継続行パターンの外部化（将来課題）

**原則**: OCP
**場所**: 設計書セクション4-2

本Issueのスコープでは対応不要だが、将来的に `CONTINUATION_PATTERNS` 配列としてパターンを外部化し、`some()` で評価する設計への移行を検討すべきである。これにより、新しい折り返しパターンの追加が関数本体の修正なしで可能になる。

---

## 7. 検討事項 (Consider)

### C-001: YAGNI判断の妥当性確認

代替案B（ラベル連結）の不採用は適切。`resolveAutoAnswer()` が `option.number` のみを使用することを実装コードで確認済み。

### C-002: detectMultipleChoicePrompt の責務分離

将来的に関数が肥大化する場合、各Passと検証ロジックを独立関数に分離することを検討する。

### C-003: 境界値テストの追加

`/^[a-zA-Z0-9_-]+$/` パターンに対する偽陽性の境界値テスト（英単語のみの行がオプション間に存在するケース）を追加することを推奨する。

### C-004: 行番号参照の保守性

設計書内の具体的な行番号参照（line 292-295）は保守性に課題があるが、バグ修正の単発ドキュメントであるため深刻ではない。

---

## 8. 設計書と実装の整合性

| 設計項目 | 設計書の記載 | 実装状況 | 差異 |
|---------|------------|---------|------|
| 修正対象ファイル | `src/lib/prompt-detector.ts` | 該当ファイル存在確認済み | なし |
| 修正対象行 | line 292-295 | 実装コードの該当行と一致 | なし |
| 既存の継続行条件 | `hasLeadingSpaces \|\| isShortFragment` | line 295で確認 | なし |
| DEFAULT_OPTION_PATTERN | `/^\s*\u276F\s*(\d+)\.\s*(.+)$/` | line 182で確認 | なし |
| NORMAL_OPTION_PATTERN | `/^\s*(\d+)\.\s*(.+)$/` | line 189で確認 | なし |
| 型変更 | なし | 型定義変更なし確認 | なし |
| resolveAutoAnswer の動作 | `option.number` を使用 | line 35で `target.number.toString()` 確認 | なし |
| 既存テストファイル | `tests/unit/prompt-detector.test.ts` | 714行、48テストケース確認 | なし |

---

## 9. 総合評価

本設計方針書は、バグ修正として適切なスコープ設定と設計判断がなされている。特に以下の点が高く評価できる：

1. **影響スコープの明確化**: 直接変更ファイルと間接影響ファイルの分離が明確
2. **代替案の検討と排除**: 3つの代替案を設計原則に基づいて正しく評価・排除
3. **偽陽性リスク分析**: 追加パターンのリスクを体系的に分析
4. **既存パターンの維持**: 2パス検出方式、多層防御、逆順スキャンを壊さない
5. **セキュリティ設計**: ReDoSリスクの分析が含まれている
6. **TDDサイクルの明示**: テストファースト開発の指示

改善推奨事項は3件あるが、いずれも「必須修正」ではなく、設計の品質向上に関するものである。本設計方針書に基づく実装は **Conditionally Approved** とする。

---

*Review conducted: 2026-02-07*
*Reviewer: Architecture Review Agent*
*Focus: Design Principles (SOLID/KISS/YAGNI/DRY)*
