# Issue #212 レビューレポート

**レビュー日**: 2026-02-10
**フォーカス**: 影響範囲レビュー
**イテレーション**: 1回目（Stage 3）

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 2 |
| Should Fix | 4 |
| Nice to Have | 3 |

---

## Must Fix（必須対応）

### MF-1: response-poller.tsのcleanClaudeResponse()にPasted textパターンの除外が必要

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 セクション

**問題**:
`response-poller.ts`の`cleanClaudeResponse()`関数は、tmuxバッファから取得した出力をクリーニングしてユーザーに表示するレスポンスを生成する。この関数のskipPatternsに`[Pasted text]`パターンが含まれていないため、sendMessageToClaude()でPasted text検知+Enter再送が行われた場合でも、tmuxバッファに一時的に残る`[Pasted text #1 +XX lines]`の表示がレスポンスコンテンツに混入するリスクがある。

**証拠**:
- `src/lib/response-poller.ts` L135-158: `cleanClaudeResponse()`のskipPatternsには`/CLAUDE_HOOKS_/`、`/^\/bin\/claude/`等のClaude固有パターンが列挙されているが、`/\[Pasted text/`に該当するパターンは存在しない
- sendKeys後にcapturePaneでバッファを取得する際、Enter再送までの間にPollerがバッファを読み取ると`[Pasted text]`表示を含む内容が取得される可能性がある
- `extractResponse()`内部でもfullOutputを検査する箇所があり、同様のリスクがある

**推奨対応**:
影響範囲テーブルに以下を追加する。
- `src/lib/response-poller.ts`: `cleanClaudeResponse()`のskipPatternsに`PASTED_TEXT_PATTERN`を追加（Pasted text表示がレスポンスに混入することを防止）
- 受け入れ条件に「`[Pasted text #N +XX lines]`の表示がレスポンスメッセージに含まれないこと」を追加

---

### MF-2: codex.test.tsにsendMessage()のテスト基盤が存在しない

**カテゴリ**: テスト範囲
**場所**: ## テスト セクション

**問題**:
Issue #212に記載のテストファイル`tests/unit/cli-tools/codex.test.ts`は、現在sendMessage()の動作テストを含んでいない。既存のcodex.test.tsはプロパティ確認とインターフェース実装確認のみ（全82行）で、sendMessage()の実際のsendKeys/execAsync呼び出しをモックでテストする構造になっていない。Pasted text検知テストを追加するためには、まずsendMessage()のテスト基盤を構築する必要がある。

**証拠**:
- `tests/unit/cli-tools/codex.test.ts`: `describe('Interface implementation')`の`it('should implement all required methods')`でメソッド存在確認のみ
- 対照的に`tests/unit/lib/claude-session.test.ts`にはsendMessageToClaude()のモックベースのテストが充実している（530行、sendKeys/capturePaneのモック設定含む）

**推奨対応**:
テストセクションに以下を明記する。
- codex.test.tsにsendMessage()のユニットテスト基盤を新規構築する必要がある（tmuxモジュールのモック、sendKeys/capturePane/execAsyncのモック設定）
- テスト工数の見積もりにこの基盤構築コストを含めること

---

## Should Fix（推奨対応）

### SF-1: 新規定数の配置場所の明確化

**カテゴリ**: 影響ファイル
**場所**: ## 実装箇所 コードスニペット / ## 考慮事項 セクション

**問題**:
定数（`PASTED_TEXT_DETECT_DELAY`, `PASTED_TEXT_PATTERN`, `MAX_PASTED_TEXT_RETRIES`）の配置場所がIssueで明確に定義されていない。コードスニペットではsendMessageToClaude()のローカル定数として記述されているが、以下の問題がある。
- codex.tsでも同じパターンとリトライロジックを使用する場合に重複が発生する
- テストで定数値を参照できない
- `response-poller.ts`のskipPatternsからも`PASTED_TEXT_PATTERN`を参照する必要がある（MF-1参照）

**証拠**:
- `src/lib/claude-session.ts` L37-113: 既存の定数（`CLAUDE_INIT_TIMEOUT`等）は全てモジュールレベルでexportされている
- `src/lib/cli-patterns.ts` L54-73: パターン定数（`CLAUDE_PROMPT_PATTERN`等）はcli-patterns.tsで一元管理されている

