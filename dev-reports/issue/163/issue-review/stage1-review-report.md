# Issue #163 レビューレポート

**レビュー日**: 2026-02-06
**フォーカス**: 通常レビュー（整合性・正確性）
**スコープ**: 方式1（load-buffer/paste-buffer）の実装提案
**イテレーション**: 1回目

---

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 3 |
| Should Fix | 4 |
| Nice to Have | 2 |

**総評**: Issue #163は問題の原因分析が詳細であり、tmux load-buffer/paste-buffer方式の提案は技術的に妥当な方向性です。しかし、実装案のエスケープ処理が不完全であり、セキュリティ上の懸念があります。また、Gemini CLIが非インタラクティブモードで動作している点が考慮されておらず、「全CLIツールで共通利用可能」という記載と矛盾しています。

---

## Must Fix（必須対応）

### MF-001: 提案コードのシェルエスケープ処理が不完全

**カテゴリ**: 技術的正確性
**場所**: ## 解決策の提案 > 方式1 > 実装案

**問題**:
提案コードの`printf '%s' "${escapedText}"`において、`escapedText`を生成する前処理が記載されていません。ダブルクォート(`"`)、バックスラッシュ(`\`)、ドル記号(`$`)などの特殊文字がエスケープされない場合、コマンドインジェクションの脆弱性となります。

**証拠**:
- 提案コード: `await execAsync(\`printf '%s' "${escapedText}" | tmux load-buffer -b ${bufferName} -\`);`
- 現在のsendKeys()実装（L213）: `keys.replace(/'/g, "'\\\\''")` - シングルクォートのみエスケープ

**推奨対応**:
1. エスケープ処理の詳細を明記:
   ```typescript
   function escapeForPrintf(text: string): string {
     return text
       .replace(/\\/g, '\\\\')     // バックスラッシュ
       .replace(/"/g, '\\"')        // ダブルクォート
       .replace(/\$/g, '\\$')       // ドル記号
       .replace(/`/g, '\\`')        // バッククォート
       .replace(/!/g, '\\!');       // エクスクラメーション（bashのhistory expansion）
   }
   ```
2. または、`echo`ではなく`cat`とヒアドキュメントを使用してエスケープを回避

---

### MF-002: バッファ名のインジェクションリスク

**カテゴリ**: セキュリティ
**場所**: ## 解決策の提案 > 方式1 > 実装案

**問題**:
バッファ名`cm-${sessionName}`がセッション名を直接埋め込んでいますが、sessionNameに特殊文字が含まれる場合のバリデーションが未記載です。

**証拠**:
- sessionNameは`mcbd-claude-${worktreeId}`形式（claude-session.ts L170）
- worktreeIdにはDBから取得した値が使用され、ユーザー入力が含まれる可能性

**推奨対応**:
1. tmuxバッファ名の許可文字を明記（英数字、ハイフン、アンダースコアのみ等）
2. バッファ名生成時にバリデーション・サニタイズ処理を追加:
   ```typescript
   const sanitizedName = sessionName.replace(/[^a-zA-Z0-9_-]/g, '_');
   const bufferName = `cm-${sanitizedName}`;
   ```

---

### MF-003: Gemini CLIとの整合性問題

**カテゴリ**: 整合性
**場所**: ## 解決策の提案 > 方式1

**問題**:
Issue本文では「Claude/Codex/Gemini全てに対応可能」と記載されていますが、Gemini CLIは非インタラクティブモードで動作しており、paste-buffer方式が適用できません。

**証拠**:
`src/lib/cli-tools/gemini.ts` L96-102:
```typescript
// Execute Gemini in non-interactive mode using stdin piping
// This approach bypasses the TUI and executes in one-shot mode
await sendKeys(sessionName, `echo '${escapedMessage}' | gemini`, true);
```

**推奨対応**:
1. Geminiについてはpaste-buffer方式の対象外であることを明記
2. Geminiには既存のパイプ方式のエスケープ改善で対応することを追記
3. または「Claude/Codex/Gemini」を「Claude/Codex等のインタラクティブCLI」に修正

---

## Should Fix（推奨対応）

### SF-001: バッファ削除失敗時のエラーハンドリング

**カテゴリ**: エラーハンドリング
**場所**: ## 解決策の提案 > 方式1 > 実装案

**問題**:
提案コードではload-buffer, paste-buffer, delete-bufferの3ステップが逐次実行されますが、中間で失敗した場合のエラーハンドリングが未定義です。

**推奨対応**:
```typescript
try {
  await execAsync(`printf ... | tmux load-buffer ...`);
  await execAsync(`tmux paste-buffer ...`);
} finally {
  // バッファリークを防ぐため、成功・失敗に関わらず削除を試行
  await execAsync(`tmux delete-buffer -b ${bufferName}`).catch(() => {});
}
```

---

### SF-002: paste-buffer -d オプションの活用

**カテゴリ**: 完全性
**場所**: ## 解決策の提案 > 方式1 > 実装案

**問題**:
tmuxの`paste-buffer -d`オプション（ペースト後に自動削除）への言及がありません。

**推奨対応**:
```typescript
// -d: ペースト後にバッファを自動削除（3ステップ→2ステップに削減）
await execAsync(`tmux paste-buffer -t "${sessionName}" -b ${bufferName} -p -d`);
```

---

### SF-003: sendKeysとの使い分け基準

**カテゴリ**: 明確性
**場所**: ## 解決策の提案 > 方式1

**問題**:
新関数`sendTextViaBuffer()`と既存の`sendKeys()`の使い分け基準が曖昧です。

**推奨対応**:
以下のいずれかを明記:
- **オプションA**: 全てのメッセージ送信を`sendTextViaBuffer()`に置き換え
- **オプションB**: 改行を含むメッセージのみ`sendTextViaBuffer()`を使用
- **オプションC**: `sendKeys()`に閾値判定ロジックを追加し、内部で自動切り替え

---

### SF-004: 方式2の効果の根拠

**カテゴリ**: 技術的妥当性
**場所**: ## 解決策の提案 > 方式2

**問題**:
方式2（追加Enter送信）が暫定対応として効果的かどうかの根拠が不足しています。

**推奨対応**:
- Claude Code Issue #3412のコメントで追加Enterが有効であるという報告があれば引用
- または、実際に検証した結果を追記

---

## Nice to Have（あれば良い）

### NTH-001: 受け入れ条件の追加

**場所**: Issue本文全体

**推奨追加内容**:
```markdown
## 受け入れ条件
- [ ] 50行以上の複数行メッセージが正常に送信・処理されること
- [ ] 改行、タブ、特殊文字（`$`, `"`, `\`, `` ` ``）を含むメッセージが正しく送信されること
- [ ] セキュリティテスト（コマンドインジェクション試行）をパスすること
- [ ] 既存のユニットテストが全てパスすること
```

---

### NTH-002: テスト戦略の記載

**場所**: Issue本文全体

**推奨追加内容**:
- 新しい`sendTextViaBuffer()`関数に対するユニットテストの方針
- エッジケース: 空文字列、超長文（10KB以上）、特殊文字のみ、NULバイト含む等

---

## 参照ファイル

### コード
| ファイル | 関連箇所 | 説明 |
|----------|----------|------|
| `src/lib/tmux.ts` | L207-225 | 既存のsendKeys関数。シングルクォートのエスケープのみ |
| `src/lib/claude-session.ts` | L360-394 | sendMessageToClaude関数。sendKeysを使用 |
| `src/lib/cli-tools/codex.ts` | L97-126 | CodexのsendMessage。execAsync直接使用とsendKeys混在 |
| `src/lib/cli-tools/gemini.ts` | L85-109 | GeminiのsendMessage。パイプ経由の非インタラクティブ実行 |

### 外部参照
| リソース | 説明 |
|----------|------|
| [Claude Code #3412](https://github.com/anthropics/claude-code/issues/3412) | ペーストテキスト折りたたみ挙動 |
| [tmux Discussion #4098](https://github.com/orgs/tmux/discussions/4098) | paste-buffer改行問題 |

---

## 次のステップ

1. **MF-001〜MF-003の対応**: 必須対応事項をIssue本文に反映
2. **SF-001〜SF-004の検討**: 実装方針の詳細化
3. **Stage 2レビュー**: 影響範囲レビューの実施
