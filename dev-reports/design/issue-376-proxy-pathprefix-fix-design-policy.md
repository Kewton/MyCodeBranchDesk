# 設計方針書: Issue #376 - External Apps プロキシ pathPrefix 保持修正

## 概要

External Apps のプロキシルートハンドラが `pathPrefix` を除去してupstreamに転送しているため、`basePath` を設定したアプリケーションに接続できず Bad Gateway エラーが発生する問題の修正。

---

## 問題分析

### 現状の動作フロー

```
ブラウザ:  GET /proxy/localllmtest/page
  ↓ catch-all route [...path] = ['localllmtest', 'page']
  ↓ pathPrefix除去: path = '/page'
upstream:  GET http://localhost:3012/page  ← 404（basePath設定済みアプリでは存在しないパス）
```

### 期待動作フロー（Issue #42設計準拠）

```
ブラウザ:  GET /proxy/localllmtest/page
  ↓ pathPrefix保持: path = '/proxy/localllmtest/page'
upstream:  GET http://localhost:3012/proxy/localllmtest/page  ← 200
```

### 根本原因

`src/app/proxy/[...path]/route.ts:31` のパス構築ロジック:

```typescript
// 現在（誤り）
const [pathPrefix, ...rest] = pathSegments;
const path = '/' + rest.join('/');  // pathPrefix を含まない

// 修正後（正しい）
const [pathPrefix] = pathSegments;  // rest変数は不要なため除去（SF1-001）
const path = '/proxy/' + pathSegments.join('/');  // pathPrefix を保持
```

---

## 設計方針

### 修正方針: 最小限の変更でバグを修正する

Issue #42 の設計書に従い、upstream アプリは `basePath: '/proxy/{pathPrefix}'` を設定することが前提。
プロキシは pathPrefix を含むフルパスを upstream に転送する。

### アーキテクチャ判断

#### route.ts の変更

- `path` の構築方法を変更: pathPrefix を除去せず `/proxy/{pathPrefix}/...` の形式で渡す
- `proxyHttp()` / `proxyWebSocket()` へのインターフェースは変更なし（引数 `path: string` のシグネチャを維持）
- `pathPrefix` 変数はアプリ lookup 用として引き続き使用

#### handler.ts の変更

- `buildUpstreamUrl()` のシグネチャ・コアロジックは変更不要
- コメント（line 40-41）を更新: 新しい動作を正確に記述する
- `proxyHttp()` / `proxyWebSocket()` の `@param path` JSDoc を更新: path がフルパスを含むことを明記（SF2-003）

#### logger.ts の変更（SF2-001 / SF2-002）

- `logProxyRequest()` / `logProxyError()` のメッセージ構築で `/proxy/${pathPrefix}` の手動結合を除去し、`path` をそのまま使用する
- `path` が既にフルパス（`/proxy/{pathPrefix}/...`）を含むため、再度プレフィックスを付加すると二重プレフィックスになる問題を修正
- `ProxyLogEntry.path` の JSDoc を更新: フルパスが格納されることを明記

#### 後方互換性への影響

- basePath 未設定のアプリ（ルート `/` で動作するアプリ）は動作が変わる
- 例: `/proxy/myapp/page` → 以前は `http://upstream/page`、修正後は `http://upstream/proxy/myapp/page`
- これは Issue #42 の意図した設計に合致しているため、破壊的変更ではなくバグ修正として扱う

---

## 修正対象ファイル

### 1. `src/app/proxy/[...path]/route.ts`

**変更箇所**: `handleProxy()` 内の path 構築ロジック（line 31）

```typescript
// 変更前
const [pathPrefix, ...rest] = pathSegments;
const path = '/' + rest.join('/');

// 変更後
const [pathPrefix] = pathSegments;  // rest変数は不要なため除去（SF1-001: ESLint no-unused-vars 対策）
const path = '/proxy/' + pathSegments.join('/');
```

> **SF1-001 (Must Fix)**: 修正後は `rest` 変数を使用しないため、デストラクチャリングから除去する。
> `const [pathPrefix, ...rest]` のままだと TypeScript strict モードおよび ESLint の `no-unused-vars` ルールに抵触し、CI が失敗する。

### 2. `src/lib/proxy/handler.ts`

**変更箇所**: `buildUpstreamUrl()` のコメント更新（line 40-41）

> **SF1-002 (Must Fix)**: コメントが修正後の動作（pathPrefix を保持して upstream に転送）と矛盾するため、以下の通り更新する。コメントとコードの不整合はメンテナンス性を著しく損なうため必須対応。

