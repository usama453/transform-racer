const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.text().includes('platform') || msg.text().includes('land') || msg.text().includes('Position')) {
      console.log(`[${msg.type()}]`, msg.text());
    }
  });
  page.on('pageerror', err => console.log('[ERROR]', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Check platform constants
  const platformInfo = await page.evaluate(() => {
    try {
      return {
        TOWER_PLATFORM: typeof TOWER_PLATFORM !== 'undefined' ? TOWER_PLATFORM : 'undefined',
        vehicle: {
          x: vehicle.position.x,
          y: vehicle.position.y,
          z: vehicle.position.z,
          mode: vehicle.mode
        }
      };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('PLATFORM INFO:', JSON.stringify(platformInfo, null, 2));

  // Teleport to tower and check
  await page.evaluate(() => {
    vehicle.position.set(285, 1714, 45);
    vehicle.velocity.set(0, -10, 0);
  });
  
  await page.waitForTimeout(500);
  
  const afterTeleport = await page.evaluate(() => {
    return {
      y: vehicle.position.y,
      velocityY: vehicle.velocity.y,
      mode: vehicle.mode
    };
  });
  console.log('AFTER TELEPORT:', JSON.stringify(afterTeleport, null, 2));

  await browser.close();
})();