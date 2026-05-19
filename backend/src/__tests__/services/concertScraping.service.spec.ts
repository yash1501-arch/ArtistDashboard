import { ConcertScrapingService } from '../../services/scrapers/concertScraping.service';
import { ConcertSourceScraper, RawConcertEvent, ScrapeResult } from '../../services/scrapers/types';

const event: RawConcertEvent = {
  artistName: 'Anuv Jain',
  venueName: 'Columbia Theater, Berlin, Germany',
  eventDate: '2026-09-19',
  sourcePlatform: 'SONGKICK',
  sourceUrl: 'https://www.songkick.com/concerts/42893311-anuv-jain-at-columbia-theater',
};

const scraper = (
  source: ConcertSourceScraper['source'],
  scrape: jest.Mock<Promise<ScrapeResult>>
): ConcertSourceScraper => ({
  source,
  scrape,
});

describe('ConcertScrapingService', () => {
  it('does not run Google CSE unless it is explicitly selected', async () => {
    const googleScrape = jest.fn().mockResolvedValue({
      source: 'GOOGLE_CSE',
      events: [],
      errors: [],
      fetchedAt: new Date(),
    });
    const songkickScrape = jest.fn().mockResolvedValue({
      source: 'SONGKICK',
      events: [event],
      errors: [],
      fetchedAt: new Date(),
    });
    const service = new ConcertScrapingService([
      scraper('SONGKICK', songkickScrape),
      scraper('GOOGLE_CSE', googleScrape),
    ]);

    const summary = await service.scrapeSources({});

    expect(songkickScrape).toHaveBeenCalledTimes(1);
    expect(googleScrape).not.toHaveBeenCalled();
    expect(summary.eventCount).toBe(1);
  });

  it('keeps usable source results when another source throws', async () => {
    const bookMyShowScrape = jest.fn().mockRejectedValue(new Error('blocked upstream'));
    const songkickScrape = jest.fn().mockResolvedValue({
      source: 'SONGKICK',
      events: [event],
      errors: [],
      fetchedAt: new Date(),
    });
    const service = new ConcertScrapingService([
      scraper('BOOKMYSHOW', bookMyShowScrape),
      scraper('SONGKICK', songkickScrape),
    ]);

    const summary = await service.scrapeSources({});

    expect(summary.eventCount).toBe(1);
    expect(summary.errors).toEqual(['BOOKMYSHOW: blocked upstream']);
  });
});
