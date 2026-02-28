# Architecture Review Report: Issue #376 - Stage 2 整合性レビュー

## 基本情報

| 項目 | 内容 |
|------|------|
| Issue | #376 |
| レビュー種別 | Stage 2: 整合性レビュー |
| フォーカス | 設計方針書と現行ソースコードの整合性 |
| 実施日 | 2026-02-28 |
| スコア | 7/10 |
| ステータス | conditionally_approved |

## レビュー対象

| ファイル | 役割 |
|---------|------|
| `src/app/proxy/[...path]/route.ts` | プロキシルートハンドラ（バグ修正対象） |
| `src/lib/proxy/handler.ts` | HTTP プロキシハンドラ（コメント更新対象） |
| `src/lib/proxy/config.ts` | プロキシ設定定数 |
| `src/lib/proxy/index.ts` | プロキシモジュールエクスポート |
| `src/lib/proxy/logger.ts` | プロキシログ出力（設計方針書で未考慮） |
| `tests/unit/proxy/handler.test.ts` | ハンドラ単体テスト |

## Executive Summary

設計方針書（Stage 1 指摘反映済み）と現行ソースコードを詳細に比較した結果、route.ts のパス構築ロジック修正と handler.ts のコメント更新に関しては設計方針書の記載と現行コードの差分が明確かつ正確であることを確認した。

しかし、設計方針書が **logger.ts への波及影響を見落としている** 重大な整合性問題を発見した。修正後に path が `/proxy/{pathPrefix}/...` 形式になることで、logger.ts 内で `/proxy/${pathPrefix}${path}` として結合されるログメッセージが二重プレフィックス（`/proxy/localllmtest/proxy/localllmtest/page`）になる。この問題はデバッグ・運用監視に直接影響するため、Must Fix として対応が必要である。

---

## 整合性比較表

### 1. route.ts: パス構築ロジック

| 設計項目 | 設計書の記載 | 実装状況（現行コード） | 差異 |
|---------|------------|---------|------|
| デストラクチャリング | `const [pathPrefix] = pathSegments;` に変更 | `const [pathPrefix, ...rest] = pathSegments;` (line 30) | 未実装（設計通り、修正前の状態） |
| path 構築 | `'/proxy/' + pathSegments.join('/')` | `'/' + rest.join('/')` (line 31) | 未実装（設計通り、修正前の状態） |
| pathPrefix の用途 | アプリ lookup 用として引き続き使用 | `cache.getByPathPrefix(pathPrefix)` (line 47) | 整合 |
| proxyHttp/proxyWebSocket 引数 | `path: string` のシグネチャ変更なし | `proxyHttp(request, app, path)` (line 83) | 整合 |

**判定**: 設計方針書と現行コードの差分は正確に記述されている。

### 2. handler.ts: コメント更新

| 設計項目 | 設計書の記載 | 実装状況（現行コード） | 差異 |
|---------|------------|---------|------|
| line 40 コメント | `Forward the full path including proxy prefix to the upstream` | `Strip the path prefix and forward to the upstream app's root` | 未更新（設計通り） |
| line 41 コメント | `Upstream apps must be configured with basePath: '/proxy/{pathPrefix}'` | `This allows upstream apps to work without special basePath configuration` | 未更新（設計通り） |
| buildUpstreamUrl ロジック | 変更不要 | `return \`http://${app.targetHost}:${app.targetPort}${path}\`` (line 42) | 整合 |
| proxyHttp @param path JSDoc | **未記載** | `@param path - The request path (after /proxy/{pathPrefix})` (line 50) | **設計漏れ** (SF2-003) |

**判定**: コアロジックは整合しているが、JSDoc の更新が設計方針書から漏れている。

### 3. logger.ts: 影響分析（設計方針書で未考慮）

