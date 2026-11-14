import { expect, test } from '@playwright/test';

/**
 * 新規会話の作成 → ping 送信 → アシスタントの応答本文表示までを確認する。
 * 外部起動済みの frontend (localhost:5173) と API を対象にする。
 */
test('新規会話で ping を送信すると応答本文が表示される', async ({ page, request }) => {
  await page.goto('/');

  const input = page.getByPlaceholder('メッセージを入力');
  // 起動中表示（P2-018）が終わるまで入力欄は無効。
  await expect(input).toBeEnabled({ timeout: 90_000 });

  await page.getByRole('button', { name: '新規チャット' }).click();
  await input.fill('ping');

  // 新規会話は最初の送信時に作成される。後片付け用に作成レスポンスから id を取得する。
  const createdResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/conversations'),
  );
  await input.press('Enter');
  const created = await createdResponse;
  const conversationId = (await created.json()).id as string;

  // メッセージ一覧（ヘッダーの会話名と区別するためメイン列のスクロール領域に限定）。
  const messages = page.locator('div.min-h-0.overflow-hidden > div.overflow-y-auto');

  try {
    await expect(messages.getByText('ping', { exact: true })).toBeVisible({ timeout: 30_000 });

    // ストリーミング中は停止ボタンが表示され、完了すると消える。
    const stopButton = page.getByTitle('停止');
    await expect(stopButton).toBeVisible({ timeout: 30_000 });
    await expect(stopButton).toBeHidden({ timeout: 120_000 });

    // アシスタントの応答本文が空でないこと（本文の値自体は検証しない）。
    const assistantBody = messages.locator(
      'div.flex.gap-3.px-4.py-5.bg-gray-50 div.text-gray-800',
    );
    await expect(assistantBody.last()).toBeVisible({ timeout: 30_000 });
    await expect(assistantBody.last()).not.toBeEmpty();
  } finally {
    await request.delete(`${created.url()}/${conversationId}`);
  }
});
