---
name: rebuild
description: サーバーをリビルドして再起動する。「リビルド」「再起動」「サービス再起動」「本番環境を再起動」「ビルドして起動」などの指示で使用する。
allowed-tools: Bash(./scripts/*)
---

# Rebuild

サーバーを停止し、ビルドしてバックグラウンドで再起動します。

## 実行手順

1. サーバー停止: `./scripts/stop.sh`
2. ビルドと再起動: `./scripts/build-and-start.sh --daemon`

## 完了報告形式

```
✅ サーバー再起動完了！

📋 サーバー情報:
  PID:  [プロセスID]
  URL:  http://localhost:3000
  ログ: logs/server.log

🔧 操作コマンド:
  ログ確認: tail -f logs/server.log
  停止:     ./scripts/stop.sh
```