**推奨対応**:
定数の配置方針を明記する。
- `PASTED_TEXT_PATTERN`は`cli-patterns.ts`に配置（response-poller.tsのskipPatternsからも参照するため）
- `PASTED_TEXT_DETECT_DELAY`と`MAX_PASTED_TEXT_RETRIES`は`claude-session.ts`のモジュールレベル定数としてexportする
- または、共通の`pasted-text-handler.ts`ヘルパーモジュールを作成して検知+Enter再送ロジックを一元化する選択肢も検討する

---

### SF-2: codex.tsへの新規依存関係追加の明記

**カテゴリ**: 依存関係
**場所**: ## 影響範囲 セクション

**問題**:
codex.tsのsendMessage()内でPasted text検知を行うためには`capturePane()`と`stripAnsi()`のインポートが必要になるが、現在のcodex.tsはこれらをインポートしていない。新たな依存関係の追加が必要である。

**証拠**:
- `src/lib/cli-tools/codex.ts` L1-17: 現在のインポートは`BaseCLITool`, `CLIToolType`, `hasSession`, `createSession`, `sendKeys`, `killSession`, `exec`, `promisify`のみ
- `capturePane`（from tmux.ts）と`stripAnsi`（from cli-patterns.ts）は未インポート

**推奨対応**:
影響範囲テーブルのcodex.ts変更内容に「`capturePane` (from tmux.ts)、`stripAnsi` (from cli-patterns.ts) の新規インポート追加」を明記する。

---

### SF-3: Gemini CLIへの影響の明記

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 セクション / ## 考慮事項 セクション

**問題**:
Gemini CLIのsendMessage()への影響が考慮されていない。gemini.tsのsendMessage()（L85-108）は`echo 'message' | gemini`というパイプ形式でメッセージを送信しており、sendKeys()にメッセージ全体をコマンド文字列として渡している。この形式でも長いメッセージの場合にtmuxレベルでペースト検出が発生する可能性がある。

**証拠**:
- `src/lib/cli-tools/gemini.ts` L96-102: sendMessage()は`sendKeys(sessionName, `echo '${escapedMessage}' | gemini`, true)`で送信
- Geminiはnon-interactiveモードのため、Claude CLIのink-based TUIとは異なる挙動の可能性が高い

**推奨対応**:
考慮事項セクションに以下を追記する。「Gemini CLIはnon-interactiveモード（echo | gemini）で動作するため、Claude CLIのPasted text表示は発生しない見込み。ただし、tmuxレベルのペースト検出リスクは残る。初期実装ではGeminiは対象外とし、問題発生時に対応する」

---

### SF-4: 統合テストへの影響の明記

**カテゴリ**: テスト範囲
**場所**: ## テスト セクション

**問題**:
統合テスト（`tests/integration/api-send-cli-tool.test.ts`）への影響が考慮されていない。このテストはsendMessageToClaude等をモックしており、Pasted text検知ロジック追加後もモックが正しく動作するか確認が必要。

**証拠**:
- `tests/integration/api-send-cli-tool.test.ts` L14-18: `vi.mock('@/lib/claude-session')`でsendMessageToClaudeをモックしている
- sendMessageToClaudeの内部実装変更は統合テストのモックレベルでは直接影響しないが、`claude-session.test.ts`のモック構造（L12-18: `vi.mock('@/lib/tmux')`）にはcapturePane呼び出し追加の影響がある

**推奨対応**:
テストセクションに以下を追加する。
- `tests/integration/api-send-cli-tool.test.ts`の既存モックがPasted text検知ロジック追加後も正しく動作することの確認
- `claude-session.test.ts`のsendMessageToClaude()テストにcapturePane新規呼び出しに対応するモック追加

---

## Nice to Have（あれば良い）

### NTH-1: API応答時間増加の影響

**カテゴリ**: 破壊的変更
**場所**: ## 考慮事項 セクション

**問題**:
sendMessageToClaude()の実行時間が、最悪ケースで約2500ms（PASTED_TEXT_DETECT_DELAY 500ms x MAX_RETRIES 3回 = 1500ms追加）増加する。API route（`/api/worktrees/:id/send`）のレスポンスタイムに直接影響する。

**推奨対応**:
考慮事項に「最悪ケースでのAPI応答時間が約1.5秒増加する。フロントエンドのタイムアウト設定やUX影響を確認する」旨を追記する。

---

### NTH-2: CLAUDE.mdのモジュール説明更新

**カテゴリ**: ドキュメント更新
**場所**: ## 影響範囲 セクション

