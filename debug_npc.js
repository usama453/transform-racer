const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('console', msg => console.log(`[${msg.type()}]`, msg.text()));
  page.on('pageerror', err => console.log('[ERROR]', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check NPC jet state
  const state = await page.evaluate(() => {
    return {
      npcJets: typeof npcJets !== 'undefined' ? npcJets.length : 'undefined',
      jetModelTemplate: typeof jetModelTemplate !== 'undefined' ? (jetModelTemplate ? 'exists' : 'null') : 'undefined',
      TOWER_POS: typeof TOWER_POS !== 'undefined' ? `(${TOWER_POS.x}, ${TOWER_POS.y}, ${TOWER_POS.z})` : 'undefined'
    };
  });
  console.log('STATE:', JSON.stringify(state, null, 2));

  await browser.close();
})();