| 設計項目 | 設計書の記載 | 実装状況（現行コード） | 差異 |
|---------|------------|---------|------|
| logProxyRequest メッセージ | **未記載（対象外扱い）** | `/proxy/${entry.pathPrefix}${entry.path}` (line 60) | **重大な設計漏れ** (SF2-001) |
| logProxyError メッセージ | **未記載（対象外扱い）** | `/proxy/${pathPrefix}${path}` (line 88) | **重大な設計漏れ** (SF2-001) |
| ProxyLogEntry.path JSDoc | **未記載** | `Request path (after /proxy/{pathPrefix})` (line 25) | **設計漏れ** (SF2-002) |

**判定**: 修正後に二重プレフィックス問題が発生する。設計方針書に logger.ts の変更を追記する必要がある。

### 4. テスト設計の整合性

| 設計項目 | 設計書の記載 | 実装状況（現行テスト） | 差異 |
|---------|------------|---------|------|
| buildUpstreamUrl 単体テスト | 変更不要 | 3テストケース（line 229-277） | 整合 |
| proxyHttp 'should construct correct upstream URL' | 変更不要 | path = `/nested/page?query=1` (line 158) | 整合（但し修正後の呼び出しパターン未カバー: SF2-005） |
| buildUpstreamUrl 新規テスト | pathPrefix 保持の動作確認テスト追加 | 未追加 | 未実装（設計通り） |
| route.test.ts 統合テスト | 3テストケース設計済み | ファイル未作成 | 未実装（設計通り） |
| ログ出力検証 | **未設計** | なし | **テスト設計漏れ** (SF2-004) |

---

## 詳細分析

### SF2-001: logger.ts 二重プレフィックス問題（Must Fix）

修正後のデータフローを追跡する。

```
ブラウザ: GET /proxy/localllmtest/page
  |
route.ts:
  pathSegments = ['localllmtest', 'page']
  pathPrefix = 'localllmtest'
  path = '/proxy/localllmtest/page'  (修正後)
  |
  +--> proxyHttp(request, app, '/proxy/localllmtest/page')
  |     |
  |     handler.ts:
  |       buildUpstreamUrl(app, '/proxy/localllmtest/page')
  |       => 'http://localhost:3012/proxy/localllmtest/page'  -- OK
  |
  +--> logEntry.path = '/proxy/localllmtest/page'
  |
  +--> logProxyRequest(logEntry)
        |
        logger.ts:
          message = `[Proxy] GET /proxy/${entry.pathPrefix}${entry.path}`
                  = `[Proxy] GET /proxy/localllmtest/proxy/localllmtest/page`  -- NG: 二重プレフィックス
```

同様に `logProxyError` も影響を受ける:
```
logger.ts line 88:
  `[Proxy] GET /proxy/${pathPrefix}${path}`
  = `[Proxy] GET /proxy/localllmtest/proxy/localllmtest/page`  -- NG
```

**推奨対応**: logger.ts の logProxyRequest / logProxyError で、path をそのまま使用するように変更する。

```typescript
// logProxyRequest (line 60) 変更前:
const message = `[Proxy] ${entry.method} /proxy/${entry.pathPrefix}${entry.path} -> ...`;

// logProxyRequest (line 60) 変更後:
const message = `[Proxy] ${entry.method} ${entry.path} -> ...`;
```

```typescript
// logProxyError (line 88) 変更前:
logger.error(`[Proxy] ${method} /proxy/${pathPrefix}${path} failed: ...`);

// logProxyError (line 88) 変更後:
logger.error(`[Proxy] ${method} ${path} failed: ...`);
```

### SF2-002: ProxyLogEntry.path JSDoc 不整合（Must Fix）

`src/lib/proxy/logger.ts` line 25:
```typescript
// 現行:
/** Request path (after /proxy/{pathPrefix}) */
path: string;

// 修正後の実態に合わせた更新:
/** Full request path forwarded to upstream (e.g., /proxy/{pathPrefix}/page) */
path: string;
```

### SF2-003: handler.ts proxyHttp/proxyWebSocket JSDoc 不整合（Should Fix）