```typescript
// 変更前（line 40）
// Strip the path prefix and forward to the upstream app's root
// 変更前（line 41）
// This allows upstream apps to work without special basePath configuration

// 変更後（line 40）
// Forward the full path including proxy prefix to the upstream
// 変更後（line 41）
// Upstream apps must be configured with basePath: '/proxy/{pathPrefix}'
```

具体的な差分:
- line 40: `Strip the path prefix and forward to the upstream app's root` --> `Forward the full path including proxy prefix to the upstream`
- line 41: `This allows upstream apps to work without special basePath configuration` --> `Upstream apps must be configured with basePath: '/proxy/{pathPrefix}'`

**変更箇所2**: `proxyHttp()` の JSDoc `@param path` コメント更新（line 50 付近）

> **SF2-003 (Should Fix)**: `proxyHttp()` / `proxyWebSocket()` の `@param path` JSDoc が修正後の動作（path がフルパスを含む）と不整合になるため更新する。

```typescript
// 変更前
@param path - The request path (after /proxy/{pathPrefix})

// 変更後
@param path - The full request path including proxy prefix (e.g., /proxy/{pathPrefix}/page)
```

### 3. `src/lib/proxy/logger.ts`

**変更箇所1**: `logProxyRequest()` 内のログメッセージ構築（line 60）

> **SF2-001 (Must Fix)**: 修正後は `path` が `/proxy/{pathPrefix}/...` 形式のフルパスを含むため、ログメッセージで再度 `/proxy/${entry.pathPrefix}` を付加すると二重プレフィックスになる。`path` をそのまま使用するよう変更する。

```typescript
// 変更前（line 60）
`[Proxy] ${entry.method} /proxy/${entry.pathPrefix}${entry.path}`

// 変更後（line 60）
`[Proxy] ${entry.method} ${entry.path}`
```

**変更箇所2**: `logProxyError()` 内のログメッセージ構築（line 88）

```typescript
// 変更前（line 88）
`[Proxy] ${method} /proxy/${pathPrefix}${path}`

// 変更後（line 88）
`[Proxy] ${method} ${path}`
```

**変更箇所3**: `logProxyError()` の `@example` JSDoc 更新（line 79 付近）

> **SF3-001 (Must Fix)**: 修正後は `path` 引数が `/proxy/{pathPrefix}/...` 形式のフルパスを含むため、`@example` のサンプルコードも新しいパス形式に更新する。旧形式のままだと実装者が誤ったパス形式で呼び出すリスクがある。

```typescript
// 変更前
@example
logProxyError('app-svelte', 'GET', '/page', new Error('ECONNREFUSED'))

// 変更後
@example
logProxyError('app-svelte', 'GET', '/proxy/app-svelte/page', new Error('ECONNREFUSED'))
```

**変更箇所4**: `ProxyLogEntry` interface の `path` フィールド JSDoc 更新（line 25）

> **SF2-002 (Must Fix)**: `path` フィールドの JSDoc が修正後の仕様（フルパスが格納される）と不整合であるため更新する。

```typescript
// 変更前
/** Request path (after /proxy/{pathPrefix}) */
path: string;

// 変更後
/** Full request path including proxy prefix (e.g., /proxy/{pathPrefix}/page) */
path: string;
```

### 4. `tests/unit/proxy/logger.test.ts`

**変更箇所**: テストデータの `path` フィールドを修正後のフルパス形式に更新

> **SF3-002 (Must Fix)**: `logger.test.ts` の `'should format log message correctly'` テスト（line 131-150）が修正後のlogger.tsと不整合になりCIが失敗する。テストエントリの `path: '/api/data'` を `path: '/proxy/app-streamlit/api/data'` に変更する必要がある。期待値 `'POST /proxy/app-streamlit/api/data'` は、修正後のログ出力が `${entry.path}` をそのまま使用するため維持される（path引数に既にフルパスが入るため）。この変更を行わない場合、logger.ts 修正後にログ出力が `[Proxy] POST /api/data -> 201 (120ms)` となり、期待値 `'POST /proxy/app-streamlit/api/data'` と不一致となってCIが失敗する。

```typescript
// 変更前（line 138 付近）
const entry: ProxyLogEntry = {
  // ...
  path: '/api/data',
  // ...
};
// 期待値: expect.stringContaining('POST /proxy/app-streamlit/api/data')

// 変更後
const entry: ProxyLogEntry = {
  // ...
  path: '/proxy/app-streamlit/api/data',  // フルパス形式に更新
  // ...
};
// 期待値: expect.stringContaining('POST /proxy/app-streamlit/api/data')  // 維持（pathがフルパスになるため）
```

