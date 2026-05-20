const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('bms-debug.html'));
console.log($('script[type="application/ld+json"]').length);
$('script[type="application/ld+json"]').each((i, el) => {
  const json = $(el).html();
  if (json.includes('Event')) {
    console.log(json.substring(0, 100) + '...');
  }
});
