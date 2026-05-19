import { BasePlaywrightScraper } from './basePlaywrightScraper';
import { ConcertSourcePlatform, ScrapeQuery } from './types';

export class SongkickScraper extends BasePlaywrightScraper {
  readonly source: ConcertSourcePlatform = 'SONGKICK';
  protected readonly cardSelectors = [
    '.event-listings li',
    '[class*="event-listing"]',
    '[class*="concert"]',
    'a[href*="/concerts/"]',
  ];

  protected buildSearchTargets(query: ScrapeQuery): Array<{ url: string; artist?: string; city?: string }> {
    const artists = this.toSearchTerms(query.artists);
    const cities = query.cities ?? [];
    const targets: Array<{ url: string; artist?: string; city?: string }> = [];

    for (const artist of artists) {
      targets.push({
        url: `https://www.songkick.com/search?query=${encodeURIComponent(artist)}`,
        artist,
      });
    }

    for (const city of cities) {
      targets.push({
        url: `https://www.songkick.com/metro-areas?query=${encodeURIComponent(city)}`,
        city,
      });
    }

    return targets;
  }
}

export const songkickScraper = new SongkickScraper();
