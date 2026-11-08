const { chromium } = require('D:/chatgpt/3dgongfang/studio/node_modules/playwright-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const state = JSON.parse(fs.readFileSync('D:/chatgpt/3dgongfang/runtime/acceptance-state.json', 'utf8'));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:3400/', { waitUntil: 'networkidle' });
    await page.locator('[data-auth="login"]').click();
    await page.getByPlaceholder('请输入注册手机号').fill(state.owner.phone);
    await page.getByPlaceholder('请输入密码', { exact: true }).fill(state.owner.password);
    await page.getByRole('button', { name: '登录', exact: true }).last().click();
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('user') || '{}').id);
    await page.goto('http://localhost:3400/dashboard', { waitUntil: 'networkidle' });
    await page.locator('input[name="name"]').fill('浏览器验收 ' + viewport.width);
    await page.locator('input[name="area"]').fill('56');
    await page.locator('input[name="budget"]').fill('15');
    await page.locator('textarea[name="needs"]').fill('验收测试，非真实用户项目');
    await page.locator('form').filter({ has: page.locator('input[name="name"]') }).locator('button[type="submit"],button:not([type])').last().click();
    await page.waitForURL(/\/project\/\d+/, { timeout: 20000 });
    const projectURL = page.url();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('浏览器验收 ' + viewport.width, { exact: false }).first().waitFor();
    await page.screenshot({ path: `D:/chatgpt/3dgongfang/output/browser-save-${viewport.width}.png`, fullPage: true });
    await page.goto(`http://localhost:3400/project/${state.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '俯视', exact: true }).first().click();
    await page.getByRole('button', { name: '透视', exact: true }).first().click();
    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: '导出 Blender / Pascal', exact: true }).click();
    const download = await downloadPromise;
    assert.ok(download.suggestedFilename().endsWith('.glb'));
    await download.saveAs(`D:/chatgpt/3dgongfang/output/scene-${viewport.width}.glb`);
    await page.screenshot({ path: `D:/chatgpt/3dgongfang/output/browser-design-${viewport.width}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    assert.equal(overflow, false, `horizontal overflow at ${viewport.width}`);
    assert.deepEqual(errors, []);
    report.push({ width: viewport.width, login: true, saveAndReload: true, views3D: true, exportGLB: true, overflow, errors });
    await context.close();
  }
  await browser.close();
  fs.writeFileSync('D:/chatgpt/3dgongfang/output/browser-acceptance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch(e => { console.error(e); process.exitCode = 1; });
