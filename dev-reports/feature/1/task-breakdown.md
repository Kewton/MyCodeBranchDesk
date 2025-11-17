# MyCodeBranchDesk タスクブレイクダウン

**作成日**: 2025年1月17日
**対象**: Phase 5以降の詳細タスク分解
**目的**: 実装の優先順位と依存関係の明確化

---

## 📋 タスク概要

### 完了済み（Phase 1-4）
- ✅ プロジェクト基盤
- ✅ データレイヤー
- ✅ Worktree管理
- ✅ tmux統合

### 未完了（Phase 5-12）
- ⏸️ API Routes実装
- ⏸️ WebSocket実装
- ⏸️ 認証・セキュリティ
- ⏸️ フロントエンド実装
- ⏸️ Integration/E2Eテスト
- ⏸️ 本番環境対応

---

## 🎯 Phase 5: API Routes実装

**優先度**: 🔴 高（バックエンドの中核）
**依存**: Phase 2, 3, 4完了
**所要時間**: 8-10時間
**TDDアプローチ**: テスト → 実装 → リファクタ

### 5.1 Worktree API実装 (2-3時間)

#### タスク 5.1.1: GET /api/worktrees
**目的**: Worktree一覧取得API

実装内容:
- [ ] テスト作成 (`tests/api/worktrees.test.ts`)
  - [ ] 空配列を返すケース
  - [ ] 複数worktreeのソート確認（updated_at DESC）
  - [ ] lastMessageSummary含まれることを確認
- [ ] APIルート実装 (`src/app/api/worktrees/route.ts`)
  - [ ] `getWorktrees(db)`を呼び出し
  - [ ] JSON形式でレスポンス
  - [ ] エラーハンドリング（500エラー）
- [ ] 統合テスト実行
- [ ] コードレビュー

**所要時間**: 1時間

---

#### タスク 5.1.2: GET /api/worktrees/:id
**目的**: Worktree詳細取得API

実装内容:
- [ ] テスト作成
  - [ ] 存在するIDで詳細取得
  - [ ] 存在しないIDで404エラー
  - [ ] 無効なIDで400エラー
- [ ] APIルート実装 (`src/app/api/worktrees/[id]/route.ts`)
  - [ ] パスパラメータ取得
  - [ ] `getWorktreeById(db, id)`呼び出し
  - [ ] 404/400エラーハンドリング
- [ ] 統合テスト実行
- [ ] コードレビュー

**所要時間**: 1時間

---

#### タスク 5.1.3: GET /api/worktrees/:id/messages
**目的**: チャット履歴取得API（ページネーション対応）

実装内容:
- [ ] テスト作成
  - [ ] メッセージ一覧取得（降順ソート確認）
  - [ ] ページネーション（before, limit）
  - [ ] 空配列を返すケース
  - [ ] worktree不存在で404
- [ ] APIルート実装 (`src/app/api/worktrees/[id]/messages/route.ts`)
  - [ ] クエリパラメータ解析（before, limit）
  - [ ] `getMessages(db, worktreeId, before, limit)`呼び出し
  - [ ] デフォルトlimit=50
  - [ ] エラーハンドリング
- [ ] 統合テスト実行
- [ ] コードレビュー

**所要時間**: 1.5時間

---

### 5.2 メッセージ送信API実装 (2-3時間)

#### タスク 5.2.1: POST /api/worktrees/:id/send
**目的**: Claudeへのメッセージ送信API

実装内容:
- [ ] リクエスト型定義 (`src/types/api.ts`)
  ```typescript
  interface SendMessageRequest {
    message: string;
  }

  interface SendMessageResponse {
    requestId: string;
    status: 'sent';
  }
  ```
- [ ] テスト作成
  - [ ] 正常系: メッセージ送信成功
  - [ ] バリデーションエラー（空メッセージ）
  - [ ] worktree不存在エラー
  - [ ] tmuxセッション起動確認
- [ ] APIルート実装
  - [ ] リクエストボディ検証（Zod使用推奨）
  - [ ] worktree存在確認
  - [ ] `ensureSession(sessionName, worktree.path)`
  - [ ] `sendKeys(sessionName, message)`
  - [ ] requestId生成（UUID）
  - [ ] ChatMessage DB保存（role: 'user'）
  - [ ] レスポンス返却
