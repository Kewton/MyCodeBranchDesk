# Issue #49 Stage 5 レビューレポート - 通常レビュー（2回目）

**レビュー日**: 2026-01-30
**フォーカス**: 通常レビュー（2回目）
**ステージ**: 5/6

---

## サマリー

Stage 1で指摘した全9件の指摘事項は**全て適切に対応**されています。

| カテゴリ | Stage 1 指摘 | 対応状況 |
|---------|-------------|---------|
| Must Fix | 2件 | 全て解消 |
| Should Fix | 4件 | 全て解消 |
| Nice to Have | 3件 | 全て解消 |

### 新規発見事項

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 0件 |
| Should Fix | 2件 |
| Nice to Have | 2件 |

---

## 前回指摘の対応状況

### 全て解消済み

| ID | 元の指摘 | 対応内容 |
|----|---------|---------|
| MF-1 | API設計が既存構造と矛盾 | `/api/worktrees/:id/files/...` パターンに統一。後方互換性も明記 |
| MF-2 | ファイル内容取得APIの設計欠落 | 既存GET APIの活用を明記、パラメータ仕様も明確 |
| SF-1 | マークダウンライブラリ未指定 | `react-markdown` + `remark-gfm` を指定、既存依存であることも確認 |
| SF-2 | FileViewerとの関係性不明確 | FileViewer変更なし、新規MarkdownEditor.tsx作成の方針を明確化 |
| SF-3 | 保存トリガー/UI未定義 | ファイル保存仕様セクション追加（手動保存、ボタン配置、未保存警告） |
| SF-4 | エラーハンドリング欠落 | エラーハンドリングセクション追加（種別、ステータス、UI対応を表形式で定義） |
| NTH-1 | FileTreeView変更影響未記載 | FileTreeView.tsx (465行) への具体的変更内容を明記 |
| NTH-2 | md以外のファイル表示ポリシー曖昧 | 「表示のみ（編集不可）」に確定 |
| NTH-3 | キーボードショートカット未定義 | Ctrl/Cmd+S（保存）、Escape（閉じる）を定義 |

---

## 新規発見事項

### Should Fix（推奨対応）

#### SF-NEW-1: リネームAPIのパス構造

**カテゴリ**: 完全性
**場所**: 技術仕様 > API設計 セクション

**問題**:
リネームAPIは `/api/worktrees/:id/files/:path/rename` となっていますが、他のAPIは `:path` で終わる構造です。

**技術的背景**:
現在 `/api/worktrees/[id]/files/[...path]/route.ts` のみ存在します。リネーム用に `/rename/route.ts` を追加配置する必要があり、Next.js App Routerでのネスト構造の実装方針を明記することを推奨します。

**推奨対応**:
API設計セクションに実装上の注意点として以下を追記:
```
リネームAPIの実装: src/app/api/worktrees/[id]/files/[...path]/rename/route.ts を新規作成
```

---

#### SF-NEW-2: トースト通知の実装方針

**カテゴリ**: 明確性
**場所**: 機能要件 > ファイル保存仕様 セクション

**問題**:
「トースト通知（3秒で自動消去）」とありますが、プロジェクトに既存のトーストコンポーネントがあるか、新規作成が必要かが未確認です。

**推奨対応**:
以下のいずれかを検討し明記:
1. 既存のUI通知コンポーネントを活用
2. 新規トーストコンポーネントを作成
3. ライブラリ（react-hot-toast等）の導入

---

### Nice to Have（あれば良い）

#### NTH-NEW-1: 表示モードの状態永続化

**カテゴリ**: 完全性
**場所**: 機能要件 > 表示モード切り替え セクション

**問題**:
分割表示/エディタのみ/プレビューのみの選択状態を永続化するかどうかが未定義です。

**推奨対応**:
ユーザー体験向上のため、以下を検討:
- ローカルストレージでモード選択を記憶
- ファイル再選択時に前回モードを復元

---

#### NTH-NEW-2: 空でないディレクトリの削除

**カテゴリ**: 完全性
**場所**: 機能要件 > ファイルツリー操作 セクション

**問題**:
空でないディレクトリを削除しようとした場合の動作が未定義です。

**推奨対応**:
以下のいずれかを明記:
1. 空でないディレクトリは削除エラーとする（安全）
2. 再帰削除を許可（確認ダイアログで明示的に警告）

---

## 品質評価

| 評価項目 | スコア | コメント |
|---------|-------|---------|
| 整合性 | Excellent | 既存APIパターン、ライブラリ活用が適切 |
| 正確性 | Excellent | ファイルパス、行番号、構造が実コードと一致 |
| 完全性 | Good | 主要要件は網羅。細部で若干の追記推奨 |
| 明確性 | Excellent | 表形式による仕様整理が適切 |
| 受け入れ条件 | Excellent | 具体的で検証可能 |

---

## 参照ファイル

### コード
| ファイル | 関連性 |
|---------|-------|
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/app/api/worktrees/[id]/files/[...path]/route.ts` | 現在GETのみ実装。PUT/POST/DELETE追加対象 |
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/components/worktree/FileTreeView.tsx` | 465行。右クリックメニュー追加対象 |
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/lib/file-tree.ts` | LIMITS.MAX_FILE_SIZE_PREVIEW定義確認 |
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/components/worktree/MessageList.tsx` | react-markdown使用例（L14-15） |

---

## 結論

**Issue #49は実装着手可能な状態です。**

Stage 1の指摘は全て適切に対応され、非常に高品質な仕様書となっています。新規発見の4点はいずれも軽微であり、実装フェーズでの対応で問題ありません。

次のステージ（Stage 6: 影響範囲レビュー2回目）で最終確認を行うことを推奨します。
