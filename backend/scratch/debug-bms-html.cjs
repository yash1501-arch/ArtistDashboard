const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('bms-debug.html'));
$('a[href*="/events/"]').slice(0, 1).each((i, el) => console.log($.html(el)));
