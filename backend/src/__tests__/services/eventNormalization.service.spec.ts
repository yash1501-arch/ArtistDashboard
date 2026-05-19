import { eventNormalizationService } from '../../services/normalization/eventNormalization.service';

describe('EventNormalizationService', () => {
  it('parses venue, city, state, and country strings from source cards', () => {
    const normalized = eventNormalizationService.normalize({
      artistName: 'Anuv Jain',
      venueName: 'Forum Melbourne, Melbourne, VIC, Australia',
      eventDate: '2026-08-06T19:00:00+1000',
      sourcePlatform: 'SONGKICK',
      sourceUrl: 'https://www.songkick.com/concerts/42894399-anuv-jain-at-forum-melbourne',
    });

    expect(normalized).toEqual(
      expect.objectContaining({
        venue_name: 'Forum Melbourne',
        city: 'Melbourne',
        country: 'Australia',
      })
    );
  });
});
