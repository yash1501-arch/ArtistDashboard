const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  const url = 'https://in.bookmyshow.com/explore/music-shows-mumbai';
  
  console.log(`Navigating to ${url}...`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (err) {
    console.log('Navigation timeout or error, proceeding anyway...', err.message);
  }

  console.log('Saving screenshot...');
  await page.screenshot({ path: 'bms-debug.png', fullPage: true });
  
  console.log('Saving HTML...');
  const html = await page.content();
  fs.writeFileSync('bms-debug.html', html);

  console.log('Checking for event cards...');
  const eventCards = await page.$$eval('[data-testid*="event"], [class*="event-card"], [class*="EventCard"], a[href*="/events/"]', elements => {
    return elements.map(el => {
      const href = el.tagName === 'A' ? el.href : el.querySelector('a')?.href;
      return { tag: el.tagName, className: el.className, href, text: el.innerText.substring(0, 50).replace(/\n/g, ' ') };
    });
  });

  console.log(`Found ${eventCards.length} matching elements:`);
  console.log(JSON.stringify(eventCards.slice(0, 5), null, 2));

  await browser.close();
}

main().catch(console.error);
