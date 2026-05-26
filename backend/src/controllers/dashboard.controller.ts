import { Response } from 'express';
import { prisma, redis } from '../utils/database';
import { calculateConcertRevenue } from '../utils/concertRevenue';

const CACHE_TTL = 60 * 60; // 1 hour

export const dashboardController = {
  // Get all KPIs for dashboard homepage
  getKPIs: async (_req: any, res: Response) => {
    try {
      const cacheKey = 'dashboard:kpis';
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: JSON.parse(cached),
          cached: true,
        });
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const startOfYear = new Date(currentYear, 0, 1);

      // Total active artists
      const totalArtists = await prisma.artist.count({
        where: { active: true },
      });

      // Total concerts (all time)
      const totalConcerts = await prisma.concert.count();

      // Concert totals YTD
      const concertsYTD = await prisma.concert.findMany({
        where: {
          concertDate: { gte: startOfYear },
        },
        select: {
          totalRevenue: true,
          ticketsSold: true,
          avgTicketPrice: true,
          predictionOutputs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              expectedRevenue: true,
            },
          },
        },
      });

      const ticketsSoldYTD = concertsYTD.reduce((sum, concert) => sum + (concert.ticketsSold || 0), 0);
      const revenueYTD = concertsYTD.reduce((sum, concert) => sum + calculateConcertRevenue(concert), 0);

      // Avg RoG across all platforms (last 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const avgRoG = await prisma.platformMetric.aggregate({
        where: {
          metricDate: { gte: thirtyDaysAgo },
          rogDaily: { not: null },
        },
        _avg: {
          rogDaily: true,
        },
      });

      // Top artist by streams (last month)
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // First, find the artistId with max streams
      const topArtistAgg = await prisma.platformMetric.groupBy({
        by: ['artistId'],
        where: {
          metricDate: { gte: oneMonthAgo },
          platform: 'YOUTUBE',
        },
        _max: {
          streams: true,
        },
        orderBy: {
          _max: {
            streams: 'desc',
          },
        },
        take: 1,
      });

      let topArtistByStreams = null;
      if (topArtistAgg.length > 0) {
        const { artistId, _max } = topArtistAgg[0];
        // Fetch artist details separately
        const artist = await prisma.artist.findUnique({
          where: { id: artistId },
          select: {
            id: true,
            artistName: true,
            photoUrl: true,
          },
        });
        if (artist) {
          topArtistByStreams = {
            id: artist.id,
            name: artist.artistName,
            photoUrl: artist.photoUrl,
            streams: _max.streams || 0,
          };
        }
      }

      const kpis = {
        totalArtists,
        totalConcerts,
        ticketsSoldYTD,
        revenueYTD,
        avgRoGDaily: avgRoG._avg.rogDaily ? parseFloat(avgRoG._avg.rogDaily.toFixed(2)) : 0,
        topArtistByStreams,
      };

      // Cache for 1 hour
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(kpis));

      return res.status(200).json({
        success: true,
        data: kpis,
      });
    } catch (error) {
      throw error;
    }
  },

  // Top performing artists by followers
  getTopArtists: async (req: any, res: Response) => {
    try {
      const { limit = 10, platform } = req.query;

      const cacheKey = `dashboard:topArtists:${limit}:${platform || 'all'}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: JSON.parse(cached),
          cached: true,
        });
      }

      // Get latest metrics per artist+platform by fetching recent metrics sorted by date
      // We'll fetch metrics from the last 90 days and deduplicate in memory
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const allMetrics = await prisma.platformMetric.findMany({
        where: {
          metricDate: { gte: ninetyDaysAgo },
          ...(platform && { platform: platform.toUpperCase() }),
        },
        orderBy: { metricDate: 'desc' },
        select: {
          artistId: true,
          platform: true,
          followers: true,
        },
      });

      // Deduplicate: keep only the latest metric for each artist+platform combination
      const latestMap = new Map<string, typeof allMetrics[0]>();
      for (const metric of allMetrics) {
        const key = `${metric.artistId}:${metric.platform}`;
        if (!latestMap.has(key)) {
          latestMap.set(key, metric);
        }
      }
      const latestMetrics = Array.from(latestMap.values());

      if (latestMetrics.length === 0) {
        // Fallback: Query artists directly and aggregate followers
        const fallbackArtists = await prisma.artist.findMany({
          where: { active: true },
          include: {
            genres: {
              include: { genre: true },
            },
          },
        });

        const sortedFallbackArtists = fallbackArtists.map(artist => {
          const totalFollowers = 
            Number(artist.instagramFollowers || 0) +
            Number(artist.youtubeSubscribers || 0) +
            Number(artist.spotifyMonthlyListeners || 0) +
            Number(artist.facebookFollowers || 0);
          
          return {
            artistId: artist.id,
            totalFollowers,
            platforms: [
              { platform: 'INSTAGRAM', followers: Number(artist.instagramFollowers || 0) },
              { platform: 'YOUTUBE', followers: Number(artist.youtubeSubscribers || 0) },
              { platform: 'SPOTIFY', followers: Number(artist.spotifyMonthlyListeners || 0) }
            ],
            artist: artist,
          };
        }).sort((a, b) => b.totalFollowers - a.totalFollowers).slice(0, parseInt(limit as string));

        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(sortedFallbackArtists));
        return res.status(200).json({
          success: true,
          data: { artists: sortedFallbackArtists },
        });
      }

      // Group by artist to sum total followers across platforms
      const artistFollowers: any = {};

      for (const metric of latestMetrics) {
        if (!artistFollowers[metric.artistId]) {
          artistFollowers[metric.artistId] = {
            artistId: metric.artistId,
            totalFollowers: 0,
            platforms: [],
          };
        }

        const followers = Number(metric.followers || 0);
        artistFollowers[metric.artistId].totalFollowers += followers;
        artistFollowers[metric.artistId].platforms.push({
          platform: metric.platform,
          followers: followers,
        });
      }

      // Sort by total followers
      const sortedArtists = Object.values(artistFollowers)
        .sort((a: any, b: any) => b.totalFollowers - a.totalFollowers)
        .slice(0, parseInt(limit as string));

      // Enrich with artist details
      const artistIds = sortedArtists.map((a: any) => a.artistId);
      const artists = await prisma.artist.findMany({
        where: { id: { in: artistIds } },
        include: {
          genres: {
            include: {
              genre: true,
            },
          },
        },
      });

      const artistMap = artists.reduce((acc, artist) => {
        acc[artist.id] = artist;
        return acc;
      }, {} as any);

      const enriched = sortedArtists.map((item: any) => ({
        ...item,
        artist: artistMap[item.artistId],
      }));

      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(enriched));

      return res.status(200).json({
        success: true,
        data: { artists: enriched },
      });
    } catch (error) {
      throw error;
    }
  },
};

export default dashboardController;
