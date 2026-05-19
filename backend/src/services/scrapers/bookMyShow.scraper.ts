import { BasePlaywrightScraper } from './basePlaywrightScraper';
import { ConcertSourcePlatform, ScrapeQuery } from './types';

export class BookMyShowScraper extends BasePlaywrightScraper {
  readonly source: ConcertSourcePlatform = 'BOOKMYSHOW';
  protected readonly cardSelectors = [
    '[data-testid*="event"]',
    '[class*="event-card"]',
    '[class*="EventCard"]',
    'a[href*="/events/"]',
  ];

  protected buildSearchTargets(query: ScrapeQuery): Array<{ url: string; artist?: string; city?: string }> {
    const artists = this.toSearchTerms(query.artists);
    const cities = query.cities?.length ? query.cities : ['mumbai'];
    const targets: Array<{ url: string; artist?: string; city?: string }> = [];

    for (const city of cities) {
      targets.push({
        url: `https://in.bookmyshow.com/explore/music-shows-${this.slug(city)}`,
        city,
      });

      for (const artist of artists) {
        targets.push({
          url: `https://in.bookmyshow.com/search?q=${encodeURIComponent(artist)}`,
          artist,
          city,
        });
      }
    }

    return targets;
  }
}

export const bookMyShowScraper = new BookMyShowScraper();
