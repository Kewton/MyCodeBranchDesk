# 作業計画: Commands & Agents & ドキュメント整備

**作成日**: 2025-12-05
**プロジェクト**: MyCodeBranchDesk
**目的**: Claude Code用スラッシュコマンド、サブエージェント、利用ガイドの整備

---

## 1. 概要

### 目標
MyCodeBranchDeskの開発効率向上のため、以下を整備する：
1. **Commands**: 開発フローを効率化するスラッシュコマンド
2. **Agents**: 特定タスクに特化したサブエージェント
3. **ドキュメント**: ユーザー向け利用ガイド

### 成果物サマリー

| カテゴリ | Phase 1 | Phase 2 | Phase 3 | 合計 |
|---------|---------|---------|---------|------|
| Commands | 4個 | 4個 | 4個 | 12個 |
| Agents | 2個 | 3個 | - | 5個 |
| Docs | 2個 | 2個 | - | 4個 |

---

## 2. 作業フェーズ

### Phase 1: 基盤整備（優先度: 高）

#### 2.1 ディレクトリ構造作成

```
.claude/
├── commands/           # スラッシュコマンド
├── agents/             # サブエージェント
└── prompts/            # 共通プロンプト

docs/
└── user-guide/         # 利用ガイド

dev-reports/            # 出力ディレクトリ
└── issue/
```

#### 2.2 Commands実装（Phase 1）

| No | コマンド | ファイル | 説明 |
|----|---------|----------|------|
| 1 | `/work-plan` | `.claude/commands/work-plan.md` | Issue単位の作業計画立案 |
| 2 | `/create-pr` | `.claude/commands/create-pr.md` | PR自動作成 |
| 3 | `/progress-report` | `.claude/commands/progress-report.md` | 進捗報告書作成 |
| 4 | `/tdd-impl` | `.claude/commands/tdd-impl.md` | TDD実装 |

#### 2.3 Agents実装（Phase 1）

| No | エージェント | ファイル | 用途 |
|----|-------------|----------|------|
| 1 | `tdd-impl-agent` | `.claude/agents/tdd-impl-agent.md` | TDD実装専門 |
| 2 | `progress-report-agent` | `.claude/agents/progress-report-agent.md` | 進捗報告生成 |

#### 2.4 ドキュメント作成（Phase 1）

| No | ドキュメント | ファイル | 説明 |
|----|-------------|----------|------|
| 1 | クイックスタート | `docs/user-guide/quick-start.md` | 5分で始めるガイド |
| 2 | コマンド一覧 | `docs/user-guide/commands-guide.md` | コマンド利用ガイド |

---

### Phase 2: 自動化強化（優先度: 中）

#### 2.5 Commands実装（Phase 2）

| No | コマンド | ファイル | 説明 |
|----|---------|----------|------|
| 5 | `/pm-auto-dev` | `.claude/commands/pm-auto-dev.md` | 自動開発フロー |
| 6 | `/bug-fix` | `.claude/commands/bug-fix.md` | バグ修正ワークフロー |
| 7 | `/refactoring` | `.claude/commands/refactoring.md` | リファクタリング実行 |
| 8 | `/acceptance-test` | `.claude/commands/acceptance-test.md` | 受け入れテスト |

#### 2.6 Agents実装（Phase 2）

| No | エージェント | ファイル | 用途 |
|----|-------------|----------|------|
| 3 | `investigation-agent` | `.claude/agents/investigation-agent.md` | バグ調査専門 |
| 4 | `acceptance-test-agent` | `.claude/agents/acceptance-test-agent.md` | 受け入れテスト |
| 5 | `refactoring-agent` | `.claude/agents/refactoring-agent.md` | リファクタリング |

#### 2.7 ドキュメント作成（Phase 2）

| No | ドキュメント | ファイル | 説明 |
|----|-------------|----------|------|
| 3 | エージェント一覧 | `docs/user-guide/agents-guide.md` | エージェント利用ガイド |
| 4 | ワークフロー例 | `docs/user-guide/workflow-examples.md` | 実践的な使用例 |

---

### Phase 3: 拡張機能（優先度: 低）

#### 2.8 Commands実装（Phase 3）

| No | コマンド | ファイル | 説明 |
|----|---------|----------|------|
| 9 | `/issue-create` | `.claude/commands/issue-create.md` | Issue一括作成 |
| 10 | `/issue-split` | `.claude/commands/issue-split.md` | Issue分割計画 |
| 11 | `/architecture-review` | `.claude/commands/architecture-review.md` | アーキテクチャレビュー |
| 12 | `/design-policy` | `.claude/commands/design-policy.md` | 設計方針策定 |

---

## 3. 詳細タスク一覧

### Phase 1 タスク

| # | タスク | 成果物 | 依存 |
|---|--------|--------|------|
| 1.1 | `.claude/` ディレクトリ構造作成 | ディレクトリ | - |
| 1.2 | `docs/user-guide/` ディレクトリ作成 | ディレクトリ | - |
| 1.3 | `/work-plan` コマンド実装 | `.claude/commands/work-plan.md` | 1.1 |
| 1.4 | `/create-pr` コマンド実装 | `.claude/commands/create-pr.md` | 1.1 |
| 1.5 | `/progress-report` コマンド実装 | `.claude/commands/progress-report.md` | 1.1 |
| 1.6 | `/tdd-impl` コマンド実装 | `.claude/commands/tdd-impl.md` | 1.1 |
| 1.7 | `tdd-impl-agent` 実装 | `.claude/agents/tdd-impl-agent.md` | 1.1 |
| 1.8 | `progress-report-agent` 実装 | `.claude/agents/progress-report-agent.md` | 1.1 |
| 1.9 | クイックスタートガイド作成 | `docs/user-guide/quick-start.md` | 1.2, 1.3-1.8 |
| 1.10 | コマンド利用ガイド作成 | `docs/user-guide/commands-guide.md` | 1.2, 1.3-1.6 |