- [ ] エラーハンドリング
  - [ ] 400: バリデーションエラー
  - [ ] 404: worktree不存在
  - [ ] 500: tmux/DBエラー
- [ ] 統合テスト実行
- [ ] コードレビュー

**所要時間**: 2.5時間

---

### 5.3 Stopフック API実装 (3-4時間)

#### タスク 5.3.1: POST /api/hooks/claude-done
**目的**: Claude CLI完了通知受信とログ保存

実装内容:
- [ ] リクエスト型定義
  ```typescript
  interface ClaudeDoneRequest {
    worktreeId: string;
    requestId: string;
  }
  ```
- [ ] 差分抽出ロジック実装 (`src/lib/log-processor.ts`)
  - [ ] テスト作成
    - [ ] 新規出力のみ抽出
    - [ ] lastCapturedLineからの差分
    - [ ] 空出力の場合
  - [ ] 実装
    - [ ] `getSessionState(db, worktreeId)`で前回位置取得
    - [ ] `capturePane(sessionName)`で全出力取得
    - [ ] 差分行を抽出
    - [ ] 新しいlastCapturedLine計算
- [ ] Markdownログ保存ロジック (`src/lib/log-writer.ts`)
  - [ ] テスト作成
    - [ ] ファイル名生成（タイムスタンプ付き）
    - [ ] Markdown形式で保存
    - [ ] ディレクトリ自動作成
  - [ ] 実装
    - [ ] ログディレクトリパス: `{worktree.path}/.mcbd/logs/`
    - [ ] ファイル名形式: `YYYY-MM-DD_HH-mm-ss_{requestId}.md`
    - [ ] Markdown形式:
      ```markdown
      # Claude Response

      **Request ID**: {requestId}
      **Timestamp**: {timestamp}

      ## Output

      ```
      {captured output}
      ```
      ```
- [ ] APIルート実装 (`src/app/api/hooks/claude-done/route.ts`)
  - [ ] リクエスト検証
  - [ ] worktree/requestId確認
  - [ ] 差分抽出
  - [ ] Markdownログ保存
  - [ ] ChatMessage DB保存（role: 'claude'）
  - [ ] SessionState更新
  - [ ] WebSocket配信（Phase 6で実装）
- [ ] テスト
  - [ ] 正常系: ログ保存・DB更新成功
  - [ ] エラーケース各種
- [ ] 統合テスト実行
- [ ] コードレビュー

**所要時間**: 3.5時間

---

### 5.4 ログ関連API実装 (1-2時間)

#### タスク 5.4.1: GET /api/worktrees/:id/logs
**目的**: ログファイル一覧取得

実装内容:
- [ ] テスト作成
  - [ ] ログファイル一覧取得
  - [ ] 降順ソート確認
  - [ ] ディレクトリ不存在時は空配列
- [ ] APIルート実装
  - [ ] ログディレクトリ読み取り
  - [ ] ファイル一覧をタイムスタンプ降順でソート
  - [ ] メタデータ含む配列を返却
    ```typescript
    interface LogFile {
      fileName: string;
      timestamp: Date;
      requestId: string;
    }
    ```
- [ ] 統合テスト
- [ ] コードレビュー

**所要時間**: 1時間

---

#### タスク 5.4.2: GET /api/worktrees/:id/logs/:fileName
**目的**: ログファイル詳細取得

実装内容:
- [ ] テスト作成
  - [ ] ファイル内容取得成功
  - [ ] ファイル不存在で404
  - [ ] パストラバーサル攻撃防止確認
- [ ] APIルート実装
  - [ ] ファイル名検証（パストラバーサル防止）
  - [ ] ファイル存在確認
  - [ ] ファイル内容読み取り
  - [ ] Markdown形式でレスポンス
- [ ] セキュリティ確認
  - [ ] `../`等のパストラバーサル防止
  - [ ] ログディレクトリ外へのアクセス禁止
- [ ] 統合テスト
- [ ] コードレビュー

**所要時間**: 1時間

---