> **SF3-004 (Should Fix)**: 上記の `'should format log message correctly'` テスト以外にも、`logger.test.ts` 内の他のテストケース（line 54, 75, 94, 114, 159, 181, 201）の `entry.path` が旧形式（pathPrefix除去後）のまま残っている。テスト自体は `stringContaining` 等の緩いマッチにより動作するケースもあるが、テストデータが修正後の実際の利用パターンを反映しておらず、ドキュメントとしての価値が低下する。少なくとも主要テストケースの `path` を修正後のフルパス形式に更新し、テストの実用性を高めることを推奨する。

### 5. `tests/unit/proxy/handler.test.ts`

**変更箇所**: 既存テストの期待値を新動作に合わせて更新

- `'should construct correct upstream URL'` テスト: `/nested/page?query=1` を受け取る現在のテストは変更不要（`buildUpstreamUrl` はそのまま）
- `buildUpstreamUrl` の `describe` ブロック内コメントと期待値は現状の `path` 引数がそのまま渡ることを前提としているため変更不要

**コメント更新 (SF1-003)**: テストコード内のコメントも修正後の動作と整合させる

> **SF1-003 (Should Fix)**: 以下のテストコメントが旧動作（pathPrefix 除去）を記述しており、修正後の動作と不整合となる。DRY原則の一環としてドキュメントの一貫性を保つため更新する。

- line 160-161: `'buildUpstreamUrl strips the proxy prefix and forwards to upstream's root'` --> `'buildUpstreamUrl forwards the full path including proxy prefix to upstream'`
- line 230-231: 同様のコメント更新
- line 244: `'Path is forwarded directly to upstream without proxy prefix'` --> `'Path is forwarded directly to upstream including proxy prefix'`
- line 259: `'Query strings are preserved, proxy prefix is stripped'` --> `'Query strings are preserved with full proxy path'`

**追加テスト**: pathPrefix 保持の動作確認テスト

---

## テスト設計

### 新規テスト（handler.test.ts への追加）

```
buildUpstreamUrl describe内:
- 'should forward path including proxy prefix to upstream' - 修正後の動作確認
  - path = '/proxy/myapp/page' を渡した場合 → 'http://localhost:3012/proxy/myapp/page'
```

### 既存テスト更新方針

- `'should construct correct upstream URL'` (line 146-166): このテストは `proxyHttp` に渡す `path` 引数が `/nested/page?query=1` のまま（テストは `proxyHttp` のインターフェース検証）。`route.ts` の修正後、呼び出し側が正しいパスを渡すようになるが、`proxyHttp` 単体テストは引数として受け取った path をそのまま転送することを確認するもので、変更不要。

- `buildUpstreamUrl` テストの期待値は path 引数をそのまま受け取るロジックを確認する。route.ts が修正後に `/proxy/{pathPrefix}/...` 形式のパスを渡すようになるため、route.ts 統合テストでカバーする。

### 統合テスト（新規追加: tests/unit/proxy/route.test.ts）

```
handleProxy（モック使用）:
- 'should preserve pathPrefix when proxying to upstream'
  - GET /proxy/localllmtest/page → upstream に /proxy/localllmtest/page を渡す
- 'should handle root path with pathPrefix'
  - GET /proxy/myapp/ → upstream に /proxy/myapp/ を渡す
- 'should handle deep nested path with pathPrefix'
  - GET /proxy/app/a/b/c → upstream に /proxy/app/a/b/c を渡す
```

**ログ出力検証（SF2-004 追加）**:

> **SF2-004 (Should Fix)**: SF2-001 の二重プレフィックス問題がテストで検出されないリスクを防ぐため、ログ関数に渡される `ProxyLogEntry.path` の値を検証するテストケースを追加する。

```
- 'should pass correct path to logProxyRequest'
  - logProxyRequest のモックを追加
  - GET /proxy/localllmtest/page → logProxyRequest に渡される entry.path が '/proxy/localllmtest/page' であることを検証
  - expect(logProxyRequest).toHaveBeenCalledWith(expect.objectContaining({ path: '/proxy/localllmtest/page' }))
```

### proxyHttp 呼び出しパターン追加テスト（SF2-005）

> **SF2-005 (Should Fix)**: `handler.test.ts` の `proxyHttp` describe 内に、修正後の呼び出しパターン（path が `/proxy/{pathPrefix}/...` 形式）を使用するテストケースを追加する。これにより handler.ts が新しいパス形式を正しく upstream に転送することを直接検証できる。

