const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture all console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`[CONSOLE ${type}] ${text}`);
  });

  // Capture all page errors
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
    console.log(`  Stack: ${err.stack}`);
  });

  // Capture failed requests
  page.on('requestfailed', request => {
    console.log(`[REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`);
  });

  // Capture response status
  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`[HTTP ${response.status()}] ${response.url()}`);
    }
  });

  console.log('=== Loading game page ===');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 10000 });
  
  console.log('=== Waiting 3 seconds ===');
  await page.waitForTimeout(3000);

  // Check server status text
  const statusEl = await page.$('#server-status');
  if (statusEl) {
    const statusText = await statusEl.textContent();
    const statusClass = await statusEl.getAttribute('class');
    console.log(`[SERVER STATUS] text="${statusText}" class="${statusClass}"`);
  }

  // Check if window.__log exists
  const hasLogFn = await page.evaluate(() => typeof window.__log);
  console.log(`[WINDOW.__log] type: ${hasLogFn}`);

  // Check if THREE loaded
  const hasTHREE = await page.evaluate(() => {
    try {
      return typeof THREE !== 'undefined';
    } catch(e) {
      return 'error: ' + e.message;
    }
  });
  console.log(`[THREE] loaded: ${hasTHREE}`);

  await browser.close();
})();