### Phase 5 完了条件
- [ ] 全APIエンドポイント実装完了
- [ ] テスト合格率100%（skipなし）
- [ ] エラーハンドリング網羅
- [ ] 型定義完備
- [ ] コードレビュー完了
- [ ] コミット・ドキュメント更新

---

## 🎯 Phase 6: WebSocket実装

**優先度**: 🔴 高（リアルタイム通信の中核）
**依存**: Phase 5完了
**所要時間**: 3-4時間
**TDDアプローチ**: 統合テストメイン

### 6.1 WebSocketサーバー実装 (2-3時間)

#### タスク 6.1.1: WebSocketサーバー基本実装
**目的**: ws ライブラリを使用したWebSocketサーバー構築

実装内容:
- [ ] 依存関係追加
  ```bash
  npm install ws
  npm install -D @types/ws
  ```
- [ ] WebSocketサーバー実装 (`src/lib/ws-server.ts`)
  ```typescript
  interface WebSocketServer {
    broadcast(worktreeId: string, message: any): void;
    handleConnection(ws: WebSocket, req: IncomingMessage): void;
    close(): void;
  }
  ```
- [ ] 機能実装
  - [ ] サーバー初期化
  - [ ] 接続管理（クライアント追跡）
  - [ ] Room/Channel管理（worktreeId別）
  - [ ] メッセージブロードキャスト
  - [ ] 切断処理
  - [ ] エラーハンドリング
- [ ] テスト作成
  - [ ] 接続・切断テスト
  - [ ] メッセージ送受信テスト
  - [ ] Room分離テスト
- [ ] 統合テスト実行
- [ ] コードレビュー

**所要時間**: 2.5時間

---

#### タスク 6.1.2: WebSocketエンドポイント統合
**目的**: Next.jsにWebSocketを統合

実装内容:
- [ ] カスタムサーバー設定 (`server.js`)
  ```javascript
  const { createServer } = require('http');
  const { parse } = require('url');
  const next = require('next');
  const { setupWebSocket } = require('./src/lib/ws-server');

  const dev = process.env.NODE_ENV !== 'production';
  const app = next({ dev });
  const handle = app.getRequestHandler();

  app.prepare().then(() => {
    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    });

    setupWebSocket(server);

    server.listen(3000, () => {
      console.log('> Ready on http://localhost:3000');
    });
  });
  ```
- [ ] package.json更新
  ```json
  "scripts": {
    "dev": "node server.js",
    "build": "next build",
    "start": "NODE_ENV=production node server.js"
  }
  ```
- [ ] WebSocket接続パス: `/ws`
- [ ] テスト
  - [ ] Next.jsアプリとWebSocketの共存確認
  - [ ] HMRとの互換性確認
- [ ] ドキュメント更新

**所要時間**: 1時間

---

### 6.2 クライアント側WebSocket実装 (1時間)

#### タスク 6.2.1: WebSocketクライアントフック
**目的**: React用WebSocket接続フック作成

実装内容:
- [ ] カスタムフック実装 (`src/hooks/useWebSocket.ts`)
  ```typescript
  function useWebSocket(worktreeId: string) {
    const [messages, setMessages] = useState<any[]>([]);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
      // WebSocket接続
      // メッセージ受信処理
      // 再接続ロジック
      // クリーンアップ
    }, [worktreeId]);

    return { messages, connected };
  }
  ```
- [ ] 機能実装
  - [ ] 自動接続/切断
  - [ ] 再接続ロジック（exponential backoff）
  - [ ] メッセージキュー管理
  - [ ] エラーハンドリング
- [ ] テスト作成
  - [ ] 接続・切断テスト
  - [ ] メッセージ受信テスト
  - [ ] 再接続テスト
- [ ] コードレビュー

**所要時間**: 1時間

---

### Phase 6 完了条件
- [ ] WebSocketサーバー稼働
- [ ] Room/Channel管理動作確認
- [ ] クライアント接続・メッセージ受信確認
- [ ] 再接続ロジック動作確認
- [ ] テスト合格
- [ ] コミット・ドキュメント更新

---

## 🎯 Phase 7: 認証・セキュリティ

