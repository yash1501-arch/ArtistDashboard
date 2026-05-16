import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  await page.goto('http://localhost:5173/login');
  
  // Fill login form
  await page.type('input[type="email"]', 'admin@mad.com');
  await page.type('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  
  // Wait for navigation to dashboard
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  
  // Wait a bit for data to load
  await new Promise(r => setTimeout(r, 2000));
  
  // Dump text content
  const text = await page.evaluate(() => document.body.innerText);
  console.log('TEXT:', text);
  
  await browser.close();
})();
