# Issue #256 レビューレポート（Stage 1）

**レビュー日**: 2026-02-13
**フォーカス**: 通常レビュー（整合性・正確性）
**イテレーション**: 1回目
**仮説検証結果**: 全6仮説 Confirmed（Phase 0.5完了）

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 1 |
| Should Fix | 4 |
| Nice to Have | 2 |

## 全体評価

Issue #256の根本原因分析は非常に正確で、仮説検証（Phase 0.5）で全6仮説が Confirmed されている。コードの行番号、関数名、ロジックフローの記述はすべて実際のコードベースと完全に一致している。

一方、**対策案のセキュリティ影響評価が不十分**であり、特にPattern 4（末尾句読点に依存しないキーワードチェック）の追加がSEC-001bの防御機能を大幅に緩和するリスクが最大の懸念事項である。

---

## Must Fix（必須対応）

### MF-1: Pattern 4追加によるSEC-001b防御緩和リスク

**カテゴリ**: 技術的妥当性
**場所**: ## 対策案 > 具体的な修正案

**問題**:
提案されたPattern 4（`if (QUESTION_KEYWORD_PATTERN.test(line)) return true;`）は、末尾の句読点（`:`, `?`）に依存せず、行内にキーワードが含まれるだけで `true` を返す。これはIssue #208で導入されたSEC-001bの防御設計を大幅に緩和する。

**証拠**:

`QUESTION_KEYWORD_PATTERN`（`src/lib/prompt-detector.ts` L294）には以下のキーワードが含まれる:

```
select|choose|pick|which|what|how|where|enter|type|specify|confirm|approve|accept|reject|decide|preference|option
```

これらのうち `type`, `how`, `where`, `option` は一般的な英単語であり、通常の文章中に頻出する。Pattern 4を追加した場合の誤検出例:

| questionEndIndex行 | 現行 | Pattern 4追加後 | 結果 |
|---|---|---|---|
| `The following types of changes were made.` | false | **true** (`type`にマッチ) | False Positive |
| `Here are the options available.` | false | **true** (`option`にマッチ) | False Positive |
| `See how the implementation works.` | false | **true** (`how`にマッチ) | False Positive |
| `Specify where to deploy.` | false | **true** (`specify`, `where`にマッチ) | True Positive（意図通り） |

特にAuto-Yes機能が有効な場合、False Positiveは自動応答の誤送信につながるため、セキュリティ上の影響が大きい。

**推奨対応**:

Issueの「注意」セクションで言及されている以下の代替案を正式な修正方針として採用すべき:

1. **代替案A**: `questionEndIndex`から上方に走査して、`?`/キーワードを含む行を探索する方法
   - 現在のquestionEndIndexは「最後の非オプション行」を指すが、実際の質問行はそれより上にある可能性がある（パターンAの複数行折り返しケース）
   - 上方探索により、折り返された質問の「？」を含む行を見つけられる

2. **代替案B**: `hasDefaultIndicator`（❯指標の有無）との組み合わせ判定
   - パターンBのmodel選択プロンプトには `❯` が含まれるため、`hasDefaultIndicator=true` の場合はキーワードチェックを緩和する
   - `requireDefault=false` かつ `hasDefaultIndicator=false` の場合のみ厳格なSEC-001bを維持

---

## Should Fix（推奨対応）

### SF-1: パターンBのrequireDefaultIndicator条件分岐の明確化

**カテゴリ**: 完全性
**場所**: ## 失敗パターンB: 質問形式でないプロンプト

**問題**:
パターンBのmodel選択プロンプトの例では `❯ 1. Default (recommended)` という行が含まれている。この場合、`requireDefaultIndicator=true`（Codex/Geminiのデフォルト動作）ではSEC-001bガードが適用されないため、Layer 4までの検証を通過して検出される可能性がある。