**優先度**: 🟡 中（セキュリティ強化）
**依存**: Phase 5完了（Phase 6と並行可）
**所要時間**: 3-4時間
**TDDアプローチ**: ミドルウェアテスト

### 7.1 環境変数設定 (0.5時間)

#### タスク 7.1.1: 環境変数定義
**目的**: セキュリティ関連設定の環境変数化

実装内容:
- [ ] `.env.example`更新
  ```env
  # Server Configuration
  MCBD_ROOT_DIR=/path/to/root
  MCBD_PORT=3000
  MCBD_BIND=127.0.0.1

  # Security
  MCBD_AUTH_TOKEN=your-secret-token-here
  ```
- [ ] 環境変数型定義 (`src/lib/env.ts`)
  ```typescript
  interface Env {
    MCBD_ROOT_DIR: string;
    MCBD_PORT: number;
    MCBD_BIND: string;
    MCBD_AUTH_TOKEN?: string;
  }

  function getEnv(): Env;
  function validateEnv(): void;
  ```
- [ ] バリデーション実装
  - [ ] 必須変数チェック
  - [ ] 型変換・検証
  - [ ] デフォルト値設定
- [ ] テスト作成
- [ ] ドキュメント更新

**所要時間**: 0.5時間

---

### 7.2 認証ミドルウェア実装 (1.5時間)

#### タスク 7.2.1: Bearer Token認証
**目的**: API保護のための認証機構

実装内容:
- [ ] ミドルウェア実装 (`src/middleware.ts`)
  ```typescript
  export function middleware(request: NextRequest) {
    // Bearer token検証
    // 0.0.0.0バインド時は強制認証
    // 127.0.0.1バインド時は任意認証
  }

  export const config = {
    matcher: '/api/:path*',
  };
  ```
- [ ] 認証ロジック
  - [ ] Authorizationヘッダー取得
  - [ ] Bearer token抽出
  - [ ] トークン検証
  - [ ] バインドアドレス別の挙動
    - `0.0.0.0`: 認証必須
    - `127.0.0.1`: 認証任意（開発用）
- [ ] エラーレスポンス
  - [ ] 401 Unauthorized（トークン不正）
  - [ ] 403 Forbidden（トークン不在、0.0.0.0バインド時）
- [ ] テスト作成
  - [ ] 正常系: 正しいトークンで認証成功
  - [ ] 異常系: トークン不正/不在
  - [ ] バインドアドレス別の挙動確認
- [ ] 統合テスト
- [ ] コードレビュー

**所要時間**: 1.5時間

---

### 7.3 パス検証実装 (1時間)

#### タスク 7.3.1: ディレクトリトラバーサル防止
**目的**: rootディレクトリ外へのアクセス防止

実装内容:
- [ ] パス検証関数 (`src/lib/path-validator.ts`)
  ```typescript
  function validatePath(requestedPath: string, rootDir: string): boolean {
    const resolved = path.resolve(requestedPath);
    const root = path.resolve(rootDir);
    return resolved.startsWith(root);
  }
  ```
- [ ] 適用箇所
  - [ ] Worktree API（パス参照時）
  - [ ] ログAPI（ファイル読み取り時）
- [ ] テスト作成
  - [ ] 正常パス
  - [ ] `../`を含むパス
  - [ ] シンボリックリンク攻撃
  - [ ] 絶対パス指定
- [ ] セキュリティレビュー
- [ ] コードレビュー

**所要時間**: 1時間

---

### 7.4 セキュリティヘッダー設定 (0.5時間)

#### タスク 7.4.1: HTTPセキュリティヘッダー
**目的**: XSS、Clickjacking等の攻撃防止

実装内容:
- [ ] `next.config.js`更新
  ```javascript
  module.exports = {
    async headers() {
      return [
        {
          source: '/:path*',
          headers: [
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-XSS-Protection', value: '1; mode=block' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          ],
        },
      ];
    },
  };
  ```
- [ ] CSP設定（必要に応じて）
- [ ] テスト
  - [ ] ヘッダー付与確認
- [ ] ドキュメント更新

**所要時間**: 0.5時間

---

