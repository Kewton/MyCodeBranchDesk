# TDD実装コアプロンプト

このプロンプトは、スラッシュコマンドとサブエージェントの両方から実行されます。

---

## 入力情報の取得

### スラッシュコマンドモードの場合

ユーザーから対話的に以下の情報を取得してください：

```bash
# Issue情報を取得
gh issue view {issue_number} --json number,title,body
```

- Issue番号
- 受入条件（Acceptance Criteria）
- 実装タスク（Implementation Tasks）
- 目標カバレッジ（デフォルト: 80%）

### サブエージェントモードの場合

コンテキストファイルから情報を取得してください：

```bash
# 最新のコンテキストファイルを探す
CONTEXT_FILE=$(find dev-reports/issue/*/pm-auto-dev/iteration-*/tdd-context.json 2>/dev/null | sort -V | tail -1)

if [ -z "$CONTEXT_FILE" ]; then
    echo "Error: tdd-context.json not found"
    exit 1
fi

echo "Context file: $CONTEXT_FILE"
cat "$CONTEXT_FILE"
```

コンテキストファイル構造:
```json
{
  "issue_number": 166,
  "acceptance_criteria": [
    "新しいAPIエンドポイントが追加されること",
    "既存のテストが全てパスすること"
  ],
  "implementation_tasks": [
    "APIルート作成",
    "テスト追加"
  ],
  "target_coverage": 80
}
```

---

## TDD実装フロー

### Phase 1: Red - 失敗するテストを作成

受入条件に基づいてテストケースを設計します。

```bash
# テストファイル作成
mkdir -p tests/unit
```

例（TypeScript/Vitest）:
```typescript
// tests/unit/xxx.test.ts
import { describe, it, expect } from 'vitest'

describe('Feature XXX', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test'

    // Act
    const result = someFunction(input)

    // Assert
    expect(result).toBe('expected')
  })
})
```

**テストを実行して失敗を確認**:
```bash
npm run test:unit -- tests/unit/xxx.test.ts
```

---

### Phase 2: Green - 最小限の実装

テストを通すための最小限のコードを実装します。

**テストを実行して成功を確認**:
```bash
npm run test:unit -- tests/unit/xxx.test.ts
```

すべてのテストが通ることを確認してください。

---

### Phase 3: Refactor - コード整理

実装を改善します：

- 重複コードの削除
- 命名の改善
- コメントの追加
- 設計パターンの適用

**リファクタリング後もテストが通ることを確認**:
```bash
npm run test:unit -- tests/unit/xxx.test.ts
```

---

### Phase 4: Coverage Check

カバレッジを測定します：

```bash
npm run test:unit -- --coverage
```

目標カバレッジ（デフォルト80%）を達成しているか確認してください。

達成していない場合は、追加のテストケースを作成してください。

---

### Phase 5: Static Analysis

静的解析を実行してコード品質を確認します：

```bash
# ESLint
npm run lint

# TypeScript Type Check
npx tsc --noEmit
```

エラーが出た場合は修正してください。

---

### Phase 6: Commit

実装をコミットします：

```bash
git add .
git commit -m "$(cat <<'EOF'
feat(xxx): implement feature XXX

- Add tests for XXX functionality
- Implement XXX feature
- Coverage: 85%
- All static analysis checks passed

Resolves #166

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## 出力

### スラッシュコマンドモードの場合

ターミナルに結果を表示してください：

```
TDD実装完了

## 実装内容
- [実装した機能1]
- [実装した機能2]

## テスト結果
- Total: X tests
- Passed: X
- Failed: 0
- Coverage: XX%

## 静的解析
- ESLint: 0 errors
- TypeScript: 0 errors

## Commits
- abc1234: feat(xxx): implement feature XXX
```

### サブエージェントモードの場合

結果ファイルをJSON形式で作成してください：

```bash
# 結果ファイルパスを決定
RESULT_FILE=$(dirname "$CONTEXT_FILE")/tdd-result.json
```

Write toolで以下の内容を作成:

```json
{
  "status": "success",
  "coverage": 85.0,
  "unit_tests": {
    "total": 10,
    "passed": 10,
    "failed": 0
  },
  "static_analysis": {
    "eslint_errors": 0,
    "typescript_errors": 0
  },
  "files_changed": [
    "src/lib/xxx.ts",
    "tests/unit/xxx.test.ts"
  ],
  "commits": [
    "abc1234: feat(xxx): implement feature XXX"
  ],
  "message": "TDD実装完了。カバレッジ85%達成。"
}
```

**重要**: 結果ファイルが作成されたことを報告してください。

---

## エラーハンドリング

### テストが失敗した場合

```json
{
  "status": "failed",
  "error": "テストが失敗しました",
  "failed_tests": [
    "test_xxx: AssertionError: expected X but got Y"
  ],
  "message": "実装を修正してください"
}
```

### カバレッジ不足の場合

```json
{
  "status": "failed",
  "coverage": 65.0,
  "error": "目標カバレッジ80%に達していません（現在: 65.0%）",
  "message": "追加のテストケースが必要です"
}
```

### 静的解析エラーの場合

```json
{
  "status": "failed",
  "static_analysis": {
    "eslint_errors": 3,
    "typescript_errors": 1
  },
  "error": "静的解析エラーがあります",
  "message": "コードを修正してください"
}
```

---

## 完了条件

以下をすべて満たすこと：

- すべてのテストが成功
- カバレッジが目標値以上
- 静的解析エラーがゼロ
- コミットが完了（スラッシュコマンドモード）
- 結果ファイルが作成済み（サブエージェントモード）