**問題**:
CLAUDE.mdのモジュール一覧にPasted text関連の定数・ロジックの記載が将来必要になる。

**推奨対応**:
影響範囲テーブルにドキュメント更新行を追加する。「CLAUDE.md: claude-session.tsとcodex.tsのモジュール説明にIssue #212の変更内容を追記」

---

### NTH-3: DRYリファクタリングの設計検討

**カテゴリ**: 影響ファイル
**場所**: ## 解決方針 セクション

**問題**:
Pasted text検知+Enter再送ロジックがclaude-session.tsとcodex.tsで重複実装される。

**推奨対応**:
考慮事項に「初期実装では各ファイルに個別実装し、パターンが安定した後にDRYリファクタリング（共通ヘルパー抽出）を検討する」旨を追記する。

---

## 影響分析サマリー

### 直接変更対象（Issueに記載済み）

| ファイル | 変更内容 | 確認結果 |
|---------|---------|---------|
| `src/lib/claude-session.ts` | sendMessageToClaude()にPasted text検知+Enter再送ロジック追加 | 妥当。変更箇所L424-425の後に追加 |
| `src/lib/cli-tools/codex.ts` | sendMessage()に同様のロジック追加 | 妥当。ただしcapturePane/stripAnsiの新規依存追加が必要（SF-2） |

### 追加変更が必要なファイル（Issueに未記載）

| ファイル | 変更内容 | 理由 |
|---------|---------|------|
| `src/lib/response-poller.ts` | cleanClaudeResponse()のskipPatternsにPASTED_TEXT_PATTERN追加 | MF-1: レスポンスへの混入防止 |
| `src/lib/cli-patterns.ts` | PASTED_TEXT_PATTERN定数の配置 | SF-1: 複数モジュールからの参照に対応 |

### 影響なしと確認されたファイル

| ファイル | 確認理由 |
|---------|---------|
| `src/lib/auto-yes-manager.ts` | 自動応答はy/n/数字のみ送信。複数行テキスト送信なし |
| `src/lib/prompt-detector.ts` | [Pasted text]形式はどのプロンプトパターンにもマッチしない |
| `src/lib/status-detector.ts` | [Pasted text]形式はthinking/prompt/separatorパターンにマッチしない |
| `src/lib/cli-tools/gemini.ts` | non-interactiveモードのため直接影響なし（低リスク残存） |
| `src/lib/cli-tools/claude.ts` | sendMessageToClaude()への委譲のみ。自動反映 |

### テスト影響範囲

| テストファイル | 影響内容 |
|--------------|---------|
| `tests/unit/lib/claude-session.test.ts` | capturePaneモック追加 + Pasted text検知テスト新規追加 |
| `tests/unit/cli-tools/codex.test.ts` | sendMessage()テスト基盤の新規構築が必要（MF-2） |
| `tests/unit/tmux.test.ts` | 直接変更不要。参考用 |
| `tests/integration/api-send-cli-tool.test.ts` | モック構造の整合性確認（SF-4） |

---

## 参照ファイル

### コード
- `src/lib/claude-session.ts` (L394-427): 主要な変更対象関数sendMessageToClaude()
- `src/lib/cli-tools/codex.ts` (L111-140): 副次的な変更対象関数sendMessage()
- `src/lib/response-poller.ts` (L110-172): cleanClaudeResponse() -- skipPatternsにPasted text追加が必要
- `src/lib/cli-patterns.ts` (L54-207): パターン定数の一元管理 -- PASTED_TEXT_PATTERN配置候補
- `src/lib/cli-tools/gemini.ts` (L85-108): non-interactiveモードのsendMessage()
- `src/lib/auto-yes-manager.ts` (L270-419): 影響なし確認
- `src/lib/prompt-detector.ts` (L1-553): 影響なし確認
- `src/app/api/worktrees/[id]/send/route.ts` (L139-148): API応答時間への影響

### テスト
- `tests/unit/lib/claude-session.test.ts` (L1-531): sendMessageToClaude()テスト
- `tests/unit/cli-tools/codex.test.ts` (L1-83): sendMessage()テスト基盤未構築
- `tests/unit/tmux.test.ts` (L1-459): tmuxモジュールテスト
- `tests/integration/api-send-cli-tool.test.ts` (L1-50): 統合テスト

### ドキュメント
- `CLAUDE.md`: モジュール説明の将来更新が必要
