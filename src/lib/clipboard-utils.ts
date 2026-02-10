import { stripAnsi } from '@/lib/cli-patterns';

/**
 * テキストをクリップボードにコピーする
 *
 * ANSIエスケープコードを除去してからコピーを実行します。
 *
 * @param text - コピー対象のテキスト
 * @throws Error - Clipboard APIが失敗した場合
 *
 * @remarks
 * - 空文字列または空白文字のみの入力は無視されます（早期リターン）
 * - stripAnsi() の既知の制限（SEC-002）: 8-bit CSI、DEC private modes、
 *   character set switching、一部のRGB color形式はサポートされていません。
 *   詳細は src/lib/cli-patterns.ts の ANSI_PATTERN を参照してください。
 */
export async function copyToClipboard(text: string): Promise<void> {
  // SF-S4-1: 空文字/空白文字バリデーション
  if (!text || text.trim().length === 0) {
    return;
  }

  const cleanText = stripAnsi(text);
  await navigator.clipboard.writeText(cleanText);
}