```
proxyHttp describe 内:
- 'should correctly forward path with proxy prefix to upstream'
  - path = '/proxy/app-svelte/nested/page?query=1' を渡した場合
  - upstream への fetch URL が 'http://localhost:3012/proxy/app-svelte/nested/page?query=1' であることを検証
```

---

## セキュリティ考慮事項

- パストラバーサル: pathSegments は Next.js のルートハンドラが解析済みで安全
- `/proxy/` プレフィックスは固定文字列を結合するだけで、ユーザー入力をそのまま使用しない
- 変更前後でセキュリティリスクの変化なし

---

## セキュリティ評価（Stage 4レビュー結果）

### セキュリティ判定

**セキュリティ中立** -- 本修正は新たなセキュリティリスクを導入しない。修正はpath構築ロジック（1行）、ログメッセージ構築、JSDocコメントのみの変更であり、セキュリティに関わるコード（認証、バリデーション、ヘッダー処理、タイムアウト制御）には一切変更がない。

### OWASP Top 10 チェックリスト

| OWASP カテゴリ | ステータス | 詳細 |
|---------------|-----------|------|
| A01:2021 - Broken Access Control | PASS | middleware.tsによる認証チェック、IPアドレス制限がプロキシルートに適用。pathPrefixによるアプリ分離とDB完全一致検索による未登録アプリへのアクセス防止。 |
| A02:2021 - Cryptographic Failures | N/A | プロキシモジュール内では暗号処理を使用しない。 |
| A03:2021 - Injection | PASS | pathPrefixの正規表現バリデーション（英数字とハイフンのみ）、SQLパラメータバインド、固定文字列テンプレートによるURL構築。 |
| A04:2021 - Insecure Design | PASS | プロキシモジュールの責務分離（config/handler/logger/route）、純粋関数設計（buildUpstreamUrl）、バリデーション層の分離。 |
| A05:2021 - Security Misconfiguration | ADVISORY | SF4-001: route.tsの502エラーレスポンスにerror.messageを直接露出。改善推奨だが、ローカル開発ツールとしてのリスクは低い。 |
| A06:2021 - Vulnerable Components | N/A | プロキシモジュールはnative fetch APIを使用し、外部プロキシライブラリへの依存なし。 |
| A07:2021 - Auth Failures | PASS | middleware.tsの認証がプロキシルートを含む全パスに適用。WebSocketアップグレードリクエストも認証対象。 |
| A08:2021 - Software Integrity | N/A | プロキシモジュール内ではソフトウェアインテグリティに関する処理なし。 |
| A09:2021 - Logging/Monitoring | ADVISORY | SF4-002: logProxyError()でerror.stackをログに含めている。開発環境では有用だが、ログ転送環境では情報漏洩リスク。 |
| A10:2021 - SSRF | PASS | targetHostホワイトリスト、targetPort範囲制限、DB管理による静的設定でSSRF防御済み。 |

### 確認された防御層

1. **パストラバーサル防御**: Next.js catch-all route解析 + pathPrefix正規表現バリデーション(/^[a-zA-Z0-9-]+$/) + DB完全一致検索 + 固定プレフィックス結合
2. **SSRF防御**: targetHostのlocalhost/127.0.0.1ホワイトリスト + targetPortの1024-65535範囲制限 + httpプロトコル固定 + DB管理による静的設定
3. **ヘッダーインジェクション防御**: リクエスト/レスポンス双方向でhop-by-hopヘッダー除去（host, connection, keep-alive, transfer-encoding, te, trailer, upgrade）
4. **DoS防御**: AbortControllerによる30秒タイムアウト（PROXY_TIMEOUT.DEFAULT_MS = 30000）
5. **認証保護**: middleware.tsがプロキシルートを含む全パスに認証チェックを適用

---

## 受入条件

- [ ] `http://localhost:3000/proxy/{pathPrefix}/` 経由でbasePath設定済みアプリにアクセスできる
- [ ] ヘルスチェックが正常に動作する
- [ ] 既存のテストが通る
- [ ] 新規テストが追加されパスする
- [ ] TypeScript エラーなし（`npx tsc --noEmit`）
- [ ] ESLint エラーなし（`npm run lint`）

---

## 変更サマリー

