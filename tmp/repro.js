const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => { errs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')); });
  page.on('console', m => {
    const t = m.type();
    if (t === 'error' || t === 'warning') {
      errs.push('[' + t + '] ' + m.text());
    }
  });
  try {
    await page.goto('http://localhost:8765/profile', { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    console.log('NAV ERR:', e.message);
  }
  await new Promise(r => setTimeout(r, 8000));
  console.log('--- ERRS ---');
  console.log(errs.join('\n----\n'));
  await browser.close();
})();