### Phase 7 完了条件
- [ ] 環境変数読み込み動作確認
- [ ] Bearer token認証動作確認
- [ ] パストラバーサル防止確認
- [ ] セキュリティヘッダー付与確認
- [ ] セキュリティレビュー完了
- [ ] テスト合格
- [ ] コミット・ドキュメント更新

---

## 🎯 Phase 8: Worktree一覧UI

**優先度**: 🟡 中（フロントエンド開始）
**依存**: Phase 5完了
**所要時間**: 4-5時間
**TDDアプローチ**: コンポーネントテスト

### 8.1 Worktree一覧ページ実装 (3-4時間)

#### タスク 8.1.1: Worktree一覧コンポーネント
**目的**: Worktree一覧表示UI

実装内容:
- [ ] ページコンポーネント (`src/app/page.tsx`)
- [ ] Worktree一覧取得
  - [ ] Server Component or Client Component検討
  - [ ] API呼び出し（`/api/worktrees`）
  - [ ] ローディング状態
  - [ ] エラーハンドリング
- [ ] Worktreeカードコンポーネント (`src/components/WorktreeCard.tsx`)
  ```typescript
  interface WorktreeCardProps {
    worktree: Worktree;
  }
  ```
  - [ ] worktree名表示
  - [ ] パス表示
  - [ ] 最後のメッセージ要約表示
  - [ ] 更新日時表示
  - [ ] クリックでチャット画面へ遷移
- [ ] スタイリング（Tailwind CSS）
  - [ ] レスポンシブデザイン
  - [ ] ホバー効果
  - [ ] カード配置（Grid or List）
- [ ] テスト作成
  - [ ] コンポーネントレンダリングテスト
  - [ ] データ表示確認
  - [ ] クリックイベントテスト
- [ ] コードレビュー

**所要時間**: 3時間

---

#### タスク 8.1.2: 空状態・エラー状態UI
**目的**: エッジケースのUX向上

実装内容:
- [ ] 空状態コンポーネント
  - [ ] worktree未検出時のメッセージ
  - [ ] セットアップガイドへのリンク
- [ ] エラー状態コンポーネント
  - [ ] API エラー表示
  - [ ] リトライボタン
- [ ] ローディングスケルトン
- [ ] テスト作成
- [ ] コードレビュー

**所要時間**: 1時間

---

### Phase 8 完了条件
- [ ] Worktree一覧表示動作確認
- [ ] クリックでチャット画面遷移確認
- [ ] レスポンシブデザイン確認
- [ ] エラーハンドリング確認
- [ ] テスト合格
- [ ] コミット・ドキュメント更新

---

## 🎯 Phase 9: チャットUI実装

**優先度**: 🟡 中（コア機能UI）
**依存**: Phase 5, 6, 8完了
**所要時間**: 6-8時間
**TDDアプローチ**: コンポーネント + E2Eテスト

### 9.1 チャット画面実装 (4-5時間)

#### タスク 9.1.1: チャット画面レイアウト
**目的**: チャットUIの基本構造

実装内容:
- [ ] ページコンポーネント (`src/app/worktrees/[id]/page.tsx`)
- [ ] レイアウト構成
  - [ ] ヘッダー（worktree名、パス表示）
  - [ ] メッセージ一覧（スクロール可能）
  - [ ] 入力フォーム（固定フッター）
- [ ] メッセージ一覧取得
  - [ ] API呼び出し（`/api/worktrees/:id/messages`）
  - [ ] 初期ロード
  - [ ] ページネーション（スクロール時に追加読み込み）
- [ ] スタイリング
  - [ ] レスポンシブデザイン
  - [ ] スクロール最下部への自動移動
- [ ] テスト作成
- [ ] コードレビュー

**所要時間**: 2時間

---

#### タスク 9.1.2: メッセージコンポーネント
**目的**: メッセージ表示コンポーネント

実装内容:
- [ ] メッセージコンポーネント (`src/components/Message.tsx`)
  ```typescript
  interface MessageProps {
    message: ChatMessage;
  }
  ```
- [ ] ユーザーメッセージ表示
  - [ ] 右寄せ
  - [ ] 背景色: 青系
  - [ ] テキスト表示