| ファイル | 変更種別 | 変更規模 |
|---------|---------|---------|
| `src/app/proxy/[...path]/route.ts` | バグ修正 | 1行変更 |
| `src/lib/proxy/handler.ts` | コメント更新・JSDoc更新 | 小規模 |
| `src/lib/proxy/logger.ts` | ログ修正・JSDoc更新（@example含む） | 小規模 |
| `tests/unit/proxy/logger.test.ts` | テストデータ更新（path をフルパス形式に変更） | 小規模 |
| `tests/unit/proxy/handler.test.ts` | テスト更新・追加 | 小規模 |
| `tests/unit/proxy/route.test.ts` | 新規テスト追加 | 中規模 |

---

## レビュー履歴

| Stage | レビュー名 | 実施日 | スコア | ステータス |
|-------|-----------|--------|--------|-----------|
| 1 | 通常レビュー（設計原則） | 2026-02-28 | 8/10 | 指摘反映済み |
| 2 | 整合性レビュー | 2026-02-28 | 7/10 | 指摘反映済み |
| 3 | 影響分析レビュー | 2026-02-28 | 8/10 | 指摘反映済み |
| 4 | セキュリティレビュー | 2026-02-28 | 9/10 | 指摘反映済み（Must Fix: 0件、Should Fix: 3件 -- 全て将来課題として記録） |

---

## レビュー指摘事項サマリー

### Stage 1: 通常レビュー（設計原則: SOLID/KISS/YAGNI/DRY）

| ID | 種別 | タイトル | ステータス |
|----|------|---------|-----------|
| SF1-001 | Must Fix | 修正後に rest 変数が未使用となり ESLint エラーが発生する | 設計反映済み |
| SF1-002 | Must Fix | handler.ts のコメントが修正後の動作と不整合 | 設計反映済み |
| SF1-003 | Should Fix | handler.test.ts のコメントも修正後の動作に合わせて更新すべき | 設計反映済み |
| SF1-004 | Should Fix | route.ts 内の ProxyLogEntry 構築の構造的重複（DRY） | 将来課題として記録 |

### Stage 2: 整合性レビュー

| ID | 種別 | タイトル | ステータス |
|----|------|---------|-----------|
| SF2-001 | Must Fix | logger.ts のログメッセージ構築が修正後のパス形式と不整合（二重プレフィックス問題） | 設計反映済み |
| SF2-002 | Must Fix | ProxyLogEntry の path フィールド JSDoc が修正後の仕様と不整合 | 設計反映済み |
| SF2-003 | Should Fix | handler.ts の proxyHttp / proxyWebSocket の @param path JSDoc が修正後の動作と不整合 | 設計反映済み |
| SF2-004 | Should Fix | 新規 route.test.ts の統合テスト設計にログ出力検証が未含 | 設計反映済み |
| SF2-005 | Should Fix | handler.test.ts の proxyHttp describe 内に修正後の呼び出しパターンのテストが不足 | 設計反映済み |

### Stage 3: 影響分析レビュー

| ID | 種別 | タイトル | ステータス |
|----|------|---------|-----------|
| SF3-001 | Must Fix | logProxyError() の @example JSDoc が古いパス形式を示している | 設計反映済み |
| SF3-002 | Must Fix | logger.test.ts の 'should format log message correctly' テストが修正後に失敗する | 設計反映済み |
| SF3-003 | Should Fix | IProxyHandler インターフェースの JSDoc 不整合 | 将来課題として記録 |
| SF3-004 | Should Fix | logger.test.ts 全体のテストデータが旧形式パスを使用 | 設計反映済み |

### Stage 4: セキュリティレビュー（OWASP Top 10準拠）

| ID | 種別 | タイトル | OWASP カテゴリ | ステータス |
|----|------|---------|---------------|-----------|
| SF4-001 | Should Fix (Low) | 502エラーレスポンスにおけるerror.messageの直接露出（情報漏洩リスク） | A05:2021 - Security Misconfiguration | 将来課題として記録（既存問題、Issue #376スコープ外） |
| SF4-002 | Should Fix (Low) | logProxyError()でerror.stackをログ出力オブジェクトに含めている | A09:2021 - Security Logging and Monitoring Failures | 将来課題として記録（既存問題） |
| SF4-003 | Should Fix (Low) | WebSocket 426レスポンスにおける内部URL（directUrl）の露出 | A01:2021 - Broken Access Control | 将来課題として記録（既存問題、localhost限定のため実用リスク最小） |

### 良好な設計ポイント（Stage 4: セキュリティ）

