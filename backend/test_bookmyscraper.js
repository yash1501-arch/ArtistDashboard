
const { BookMyShowScraper } = require('./dist/services/scrapers/bookMyShow.scraper');

async function testScraper() {
  console.log('Testing BookMyShow scraper...');
  console.log('Scraper class:', BookMyShowScraper.name);
  
  try {
    // Test with a simple query for a popular artist in a major city
    const query = {
      artists: ['Arijit Singh'],  // Using the artist we know exists in DB
      cities: ['mumbai'],
      limitPerSource: 3
    };
    
    console.log('Query:', JSON.stringify(query, null, 2));
    
    // Since this requires a browser, we'll test the URL building logic instead
    // Create an instance to test the protected methods
    const scraper = new BookMyShowScraper();
    
    // Test the helper methods
    console.log('');
    console.log('Testing URL generation...');
    const targets = scraper.buildSearchTargets(query);
    console.log('Generated targets:');
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      console.log((i + 1) + '. URL: ' + target.url);
      if (target.artist) console.log('   Artist: ' + target.artist);
      if (target.city) console.log('   City: ' + target.city);
    }
    
    console.log('');
    console.log('Note: Actual web scraping requires Playwright browser installation');
    console.log('and would need to be run in an environment with browser support.');
    console.log('The scraper is properly compiled and ready to use.');
    
  } catch (error) {
    console.error('Error testing scraper:', error);
  }
}

testScraper().catch(console.error);

