# 受入テストコアプロンプト

このプロンプトは、スラッシュコマンドとサブエージェントの両方から実行されます。

---

## 入力情報の取得

### スラッシュコマンドモードの場合

ユーザーから対話的に以下の情報を取得してください：

```bash
# Issue情報を取得
gh issue view {issue_number} --json number,title,body,labels
```

- Issue番号
- 機能概要（Feature Summary）
- 受入条件（Acceptance Criteria）
- テストシナリオ（Test Scenarios）

### サブエージェントモードの場合

コンテキストファイルから情報を取得してください：

```bash
# 最新のコンテキストファイルを探す
CONTEXT_FILE=$(find dev-reports/issue/*/pm-auto-dev/iteration-*/acceptance-context.json 2>/dev/null | sort -V | tail -1)

if [ -z "$CONTEXT_FILE" ]; then
    echo "Error: acceptance-context.json not found"
    exit 1
fi

echo "Context file: $CONTEXT_FILE"
cat "$CONTEXT_FILE"
```

コンテキストファイル構造:
```json
{
  "issue_number": 166,
  "feature_summary": "新機能の追加",
  "acceptance_criteria": [
    "条件1を満たしていること",
    "条件2を満たしていること"
  ],
  "test_scenarios": [
    "シナリオ1: 正常系のテスト",
    "シナリオ2: エラー系のテスト"
  ]
}
```

---

## 受入テスト実行フロー

### Phase 1: テストシナリオ作成

受入条件とテストシナリオに基づいて、結合テスト/E2Eテストを作成します。

```bash
# テストディレクトリ作成
mkdir -p tests/integration
```

例（TypeScript/Vitest）:
```typescript
// tests/integration/xxx.test.ts
import { describe, it, expect } from 'vitest'

describe('Feature: [機能名]', () => {
  it('シナリオ1: [シナリオ説明]', async () => {
    // Given: 前提条件
    const input = 'test'

    // When: 操作
    const result = await someFunction(input)

    // Then: 期待結果
    expect(result).toBe('expected')
  })

  it('シナリオ2: [シナリオ説明]', async () => {
    // Given / When / Then
  })
})
```

---

### Phase 2: テスト実行

結合テスト/E2Eテストを実行します：

```bash
npm run test:integration -- tests/integration/xxx.test.ts
```

すべてのテストが成功することを確認してください。

---

### Phase 3: エビデンス収集

テスト実行のエビデンスを収集します：

#### テスト結果ログ
```bash
npm run test:integration -- tests/integration/xxx.test.ts > test_results.log
```

#### スクリーンショット（E2Eテストの場合）
```bash
# Playwrightを使用している場合
npx playwright test --project=chromium --screenshot=on
```

---

### Phase 4: 受入条件の検証

すべての受入条件が満たされているか確認します：

```
受入条件1: 条件1を満たしていること
   → test_scenario_1: PASSED

受入条件2: 条件2を満たしていること
   → test_scenario_2: PASSED
```

---

## 出力

### スラッシュコマンドモードの場合

ターミナルに結果を表示してください：

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
- すべてのテストケース成功: 2/2

すべての受入条件を満たしています
```

### サブエージェントモードの場合

結果ファイルをJSON形式で作成してください：

```bash
RESULT_FILE=$(dirname "$CONTEXT_FILE")/acceptance-result.json
```

Write toolで以下の内容を作成:

```json
{
  "status": "passed",
  "test_cases": [
    {
      "scenario": "シナリオ1: 正常系のテスト",
      "result": "passed",
      "evidence": "test_scenario_1: PASSED"
    },
    {
      "scenario": "シナリオ2: エラー系のテスト",
      "result": "passed",
      "evidence": "test_scenario_2: PASSED"
    }
  ],
  "acceptance_criteria_status": [
    {
      "criterion": "条件1を満たしていること",
      "verified": true
    },
    {
      "criterion": "条件2を満たしていること",
      "verified": true
    }
  ],
  "evidence_files": [
    "test_results.log"
  ],
  "message": "すべての受入条件を満たしています"
}
```

**重要**: 結果ファイルが作成されたことを報告してください。

---

## エラーハンドリング

### テストが失敗した場合

```json
{
  "status": "failed",
  "test_cases": [
    {
      "scenario": "シナリオ1",
      "result": "passed",
      "evidence": "PASSED"
    },
    {
      "scenario": "シナリオ2",
      "result": "failed",
      "evidence": "AssertionError: expected X but got Y"
    }
  ],
  "error": "受入テストの一部が失敗しました",
  "message": "実装を修正してください"
}
```

### 受入条件が満たされていない場合

```json
{
  "status": "failed",
  "acceptance_criteria_status": [
    {
      "criterion": "条件1を満たしていること",
      "verified": true
    },
    {
      "criterion": "条件2を満たしていること",
      "verified": false
    }
  ],
  "error": "受入条件の一部が満たされていません",
  "message": "実装を見直してください"
}
```

---

## 完了条件

以下をすべて満たすこと：

- すべてのテストシナリオが成功
- すべての受入条件が検証済み
- エビデンスが収集済み
- 結果ファイルが作成済み（サブエージェントモード）
