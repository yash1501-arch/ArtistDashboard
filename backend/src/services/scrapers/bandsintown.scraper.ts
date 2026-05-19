import { BasePlaywrightScraper } from './basePlaywrightScraper';
import { ConcertSourcePlatform, ScrapeQuery } from './types';

export class BandsintownScraper extends BasePlaywrightScraper {
  readonly source: ConcertSourcePlatform = 'BANDSINTOWN';
  protected readonly cardSelectors = [
    '[data-testid*="event"]',
    '[class*="eventList"]',
    '[class*="Event"]',
    'a[href*="/e/"]',
  ];

  protected buildSearchTargets(query: ScrapeQuery): Array<{ url: string; artist?: string; city?: string }> {
    const artists = this.toSearchTerms(query.artists);
    const targets: Array<{ url: string; artist?: string; city?: string }> = [];

    for (const artist of artists) {
      targets.push({
        url: `https://www.bandsintown.com/search?q=${encodeURIComponent(artist)}`,
        artist,
      });
      targets.push({
        url: `https://www.bandsintown.com/a/${encodeURIComponent(artist)}`,
        artist,
      });
    }

    return targets;
  }
}

export const bandsintownScraper = new BandsintownScraper();