- [ ] Claudeメッセージ表示
  - [ ] 左寄せ
  - [ ] 背景色: グレー系
  - [ ] Markdownレンダリング（react-markdown）
  - [ ] シンタックスハイライト（react-syntax-highlighter）
- [ ] タイムスタンプ表示
- [ ] ログファイルリンク（Claudeメッセージのみ）
- [ ] スタイリング
- [ ] テスト作成
  - [ ] Markdownレンダリング確認
  - [ ] コードブロック表示確認
- [ ] コードレビュー

**所要時間**: 2.5時間

---

#### タスク 9.1.3: 入力フォーム実装
**目的**: メッセージ送信UI

実装内容:
- [ ] 入力フォームコンポーネント (`src/components/MessageInput.tsx`)
- [ ] 機能実装
  - [ ] テキストエリア（複数行対応）
  - [ ] 送信ボタン
  - [ ] Shift+Enterで送信
  - [ ] 送信中の状態管理（ボタン無効化）
- [ ] API呼び出し
  - [ ] POST `/api/worktrees/:id/send`
  - [ ] エラーハンドリング
  - [ ] 送信後にクリア
- [ ] バリデーション
  - [ ] 空メッセージ送信防止
  - [ ] 最大文字数制限（任意）
- [ ] スタイリング
- [ ] テスト作成
- [ ] コードレビュー

**所要時間**: 1.5時間

---

### 9.2 リアルタイム更新実装 (2-3時間)

#### タスク 9.2.1: WebSocket統合
**目的**: Claudeレスポンスのリアルタイム受信

実装内容:
- [ ] `useWebSocket`フック統合
  - [ ] チャット画面で接続
  - [ ] メッセージ受信時に一覧更新
  - [ ] 最下部へ自動スクロール
- [ ] 接続状態表示
  - [ ] 接続中/切断中インジケーター
- [ ] テスト作成
  - [ ] メッセージ受信テスト
  - [ ] 自動スクロールテスト
- [ ] 統合テスト
- [ ] コードレビュー

**所要時間**: 2時間

---

### Phase 9 完了条件
- [ ] チャット画面表示確認
- [ ] メッセージ送信動作確認
- [ ] Markdownレンダリング確認
- [ ] リアルタイム更新確認
- [ ] ページネーション動作確認
- [ ] テスト合格
- [ ] コミット・ドキュメント更新

---

## 🎯 Phase 10: ログビューアUI

**優先度**: 🟢 低（補助機能）
**依存**: Phase 5, 9完了
**所要時間**: 2-3時間
**TDDアプローチ**: コンポーネントテスト

### 10.1 ログ一覧・詳細UI (2-3時間)

#### タスク 10.1.1: ログ一覧モーダル
**目的**: ログファイル一覧表示

実装内容:
- [ ] モーダルコンポーネント (`src/components/LogListModal.tsx`)
- [ ] API呼び出し（`/api/worktrees/:id/logs`）
- [ ] ログファイル一覧表示
  - [ ] ファイル名
  - [ ] タイムスタンプ
  - [ ] クリックで詳細表示
- [ ] スタイリング
- [ ] テスト作成
- [ ] コードレビュー

**所要時間**: 1時間

---

#### タスク 10.1.2: ログ詳細表示
**目的**: ログファイル内容表示

実装内容:
- [ ] ログ詳細コンポーネント (`src/components/LogDetail.tsx`)
- [ ] API呼び出し（`/api/worktrees/:id/logs/:fileName`）
- [ ] Markdown表示
- [ ] コピーボタン
- [ ] スタイリング
- [ ] テスト作成
- [ ] コードレビュー

**所要時間**: 1時間

---

### Phase 10 完了条件
- [ ] ログ一覧表示確認
- [ ] ログ詳細表示確認
- [ ] Markdown表示確認
- [ ] テスト合格
- [ ] コミット・ドキュメント更新

---

## 🎯 Phase 11: Integration/E2Eテスト

**優先度**: 🔴 高（品質保証）
**依存**: Phase 5-10完了
**所要時間**: 6-8時間
**TDDアプローチ**: テストファースト不可（実装後）

### 11.1 Integrationテスト実装 (3-4時間)

