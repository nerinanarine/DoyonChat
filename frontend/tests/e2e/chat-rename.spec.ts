import { expect, test } from '@playwright/test';

// E2E 環境の Functions API（frontend/.env.local の VITE_API_URL と同値）。
const API_URL = 'http://localhost:7071/api';

/**
 * 会話名の変更がサイドバーの一覧に反映され、再読み込み後も保持されることを確認する。
 * 会話の作成は API で行い（LLM 呼び出しを避ける）、変更操作は UI で行う。
 */
test('会話名の変更が一覧に反映される', async ({ page, request }) => {
  const baseTitle = `e2e-rename-${Date.now()}`;
  const renamedTitle = `${baseTitle}-renamed`;

  const created = await request.post(`${API_URL}/conversations`, {
    data: { title: baseTitle },
  });
  expect(created.status()).toBe(201);
  const conversationId = (await created.json()).id as string;

  try {
    await page.goto('/');

    const row = page.locator('div.group').filter({ hasText: baseTitle });
    await expect(row).toBeVisible({ timeout: 30_000 });

    // 行メニューから名称変更を選ぶと編集入力へ切り替わる。
    await row.getByRole('button', { name: '会話メニュー' }).click();
    await page.getByRole('menuitem', { name: '名称変更' }).click();
    const editor = page.getByRole('textbox', { name: '会話タイトルを編集' });
    await expect(editor).toBeVisible();
    await editor.fill(renamedTitle);
    await editor.press('Enter');

    // 一覧に新しい名前が表示され、元の名前は消える。
    await expect(
      page.locator('div.group').filter({ hasText: renamedTitle }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('div.group').filter({ hasText: baseTitle })).toHaveCount(0);

    // 再読み込みしても一覧に反映されている（永続化）。
    await page.reload();
    await expect(
      page.locator('div.group').filter({ hasText: renamedTitle }),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await request.delete(`${API_URL}/conversations/${conversationId}`);
  }
});
