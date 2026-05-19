import { BasePlaywrightScraper } from './basePlaywrightScraper';
import { ConcertSourcePlatform, ScrapeQuery } from './types';

export class EventbriteScraper extends BasePlaywrightScraper {
  readonly source: ConcertSourcePlatform = 'EVENTBRITE';
  protected readonly cardSelectors = [
    '[data-testid="event-card"]',
    '.event-card',
    '[class*="event-card"]',
    'a[href*="/e/"]',
  ];

  protected buildSearchTargets(query: ScrapeQuery): Array<{ url: string; artist?: string; city?: string }> {
    const artists = this.toSearchTerms(query.artists);
    const cities = query.cities?.length ? query.cities : ['online'];
    const targets: Array<{ url: string; artist?: string; city?: string }> = [];

    for (const city of cities) {
      for (const artist of artists) {
        const search = artist === 'music concerts' ? 'concerts' : artist;
        targets.push({
          url: `https://www.eventbrite.com/d/${this.slug(city)}/music--events/?q=${encodeURIComponent(search)}`,
          artist: artist === 'music concerts' ? undefined : artist,
          city: city === 'online' ? undefined : city,
        });
      }
    }

    return targets;
  }
}

export const eventbriteScraper = new EventbriteScraper();
