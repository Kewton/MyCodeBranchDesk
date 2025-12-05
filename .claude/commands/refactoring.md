---
model: opus
description: "コード品質改善、設計パターン適用、技術的負債解消"
---

# リファクタリングスキル

## 概要
コード品質を改善し、SOLID原則に基づく設計パターンを適用して、技術的負債を解消するスキルです。

このスキルは**スラッシュコマンドモード**で動作します（ユーザーが直接実行）。

## 使用方法
- `/refactoring [対象ファイル/クラス]`
- 「[ファイル名]をリファクタリングしてください」
- 「コンポーネントを分割してください」

---

## 実行内容

**共通プロンプトを読み込んで実行します**:

```bash
cat .claude/prompts/refactoring-core.md
```

↑ **このプロンプトの内容に従って、リファクタリングを実行してください。**

---

## 動作モード

**スラッシュコマンドモード**:
- ユーザーから対話的に情報を取得
- リファクタリング対象、改善目標、適用パターンなどを確認
- コード品質分析を実行
- リファクタリングを段階的に適用
- 結果をターミナルに表示

---

## リファクタリング原則

- **SOLID**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **KISS**: Keep It Simple, Stupid
- **DRY**: Don't Repeat Yourself
- **YAGNI**: You Aren't Gonna Need It

---

## リファクタリングパターン

### メソッド抽出
長いメソッドを小さなメソッドに分割

### クラス抽出
大きなクラスを責任ごとに分割

### 重複コード削除
共通処理を関数/クラスに抽出

### 命名改善
意図を明確に表す命名に変更

### 設計パターン適用
- Repository Pattern
- Factory Pattern
- Strategy Pattern
- Dependency Injection

---

## 完了条件

以下をすべて満たすこと：
- すべてのテストが引き続き成功
- 品質メトリクスが改善（カバレッジ、複雑度）
- 静的解析エラーがゼロ
- コミットが完了

---

## 出力例

```
リファクタリング完了

## リファクタリング内容
- 長いメソッドの分割
- 重複コードの削除
- 命名の改善

## 品質メトリクス改善
| 指標 | Before | After | 改善 |
|------|--------|-------|------|
| Coverage | 75.0% | 85.0% | +10.0% |
| ESLint errors | 5 | 0 | -5 |
| TypeScript errors | 2 | 0 | -2 |

## ファイル変更
- src/lib/xxx.ts (リファクタリング)
- src/utils/helper.ts (新規)

## Commits
- abc1234: refactor(xxx): improve code quality
```

---

## サブエージェントモード

サブエージェントとして呼び出す場合は、PM Auto-Devが以下のように実行します：

```
Use refactoring-agent to improve code quality for Issue #166.
```

この場合、`.claude/agents/refactoring-agent.md` が使用されます。