#### タスク 11.1.1: Phase 3 Integrationテスト
**目的**: scanWorktrees の実テスト

実装内容:
- [ ] テストファイル作成 (`tests/integration/worktrees.integration.test.ts`)
- [ ] 実gitリポジトリ作成（テスト用）
- [ ] worktreeスキャンテスト
  - [ ] 実際のgit worktree listを実行
  - [ ] パース結果確認
  - [ ] パス解決確認
- [ ] エラーケーステスト
  - [ ] 非gitディレクトリ
  - [ ] アクセス権限エラー
- [ ] テスト実行
- [ ] コードレビュー

**所要時間**: 2時間

---

#### タスク 11.1.2: Phase 4 Integrationテスト
**目的**: tmux操作の実テスト

実装内容:
- [ ] テストファイル作成 (`tests/integration/tmux.integration.test.ts`)
- [ ] tmuxインストール確認（CI環境含む）
- [ ] セッション操作テスト
  - [ ] createSession → hasSession → killSession
  - [ ] sendKeys実行確認
  - [ ] capturePane出力確認
  - [ ] ensureSession冪等性確認
- [ ] エラーケーステスト
- [ ] テスト後クリーンアップ
- [ ] テスト実行
- [ ] コードレビュー

**所要時間**: 2時間

---

### 11.2 E2Eテスト実装 (3-4時間)

#### タスク 11.2.1: Playwright E2Eテスト
**目的**: エンドツーエンドのユーザーシナリオテスト

実装内容:
- [ ] テストシナリオ定義
  1. Worktree一覧表示
  2. Worktree選択
  3. メッセージ送信
  4. Claudeレスポンス受信（WebSocket）
  5. ログ表示
- [ ] テストファイル作成 (`tests/e2e/chat-flow.spec.ts`)
- [ ] テストデータ準備
  - [ ] テスト用gitリポジトリ
  - [ ] テスト用DB
  - [ ] モックClaude（tmux出力シミュレーション）
- [ ] テスト実装
  - [ ] ページ遷移テスト
  - [ ] フォーム入力テスト
  - [ ] WebSocket通信テスト
  - [ ] Markdown表示テスト
- [ ] CI/CD統合
  - [ ] GitHub Actions設定
  - [ ] テスト自動実行
- [ ] テスト実行
- [ ] コードレビュー

**所要時間**: 3.5時間

---

### Phase 11 完了条件
- [ ] Integration テスト実行成功
- [ ] E2Eテスト実行成功
- [ ] CI/CDパイプライン動作確認
- [ ] テストカバレッジ確認（目標: 80%+）
- [ ] コミット・ドキュメント更新

---

## 🎯 Phase 12: 本番環境対応

**優先度**: 🟡 中（デプロイ準備）
**依存**: Phase 11完了
**所要時間**: 4-5時間
**TDDアプローチ**: マニュアルテスト

### 12.1 環境構築ガイド作成 (2時間)

#### タスク 12.1.1: セットアップドキュメント
**目的**: ユーザー向けセットアップ手順

実装内容:
- [ ] `README.md`更新
  - [ ] プロジェクト概要
  - [ ] 必要要件（Node.js, tmux, git）
  - [ ] インストール手順
  - [ ] 設定手順（環境変数）
  - [ ] Claude CLIセットアップ
  - [ ] Stop hook設定
  - [ ] 起動手順
- [ ] `docs/SETUP.md`作成
  - [ ] 詳細セットアップ手順
  - [ ] トラブルシューティング
  - [ ] FAQ
- [ ] `docs/CLAUDE_INTEGRATION.md`作成
  - [ ] Claude CLI Stopフック詳細
  - [ ] 設定ファイル例
  - [ ] デバッグ方法
- [ ] ドキュメントレビュー

**所要時間**: 2時間

---

### 12.2 デプロイ手順整備 (1-2時間)

#### タスク 12.2.1: ビルド・デプロイ設定
**目的**: 本番環境デプロイの準備

実装内容:
- [ ] ビルドスクリプト最適化
  - [ ] `npm run build`動作確認
  - [ ] 静的アセット最適化
