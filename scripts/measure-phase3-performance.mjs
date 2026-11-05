import path from 'node:path';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('.local/browsers');
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const samples = [];
try {
  for (const width of [1440, 390]) {
    for (let sample = 1; sample <= 2; sample++) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 100,
        downloadThroughput: 200000,
        uploadThroughput: 75000,
        connectionType: 'cellular3g',
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const start = performance.now();
      await page.goto('http://127.0.0.1:3100/demo', { waitUntil: 'commit' });
      await page.locator('h1').waitFor({ state: 'visible' });
      const headingVisibleMs = performance.now() - start;
      await page.waitForLoadState('networkidle');
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const scripts = performance
          .getEntriesByType('resource')
          .filter((r) => /\.js(?:\?|$)/.test(r.name));
        return {
          domContentLoadedMs: nav.domContentLoadedEventEnd,
          scriptRequests: scripts.length,
          jsTransferBytes: scripts.reduce((sum, r) => sum + r.transferSize, 0),
          jsEncodedBodyBytes: scripts.reduce((sum, r) => sum + r.encodedBodySize, 0),
        };
      });
      samples.push({
        width,
        sample,
        headingVisibleMs: Math.round(headingVisibleMs),
        domContentLoadedMs: Math.round(metrics.domContentLoadedMs),
        scriptRequests: metrics.scriptRequests,
        jsTransferBytes: metrics.jsTransferBytes,
        jsEncodedBodyBytes: metrics.jsEncodedBodyBytes,
      });
      await context.close();
    }
  }
  const report = {
    measuredAt: new Date().toISOString(),
    route: '/demo',
    environment:
      'Local Next production build, Chromium headless; fresh context and browser cache disabled per sample',
    emulation: {
      cpuSlowdown: 4,
      latencyMs: 100,
      downloadBytesPerSecond: 200000,
      downloadMegabitsPerSecond: 1.6,
      uploadBytesPerSecond: 75000,
    },
    samples,
  };
  fs.writeFileSync('docs/capturas/fase3/rendimiento-basico.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(samples));
} finally {
  await browser.close();
}