`src/lib/proxy/handler.ts` line 50:
```typescript
// 現行:
@param path - The request path (after /proxy/{pathPrefix})

// 推奨:
@param path - The full request path including /proxy/{pathPrefix} prefix
```

同様に proxyWebSocket (line 140):
```typescript
// 現行:
@param path - The request path

// この記述は曖昧だが、修正後も問題にはならない。一貫性のために更新推奨:
@param path - The full request path including /proxy/{pathPrefix} prefix
```

### SF2-005: proxyHttp テストの呼び出しパターン乖離（Should Fix）

`tests/unit/proxy/handler.test.ts` line 146-166 の 'should construct correct upstream URL' テストでは、path 引数として `/nested/page?query=1` を渡している。修正後の route.ts は `/proxy/app-svelte/nested/page?query=1` 形式を渡すため、このテストは修正後の実際の呼び出しパターンを反映していない。

設計方針書では「proxyHttp 単体テストは引数として受け取った path をそのまま転送することを確認するもので、変更不要」と判断しているが、修正後のパターンでの動作確認テストを proxyHttp describe 内にも追加することで、より堅牢なテストカバレッジとなる。

---

## リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | logger.ts 二重プレフィックスによるログ可読性低下 | Medium | High | P1 |
| 運用リスク | 不正確なログメッセージによるデバッグ困難化 | Medium | High | P1 |
| 技術的リスク | JSDoc 不整合によるメンテナンス性低下 | Low | High | P2 |
| テストリスク | ログ出力形式の未検証によるリグレッション検出漏れ | Low | Medium | P2 |

---

## 受入条件の整合性評価

| 受入条件 | 設計方針書の実装計画との整合 | 判定 |
|---------|---------------------------|------|
| basePath 設定済みアプリにアクセスできる | route.ts のパス修正で対応 | OK |
| ヘルスチェックが正常に動作する | パス修正の副作用なし | OK |
| 既存のテストが通る | handler.test.ts の buildUpstreamUrl テストは影響なし | OK |
| 新規テストが追加されパスする | route.test.ts 3件 + handler.test.ts 1件が設計済み | OK |
| TypeScript エラーなし | SF1-001 で rest 変数除去により対応 | OK |
| ESLint エラーなし | SF1-001 で rest 変数除去により対応 | OK |

受入条件自体は設計方針書の変更内容と整合しているが、**ログ出力の正確性に関する受入条件が欠如している**。logger.ts 二重プレフィックス問題は受入条件では検出されない。

---

## 改善提案サマリー

### Must Fix (2件)

| ID | タイトル | 対象 |
|----|---------|------|
| SF2-001 | logger.ts のログメッセージ二重プレフィックス問題 | 設計方針書 + logger.ts |
| SF2-002 | ProxyLogEntry.path JSDoc 不整合 | logger.ts |

### Should Fix (3件)

| ID | タイトル | 対象 |
|----|---------|------|
| SF2-003 | handler.ts proxyHttp/proxyWebSocket @param path JSDoc 不整合 | 設計方針書 + handler.ts |
| SF2-004 | route.test.ts 統合テストにログ出力検証を追加 | 設計方針書 |
| SF2-005 | proxyHttp テストに修正後の呼び出しパターンを追加 | 設計方針書 + handler.test.ts |

---

## 結論

設計方針書の route.ts / handler.ts に対する修正方針は現行コードと正確に整合しており、Stage 1 の指摘事項も適切に反映されている。しかし、**logger.ts への波及影響が未考慮**であり、このまま実装すると運用ログに二重プレフィックスが出力される問題が発生する。SF2-001 / SF2-002 の Must Fix 対応後に実装を進めることを推奨する。

---

## レビュー履歴

| Stage | レビュー名 | 実施日 | スコア | ステータス |
|-------|-----------|--------|--------|-----------|
| 1 | 通常レビュー（設計原則） | 2026-02-28 | 8/10 | 指摘反映済み |
| 2 | 整合性レビュー | 2026-02-28 | 7/10 | conditionally_approved |
