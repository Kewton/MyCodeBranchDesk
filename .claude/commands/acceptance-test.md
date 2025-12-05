---
model: opus
description: "Issue要件に基づく自動受入テスト実行"
---

# 受入テストスキル

## 概要
Issue要件に基づいて受入テスト（Acceptance Test）を自動実行し、すべての受入条件が満たされていることを検証するスキルです。

このスキルは**スラッシュコマンドモード**で動作します（ユーザーが直接実行）。

## 使用方法
- `/acceptance-test [Issue番号]`
- 「Issue #[番号]の受入テストを実行してください」
- 「[機能名]の受入条件を検証してください」

---

## 実行内容

**共通プロンプトを読み込んで実行します**:

```bash
cat .claude/prompts/acceptance-test-core.md
```

↑ **このプロンプトの内容に従って、受入テストを実行してください。**

---

## 動作モード

**スラッシュコマンドモード**:
- ユーザーから対話的に情報を取得
- Issue番号、受入条件、テストシナリオなどを確認
- 結合テスト/E2Eテストを実行
- 結果をターミナルに表示

---

## テストシナリオ作成

受入条件に基づいてテストシナリオを作成：

```typescript
// tests/integration/xxx.test.ts
import { describe, it, expect } from 'vitest'

describe('Feature: [機能名]', () => {
  it('シナリオ1: [シナリオ説明]', async () => {
    // Given: 前提条件
    // When: 操作
    // Then: 期待結果
  })
})
```

---

## 完了条件

以下をすべて満たすこと：
- すべてのテストシナリオが成功
- すべての受入条件が検証済み
- エビデンスが収集済み（ログ、スクリーンショットなど）

---

## 出力例

```
受入テスト完了

## 機能概要
新機能の追加

## テストシナリオ結果
シナリオ1: 正常系のテスト
   - test_scenario_1: PASSED

シナリオ2: エラー系のテスト
   - test_scenario_2: PASSED

## 受入条件検証
- 条件1を満たしていること
- 条件2を満たしていること

## エビデンス
- テスト結果ログ: test_results.log
- すべてのテストケース成功: 5/5

すべての受入条件を満たしています
```

---

## サブエージェントモード

サブエージェントとして呼び出す場合は、PM Auto-Devが以下のように実行します：

```
Use acceptance-test-agent to verify Issue #166 acceptance criteria.
```

この場合、`.claude/agents/acceptance-test-agent.md` が使用されます。