- **GP4-001**: パストラバーサル攻撃に対する多層防御が機能している（Next.jsのcatch-all route解析、pathPrefixの正規表現バリデーション /^[a-zA-Z0-9-]+$/、DB完全一致検索、固定プレフィックス結合）
- **GP4-002**: SSRF（Server Side Request Forgery）に対する堅牢な防御が実装されている（targetHostのlocalhost/127.0.0.1ホワイトリスト、targetPortの1024-65535範囲制限、httpプロトコル固定、DB管理による静的設定）
- **GP4-003**: ヘッダーインジェクション防御としてリクエスト/レスポンス双方向でhop-by-hopヘッダーを適切に除去している
- **GP4-004**: AbortControllerによる30秒タイムアウト（PROXY_TIMEOUT.DEFAULT_MS）でDoS防御を実装済み
- **GP4-005**: middleware.tsの認証がプロキシルートを含む全パスに適用されており、IPアドレス制限も有効
- **GP4-006**: 修正によるセキュリティポスチャーの不変性を確認。セキュリティコード（認証、バリデーション、ヘッダー処理）への変更なし。新たな攻撃ベクターは生成されない
- **GP4-007**: ExternalApp登録時のpathPrefixバリデーション（PATH_PREFIX_PATTERN = /^[a-zA-Z0-9-]+$/）により、特殊文字経由のインジェクションが構造的に防止されている

### 良好な設計ポイント（Stage 3）

- 変更の影響範囲がproxyモジュール内（route.ts, handler.ts, logger.ts）に完全に閉じており、proxy以外のモジュール（middleware.ts, external-apps API, UIコンポーネント等）への直接的なコード変更が不要
- ExternalAppCard.tsx のproxyUrl構築はブラウザ側URL構築であり、proxy route handlerの内部パス処理とは独立しているため影響を受けない
- handler.tsのbuildUpstreamUrl()が純粋関数として設計されており、route.ts側のpath変更のみで転送先URLが正しくなるアーキテクチャは変更の局所化に成功している
- middleware.tsはproxy関連の特別な処理を持たず、通常のNext.jsルーティングとして/proxy/パスを通過させるため影響なし
- 設計方針書がStage 1, 2の全指摘を適切に反映しており、実装チェックリストが網羅的に整備されている

### 良好な設計ポイント（Stage 2）

- route.ts / handler.ts の修正内容は明確で、修正前コードと修正後コードの差分が正確に記述されている
- buildUpstreamUrl() が純粋関数であり、route.ts 側の修正だけで upstream への転送パスが正しくなるという設計判断は正確
- Stage 1 の指摘事項（SF1-001 / SF1-002 / SF1-003）が全て設計方針書に適切に反映されている
- handler.test.ts の既存テストにおける buildUpstreamUrl 単体テストが関数の独立性を確保した適切な設計
- 「後方互換性への影響」セクションで basePath 未設定アプリへの影響を明示的に記述し、Issue #42 の設計意図に基づくバグ修正として位置づけた判断は妥当
- 受入条件が TypeScript エラーなし・ESLint エラーなし・テストパスの3つの CI チェックを含んでおり適切

### 良好な設計ポイント（Stage 1）

- 修正方針が「最小限の変更でバグを修正する」という KISS 原則に忠実
- handler.ts の buildUpstreamUrl() は純粋関数として設計されており SRP を遵守
- プロキシモジュール全体の構成（config.ts / handler.ts / logger.ts / index.ts）が SRP に従って適切に分離
- handler.ts が config.ts から定数をインポートする設計は OCP に準拠
- route.ts の handleProxy() を共通化し、5つの HTTP メソッドハンドラが同一の処理フローを共有する設計は DRY 原則に合致
- ExternalApp インターフェースが適切に定義され ISP 準拠
- YAGNI 原則に従い不要な抽象化や過剰な設計を回避

---

## 実装チェックリスト

### Must Fix