一方、`requireDefaultIndicator=false`（Claude固有設定）ではSEC-001bが適用され、`isQuestionLikeLine("Switch between Claude models. Applies to this session and future Claude Code sessions. For other/previous model names, specify with --model.")` が false を返すため検出失敗する。

**証拠**:
- `src/lib/prompt-detector.ts` L514: `if (!requireDefault)` -- SEC-001bはrequireDefault=falseの場合のみ
- `src/lib/cli-patterns.ts` L271: Claudeのみ `{ requireDefaultIndicator: false }`
- パターンBの例には `❯` 指標が含まれている

**推奨対応**:
Issueにこの条件分岐の違いを明記し、修正がClaude固有パス（`requireDefault=false`）にのみ影響することを明確にすべき。

---

### SF-2: エッジケースのテストケース不足

**カテゴリ**: 完全性
**場所**: ## 受入条件

**問題**:
受入条件には主要なパターンA/Bのテストが含まれているが、以下のエッジケースが不足している:

1. **折り返し位置が「?」の直前のケース**: 質問文の`?`が2行目の先頭に来る場合（Pattern 2の `line.includes('?')` が機能するケース）
2. **日本語句読点のバリエーション**: 「、」（読点）で終わる中間行が質問行として誤判定されないことの確認
3. **1行に収まるケースの回帰テスト**: 末尾が「？」で正常検出される既存動作の回帰確認

**推奨対応**:
受入条件に以下を追加:
- `[ ]` 質問文が1行に収まる場合（末尾が「？」）の検出が正常に動作する（回帰テスト）
- `[ ]` 「?」が行中に含まれる場合のFalse Positiveが発生しないこと

---

### SF-3: Pattern 2（行内?チェック）のFalse Positiveリスク未評価

**カテゴリ**: 明確性
**場所**: ## 対策案 > 具体的な修正案

**問題**:
提案のPattern 2（`line.includes('?') || line.includes('\uff1f')`）は、行の任意位置に `?` が含まれれば `true` を返す。現行のPattern 1（`line.endsWith('?')`）は末尾一致のみで安全だが、行内チェックは以下の誤検出リスクがある:

| 行の内容 | endsWith('?') | includes('?') |
|---|---|---|
| `対策方針としてどれが適切ですか？コード調査の結果...` | false | **true** |
| `https://example.com/api?key=value にアクセスします。` | false | **true** |
| `README.md の "How to use?" セクションを参照。` | false | **true** |

1番目は意図通り（パターンAの修正対象）だが、2番目と3番目はFalse Positiveである。

**推奨対応**:
Pattern 2のFalse Positiveリスクを評価し、Issueに記載すべき。実運用上のリスクが低いと判断する場合は、その根拠（questionEndIndex行はオプションの直前行であり、URLやmarkdownリファレンスが現れる可能性は低い等）を明記する。

---

### SF-4: isContinuationLine()との相互作用テスト不足

**カテゴリ**: 受け入れ条件
**場所**: ## 受入条件

**問題**:
パターンBのmodel選択プロンプトでは、`Select model` や `Switch between...--model.` という行がインデントされている（先頭にスペースあり）。`isContinuationLine()` の `hasLeadingSpaces` 条件（L389）は `?` または `？` で終わる行を除外するが、`.`（ピリオド）や文字で終わる行は除外しない。

そのため、インデントされた `Switch between...--model.` はcontinuation lineとして扱われ、`questionEndIndex` が `Select model` よりさらに上の行に設定される可能性がある。

**証拠**:
```typescript
// src/lib/prompt-detector.ts L388-389
const endsWithQuestion = line.endsWith('?') || line.endsWith('\uff1f');
const hasLeadingSpaces = /^\s{2,}[^\d]/.test(rawLine) && !/^\s*\d+\./.test(rawLine) && !endsWithQuestion;
```

