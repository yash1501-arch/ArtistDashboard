import { bookMyShowScraper } from './src/services/scrapers/bookMyShow.scraper';

async function testScraper() {
  console.log('Testing BookMyShow scraper...');
  
  try {
    const query = {
      artists: ['Arijit Singh'],
      cities: ['mumbai'],
      limitPerSource: 5
    };
    
    console.log('Query:', JSON.stringify(query, null, 2));
    
    const results = await bookMyShowScraper.scrape(query);
    
    console.log('Scrape Results:');
    console.log('- Source:', results.source);
    console.log('- Events found:', results.events.length);
    console.log('- Errors:', results.errors.length);
    if (results.errors.length > 0) {
      console.log('  Error details:', results.errors);
    }
    console.log('- Fetched at:', results.fetchedAt);
    
    if (results.events.length > 0) {
      console.log('');
      console.log('First few events:');
      for (let i = 0; i < Math.min(3, results.events.length); i++) {
        const event = results.events[i];
        console.log((i + 1) + '.');
        console.log('  Artist:', event.artistName);
        console.log('  Event:', event.eventName || 'N/A');
        console.log('  Venue:', event.venueName || 'N/A');
        console.log('  City:', event.city || 'N/A');
        console.log('  Date:', event.eventDate || 'N/A');
        console.log('  URL:', event.sourceUrl || 'N/A');
        console.log('');
      }
    } else {
      console.log('No events found.');
    }
  } catch (error) {
    console.error('Error testing scraper:', error);
  }
}

testScraper().catch(console.error);