- [ ] **SF1-001**: `route.ts` のデストラクチャリングを `const [pathPrefix] = pathSegments;` に変更（rest 変数を除去）
- [ ] **SF1-001**: 変更後に `npx tsc --noEmit` でエラーがないことを確認
- [ ] **SF1-001**: 変更後に `npm run lint` で ESLint エラーがないことを確認
- [ ] **SF1-002**: `handler.ts` line 40 のコメントを `// Forward the full path including proxy prefix to the upstream` に変更
- [ ] **SF1-002**: `handler.ts` line 41 のコメントを `// Upstream apps must be configured with basePath: '/proxy/{pathPrefix}'` に変更
- [ ] **SF2-001**: `logger.ts` の `logProxyRequest()` (line 60) のメッセージ構築を `${entry.path}` に変更（二重プレフィックス除去）
- [ ] **SF2-001**: `logger.ts` の `logProxyError()` (line 88) のメッセージ構築を `${path}` に変更（二重プレフィックス除去）
- [ ] **SF2-002**: `logger.ts` の `ProxyLogEntry.path` JSDoc を `Full request path including proxy prefix (e.g., /proxy/{pathPrefix}/page)` に更新
- [ ] **SF3-001**: `logger.ts` の `logProxyError()` `@example` JSDoc を更新（path引数を `'/proxy/app-svelte/page'` 形式に変更）
- [ ] **SF3-002**: `logger.test.ts` の `'should format log message correctly'` テストエントリの `path` を `'/proxy/app-streamlit/api/data'` に変更
- [ ] **SF3-002**: 変更後に `npm run test:unit` でテストがパスすることを確認（logger.ts 修正後に CI が失敗しないことの保証）

### Should Fix

- [ ] **SF1-003**: `handler.test.ts` line 160-161 のコメントを修正後の動作に合わせて更新
- [ ] **SF1-003**: `handler.test.ts` line 230-231 のコメントを修正後の動作に合わせて更新
- [ ] **SF1-003**: `handler.test.ts` line 244 のコメントを修正後の動作に合わせて更新
- [ ] **SF1-003**: `handler.test.ts` line 259 のコメントを修正後の動作に合わせて更新
- [ ] **SF2-003**: `handler.ts` の `proxyHttp()` / `proxyWebSocket()` の `@param path` JSDoc を `The full request path including proxy prefix (e.g., /proxy/{pathPrefix}/page)` に更新
- [ ] **SF2-004**: `route.test.ts` の統合テストにログ関数モック検証を追加（`logProxyRequest` に渡される `ProxyLogEntry.path` の値が期待形式であることを確認）
- [ ] **SF2-005**: `handler.test.ts` の `proxyHttp` describe 内に修正後の呼び出しパターン（path = `/proxy/{pathPrefix}/...` 形式）のテストケースを追加
- [ ] **SF3-004**: `logger.test.ts` の主要テストケース（line 54, 75, 94, 114, 159, 181, 201）の `entry.path` を修正後のフルパス形式（`/proxy/{pathPrefix}/...`）に更新し、テストデータが実際の利用パターンを反映するようにする

### 基本項目

- [ ] `route.ts` の path 構築ロジックを修正（line 31）
- [ ] `handler.ts` のコメントを更新（line 40-41）
- [ ] `handler.ts` の JSDoc を更新（@param path）
- [ ] `logger.ts` のログメッセージ構築を修正（二重プレフィックス除去）
- [ ] `logger.ts` の JSDoc を更新（ProxyLogEntry.path）
- [ ] `logger.test.ts` のテストデータを修正後のフルパス形式に更新
- [ ] `handler.test.ts` に新規テストを追加
- [ ] `route.test.ts` に統合テストを新規追加（ログ検証含む）
- [ ] 全テストがパスすることを確認（`npm run test:unit`）
- [ ] TypeScript エラーなし（`npx tsc --noEmit`）
- [ ] ESLint エラーなし（`npm run lint`）

---

## 将来課題

### SF1-004: ProxyLogEntry 構築の構造的重複（DRY 改善）

> **優先度**: Low（Issue #376 スコープ外、後続リファクタリングとして対応）

**問題**: `route.ts` の `handleProxy()` 内で WebSocket 用（lines 68-77）と HTTP 用（lines 86-98）の `ProxyLogEntry` 構築が重複している。共通フィールド（timestamp, pathPrefix, method, path, responseTime）が同一パターンで記述されており、`isWebSocket` と `error` フィールドのみが異なる。

**推奨対応**: ヘルパー関数 `createLogEntry(pathPrefix, method, path, startTime, isWebSocket)` を `handleProxy()` 内またはモジュールスコープに抽出し、DRY 原則を適用する。

**対応方針**: Issue #376 のスコープは最小限のバグ修正であるため、この改善は後続リファクタリングとして別 Issue で対応する。現時点では2箇所の重複であり小規模だが、将来のメソッド追加時に同じパターンが増殖するリスクがあるため記録しておく。

### SF4-001: 502エラーレスポンスにおけるerror.messageの直接露出（情報漏洩リスク）

> **優先度**: Low（既存問題、Issue #376 スコープ外）
> **OWASP カテゴリ**: A05:2021 - Security Misconfiguration