`Switch between Claude models...--model.` は:
- `endsWithQuestion`: false（`.`で終わる）
- `/^\s{2,}[^\d]/.test(rawLine)`: true（先頭にスペースあり、非数字）
- `!/^\s*\d+\./.test(rawLine)`: true（数字+ドットパターンではない）
- よって `hasLeadingSpaces` = true -> continuation line扱い

**推奨対応**:
受入条件に以下を追加:
- `[ ]` インデントされた質問行（パターンBの `Select model` 形式）がcontinuation lineとして誤分類されないこと

---

## Nice to Have（あれば良い）

### NTH-1: 関連Issueへのリンク追加

**カテゴリ**: 完全性
**場所**: Issue本文

**問題**:
Issue #208（SEC-001b導入）、Issue #193（requireDefaultIndicator導入）、Issue #161（2パス検出導入）が密接に関連するが、Issue本文に明示的なリンクがない。

**推奨対応**:
本文の適切な箇所に `See also: #208, #193, #161` 等のリンクを追加。

---

### NTH-2: UI表示確認の手動テスト観点

**カテゴリ**: 完全性
**場所**: ## 受入条件

**問題**:
影響範囲にPromptPanel.tsxとMobilePromptSheet.tsxが記載されているが、受入条件にUI表示の手動確認が含まれていない。

**推奨対応**:
手動テスト観点として以下を追加:
- `[ ]` デスクトップのPromptPanelでパターンA/Bのプロンプトが正しく表示される
- `[ ]` モバイルのMobilePromptSheetでパターンA/Bのプロンプトが正しく表示される

---

## 影響範囲の正確性に関する評価

Issueに記載された影響範囲は概ね正確である。以下の点を確認した:

| ファイル | Issueの記載 | 検証結果 |
|---------|-----------|---------|
| `src/lib/prompt-detector.ts` | 変更対象 | 正確。isQuestionLikeLine()が修正対象 |
| `tests/unit/prompt-detector.test.ts` | テスト追加 | 正確。既存テストは1800行超、充実している |
| `src/app/api/worktrees/[id]/current-output/route.ts` | 変更不要・影響確認 | 正確。L93-94でdetectPrompt()を呼び出す |
| `src/lib/status-detector.ts` | 変更不要・影響確認 | 正確。L141-142でdetectPrompt()を呼び出す |
| `src/lib/response-poller.ts` | 変更不要・影響確認 | 正確。L28でdetectPrompt()をimportし使用 |
| `src/components/worktree/PromptPanel.tsx` | 変更不要・影響確認 | 正確。UIレベルの表示のみ |
| `src/components/mobile/MobilePromptSheet.tsx` | 変更不要・影響確認 | 正確。UIレベルの表示のみ |

**追加で確認が必要なファイル**:
- `tests/integration/issue-208-acceptance.test.ts`: SEC-001bの受入テスト。修正後もこのテストがすべてパスすることの確認が必要
- `src/lib/auto-yes-manager.ts`: Auto-Yes機能がdetectPrompt()の結果に依存するため、False Positive時の影響確認が必要

---

## 参照ファイル

### コード
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/prompt-detector.ts`: 修正対象（isQuestionLikeLine() L315-332、isContinuationLine() L381-395、SEC-001b L510-529）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/cli-patterns.ts`: buildDetectPromptOptions() L267-273
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/status-detector.ts`: detectSessionStatus() L114-197
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/app/api/worktrees/[id]/current-output/route.ts`: API応答でのdetectPrompt()呼び出し
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/tests/unit/prompt-detector.test.ts`: 既存テスト（1800行超）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/tests/integration/issue-208-acceptance.test.ts`: SEC-001b受入テスト

### ドキュメント
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/dev-reports/design/issue-208-auto-yes-numbered-list-false-positive-design-policy.md`: SEC-001bの設計ポリシー
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/CLAUDE.md`: プロジェクトガイドライン

---

*Generated by issue-review-agent - Stage 1 (通常レビュー 1回目)*