- [ ] `docs/DEPLOYMENT.md`作成
  - [ ] ローカルデプロイ手順
  - [ ] 環境変数設定
  - [ ] データベース初期化
  - [ ] tmux環境確認
- [ ] Dockerサポート（オプション）
  - [ ] `Dockerfile`作成
  - [ ] `docker-compose.yml`作成
  - [ ] Docker環境でのテスト
- [ ] ドキュメントレビュー

**所要時間**: 1.5時間

---

### 12.3 パフォーマンス最適化 (1-2時間)

#### タスク 12.3.1: 最適化実施
**目的**: アプリケーション性能向上

実装内容:
- [ ] Next.js最適化
  - [ ] 画像最適化（next/image）
  - [ ] フォント最適化
  - [ ] コード分割確認
- [ ] API最適化
  - [ ] DB クエリ最適化
  - [ ] レスポンスキャッシュ（必要に応じて）
- [ ] WebSocket最適化
  - [ ] 接続プーリング
  - [ ] メッセージバッチング（必要に応じて）
- [ ] パフォーマンステスト
  - [ ] Lighthouse実行
  - [ ] API レスポンスタイム計測
- [ ] ボトルネック特定・改善
- [ ] ドキュメント更新

**所要時間**: 1.5時間

---

### Phase 12 完了条件
- [ ] セットアップドキュメント完成
- [ ] デプロイ手順動作確認
- [ ] パフォーマンス目標達成
- [ ] 本番環境テスト完了
- [ ] コミット・ドキュメント更新

---

## 📊 全体タスクサマリー

### フェーズ別所要時間
| Phase | タスク数 | 所要時間 | 優先度 |
|-------|---------|---------|--------|
| Phase 5: API Routes | 8 | 8-10h | 🔴 高 |
| Phase 6: WebSocket | 3 | 3-4h | 🔴 高 |
| Phase 7: 認証 | 4 | 3-4h | 🟡 中 |
| Phase 8: Worktree一覧UI | 2 | 4-5h | 🟡 中 |
| Phase 9: チャットUI | 3 | 6-8h | 🟡 中 |
| Phase 10: ログUI | 2 | 2-3h | 🟢 低 |
| Phase 11: テスト | 3 | 6-8h | 🔴 高 |
| Phase 12: 本番対応 | 3 | 4-5h | 🟡 中 |

**合計**: 25タスク、36-47時間

---

## 🎯 推奨実装順序

### 優先順位1: バックエンドコア（必須）
1. Phase 5: API Routes
2. Phase 6: WebSocket
3. Phase 7: 認証・セキュリティ

**理由**: バックエンドが完成しないとフロントエンドが動作しない

### 優先順位2: フロントエンドコア（必須）
4. Phase 8: Worktree一覧UI
5. Phase 9: チャットUI

**理由**: ユーザーが実際に使用する画面

### 優先順位3: 補助機能（任意）
6. Phase 10: ログUI

**理由**: あると便利だが、なくても基本機能は動作

### 優先順位4: 品質保証（推奨）
7. Phase 11: Integration/E2Eテスト

**理由**: リリース前の品質確保

### 優先順位5: 運用準備（リリース前必須）
8. Phase 12: 本番環境対応

**理由**: デプロイ・ドキュメント整備

---

## 📝 タスク管理推奨

### GitHub Issues活用
各タスクをIssueとして登録:
- ラベル: `phase-5`, `api`, `frontend`, `test` 等
- マイルストーン: 各Phase
- Assignee: 担当者

### プロジェクトボード
- Backlog
- In Progress
- In Review
- Done

### ブランチ戦略
- `main`: 本番環境
- `develop`: 開発環境
- `feature/phase-5-api`: 機能別ブランチ

---

## ⚠️ リスクと対策

### リスク1: 所要時間超過
**対策**:
- 各タスクを小さく分割
- 定期的な進捗確認
- スコープ調整（Phase 10は後回し可）

### リスク2: 技術的困難
**対策**:
- 早期プロトタイピング
- 技術調査タスクの設定
- 代替案の準備

### リスク3: テスト不足
**対策**:
- TDD継続
- Phase 11を省略しない
- CIパイプライン早期構築

---

**最終更新**: 2025-01-17
**作成**: Claude Code