**問題**: `route.ts` line 107 で、catch ブロック内のエラーレスポンスに `(error as Error).message` をそのまま返却している。これにより、upstream サーバーの接続エラー詳細（ホスト名、ポート番号、接続エラーの種類等）がクライアントに露出する可能性がある。例: `'connect ECONNREFUSED 127.0.0.1:3012'` のようなメッセージが返却される。

**推奨対応**: エラーレスポンスのメッセージを汎用的な文字列（例: `'Unable to connect to upstream application'`）に置換する。詳細なエラー情報は `logProxyError()` 経由でサーバーサイドログに既に記録されているため、クライアントには汎用メッセージで十分である。`handler.ts` 内の `proxyHttp()` は既に `PROXY_ERROR_MESSAGES` 定数を使用して汎用メッセージを返却しており、`route.ts` の catch ブロックも同様のパターンに統一すべきである。

**未対応時のリスク**: 攻撃者がエラーメッセージから内部ネットワーク構成（localhost:ポート番号）を推測可能。ただし、targetHost が localhost/127.0.0.1 に制限されているため、実質的な攻撃面は限定的。

### SF4-002: logProxyError() で error.stack をログ出力オブジェクトに含めている

> **優先度**: Low（既存問題、Issue #376 スコープ外）
> **OWASP カテゴリ**: A09:2021 - Security Logging and Monitoring Failures

**問題**: `logger.ts` line 93 で、`logProxyError()` が `error.stack` をログエントリに含めている。スタックトレースには内部のファイルパス、モジュール構造、依存ライブラリのバージョン情報が含まれる可能性がある。ログが外部に転送される環境（集約ログサービス等）では情報漏洩リスクとなる。

**推奨対応**: 本番環境ではスタックトレースをログに含めないよう、`process.env.NODE_ENV === 'development' ? error.stack : undefined` のような条件分岐を導入する。開発環境でのみデバッグ情報を出力し、本番環境では `error.message` のみで十分なトラブルシューティングが可能。

**未対応時のリスク**: ログが外部サービスに転送される場合に、内部実装詳細が漏洩する可能性。CommandMate のユースケース（ローカル開発ツール）では実質的なリスクは極めて低い。

### SF4-003: WebSocket 426レスポンスにおける内部URL（directUrl）の露出

> **優先度**: Low（既存問題、Issue #376 スコープ外、localhost限定のため実用リスク最小）
> **OWASP カテゴリ**: A01:2021 - Broken Access Control

**問題**: `handler.ts` line 150-157 で、`proxyWebSocket()` が 426 レスポンスに `directWsUrl`（`ws://localhost:PORT/path` 形式）を含めて返却している。これにより、upstream アプリケーションの内部ホストとポート番号がクライアントに直接露出する。Issue #376 の修正（pathPrefix 保持）により、`directWsUrl` に含まれるパスが変わるが、ホスト:ポート情報の露出自体は修正前後で変わらない。

**推奨対応**: WebSocket の直接接続先を案内するという設計意図は理解できるが、内部ネットワーク情報の露出は最小限にすべきである。レスポンスから `directWsUrl` を除去するか、相対パスのみを返却する方式を検討する。

**未対応時のリスク**: 内部ポート番号の露出。ローカル環境限定のため実質リスクは極めて低い。

### SF3-003: IProxyHandler インターフェースの JSDoc 更新（interfaces.ts）

> **優先度**: Low（Issue #376 スコープ外、後続対応として推奨）

**問題**: `src/lib/external-apps/interfaces.ts` line 86 の `IProxyHandler.proxyHttp()` の JSDoc `@param path - Request path (after removing /proxy/{pathPrefix})` が、修正後の仕様（path がフルパス `/proxy/{pathPrefix}/...` 形式を含む）と不整合になる。`interfaces.ts` は直接変更されるファイルではないが、`proxyHttp()` の `path` 引数の意味が変わるため、インターフェース定義側のドキュメントも更新すべきである。

**推奨対応**: `@param path` の JSDoc を `@param path - The full request path including proxy prefix (e.g., /proxy/{pathPrefix}/page)` に更新する。同様に `proxyWebSocket()` の `@param path` も更新する。

**対応方針**: Issue #376 のスコープは proxy route handler 内のバグ修正であり、interfaces.ts はインターフェース定義のみで実装に影響しない。ただし、ドキュメントの一貫性を維持するため、本修正と同一 PR 内での対応を推奨する。対応しない場合でも動作上の問題はない。

---

## 関連Issue

- Issue #376: 本バグ修正
- Issue #42: External Apps プロキシ機能の元設計
