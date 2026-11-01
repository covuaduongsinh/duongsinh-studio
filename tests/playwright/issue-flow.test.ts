import { expect, test } from '@playwright/test';

// The S1 journey in a real browser against a running application: sign in, create an issue from the New issue dialog,
// comment on it, and find it on the board. Run with the application's printed entry and an account that may create
// issues, for example:
//   APP_URL=http://127.0.0.1:13100/main E2E_USERNAME=nocobase E2E_PASSWORD=… pnpm test:e2e tests/playwright/issue-flow.test.ts
const applicationUrl = process.env.APP_URL?.replace(/\/$/, '');
const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;
test.skip(
  !applicationUrl || !username || !password,
  'Set APP_URL, E2E_USERNAME and E2E_PASSWORD to run against a running application.',
);

test('creates an issue, comments on it and finds it on the board', async ({
  page,
}) => {
  const title = `E2E issue ${Date.now()}`;
  const comment = `E2E comment ${Date.now()}`;

  await page.goto(`${applicationUrl}/login`);
  await page.getByLabel('Username or email').fill(String(username));
  await page.getByLabel('Password', { exact: true }).fill(String(password));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto(`${applicationUrl}/issues/new?tab=manual`);
  const dialog = page.getByRole('dialog', { name: 'New issue' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('radio', { name: /Later/ }).check();
  await dialog
    .getByRole('button', { name: /^Create/ })
    .last()
    .click();

  // Creating closes the dialog, announces the new identifier and lists the issue; its link opens the issue page.
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/created$/).first()).toBeVisible();
  await page
    .getByRole('link', { name: new RegExp(title) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/issues\/(?!new\b)[^/?]+$/);
  await expect(page.getByText(title).first()).toBeVisible();

  await page.getByRole('textbox', { name: 'Comment' }).click();
  await page.keyboard.type(comment);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByText(comment)).toBeVisible();

  await page.goto(`${applicationUrl}/issues?view=board`);
  await expect(page.getByText(title)).toBeVisible();
});