### Phase 2 タスク

| # | タスク | 成果物 | 依存 |
|---|--------|--------|------|
| 2.1 | `/pm-auto-dev` コマンド実装 | `.claude/commands/pm-auto-dev.md` | Phase 1完了 |
| 2.2 | `/bug-fix` コマンド実装 | `.claude/commands/bug-fix.md` | Phase 1完了 |
| 2.3 | `/refactoring` コマンド実装 | `.claude/commands/refactoring.md` | Phase 1完了 |
| 2.4 | `/acceptance-test` コマンド実装 | `.claude/commands/acceptance-test.md` | Phase 1完了 |
| 2.5 | `investigation-agent` 実装 | `.claude/agents/investigation-agent.md` | Phase 1完了 |
| 2.6 | `acceptance-test-agent` 実装 | `.claude/agents/acceptance-test-agent.md` | Phase 1完了 |
| 2.7 | `refactoring-agent` 実装 | `.claude/agents/refactoring-agent.md` | Phase 1完了 |
| 2.8 | エージェント利用ガイド作成 | `docs/user-guide/agents-guide.md` | 2.5-2.7 |
| 2.9 | ワークフロー例ガイド作成 | `docs/user-guide/workflow-examples.md` | 2.1-2.7 |

### Phase 3 タスク

| # | タスク | 成果物 | 依存 |
|---|--------|--------|------|
| 3.1 | `/issue-create` コマンド実装 | `.claude/commands/issue-create.md` | Phase 2完了 |
| 3.2 | `/issue-split` コマンド実装 | `.claude/commands/issue-split.md` | Phase 2完了 |
| 3.3 | `/architecture-review` コマンド実装 | `.claude/commands/architecture-review.md` | Phase 2完了 |
| 3.4 | `/design-policy` コマンド実装 | `.claude/commands/design-policy.md` | Phase 2完了 |
| 3.5 | CLAUDE.mdへのリンク追加 | `CLAUDE.md` | 全Phase完了 |

---

## 4. 成果物チェックリスト

### Phase 1 成果物 (完了: 2025-12-05)

- [x] `.claude/commands/work-plan.md`
- [x] `.claude/commands/create-pr.md`
- [x] `.claude/commands/progress-report.md`
- [x] `.claude/commands/tdd-impl.md`
- [x] `.claude/agents/tdd-impl-agent.md`
- [x] `.claude/agents/progress-report-agent.md`
- [x] `.claude/prompts/tdd-impl-core.md` (追加)
- [x] `.claude/prompts/progress-report-core.md` (追加)
- [x] `docs/user-guide/quick-start.md`
- [x] `docs/user-guide/commands-guide.md`

### Phase 2 成果物 (完了: 2025-12-05)

- [x] `.claude/commands/pm-auto-dev.md`
- [x] `.claude/commands/bug-fix.md`
- [x] `.claude/commands/refactoring.md`
- [x] `.claude/commands/acceptance-test.md`
- [x] `.claude/agents/investigation-agent.md`
- [x] `.claude/agents/acceptance-test-agent.md`
- [x] `.claude/agents/refactoring-agent.md`
- [x] `.claude/prompts/refactoring-core.md` (追加)
- [x] `.claude/prompts/acceptance-test-core.md` (追加)
- [x] `docs/user-guide/agents-guide.md`
- [x] `docs/user-guide/workflow-examples.md`

### Phase 3 成果物 (完了: 2025-12-05)

- [x] `.claude/commands/issue-create.md`
- [x] `.claude/commands/issue-split.md`
- [x] `.claude/commands/architecture-review.md`
- [x] `.claude/commands/design-policy.md`
- [x] `CLAUDE.md` 更新

---

## 5. 技術仕様

### 5.1 Commandファイル形式

```markdown
---
model: opus
description: "コマンドの説明"
---

# コマンド名

## 概要
[コマンドの目的と機能]

## 入力
[必要な入力パラメータ]

## 出力
[生成される成果物]

## 手順
[実行手順]

## 使用例
[具体的な使用例]
```

### 5.2 Agentファイル形式

```markdown
---
model: opus
description: "エージェントの説明"
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
---

# エージェント名

## 役割
[エージェントの専門領域]

## 能力
[実行可能なタスク]

## 制約
[注意事項・制限]
```

### 5.3 品質基準

| 項目 | 基準 |
|------|------|
| コマンド動作確認 | 各コマンドが正常に実行可能 |
| エージェント動作確認 | 各エージェントが適切にタスク実行 |
| ドキュメント完備 | 全コマンド/エージェントの説明あり |
| 相互リンク | ドキュメント間の参照整備 |

---

## 6. 参考資料

### プロジェクト内

- `workspace/commands-agents-requirements.md` - 詳細要件定義
- `workspace/user-guide-work-plan.md` - ドキュメント作成計画
- `CLAUDE.md` - プロジェクトガイドライン

### 外部参照

- MySwiftAgent: `/Users/maenokota/share/work/github_kewton/MySwiftAgent/.claude/`

---

## 7. 次のステップ

1. この作業計画の承認を得る
2. Phase 1から順次実装を開始
3. 各Phaseの完了時にレビュー実施

---

## 8. 承認

この作業計画に基づき、実装を開始してよろしいでしょうか？

### 選択肢

1. **Phase 1から開始** → 基盤コマンド・エージェント・ドキュメント作成
2. **特定タスクのみ実施** → 指定したタスクのみ実行
3. **計画の修正** → 修正点を指摘
