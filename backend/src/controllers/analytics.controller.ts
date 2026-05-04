import { Response } from 'express';
import { prisma, redis } from '../utils/database';

const CACHE_TTL = 60 * 60; // 1 hour

export const analyticsController = {
  // Rate of Growth (RoG) for artist(s)
  getRoG: async (req: any, res: Response) => {
    try {
      const { artistId, platform, period = 'daily' } = req.query;

      // Build cache key
      const cacheKey = `rog:${artistId || 'all'}:${platform || 'all'}:${period}`;

      // Try cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: JSON.parse(cached),
          cached: true,
        });
      }

      const where: any = {};

      if (artistId) where.artistId = artistId;
      if (platform) where.platform = platform.toUpperCase();

      // Get metrics ordered by date
      const metrics = await prisma.platformMetric.findMany({
        where,
        orderBy: { metricDate: 'desc' },
        take: 1000,
        include: {
          artist: {
            select: { id: true, artistName: true },
          },
        },
      });

      // Calculate RoG based on period
      const results = metrics.map((metric) => {
        const rogField = period === 'daily' ? metric.rogDaily
          : period === 'weekly' ? metric.rogWeekly
          : metric.rogMonthly;

        return {
          id: metric.id,
          artistId: metric.artistId,
          artistName: metric.artist.artistName,
          platform: metric.platform,
          metricDate: metric.metricDate,
          followers: metric.followers,
          rog: rogField,
        };
      }).filter((r) => r.rog !== null);

      // Cache results
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(results));

      return res.status(200).json({
        success: true,
        data: { results },
      });
    } catch (error) {
      throw error;
    }
  },

  // Time-series trends for chart rendering
  getTrends: async (req: any, res: Response) => {
    try {
      const { metric = 'followers', platform, dateFrom, dateTo, artistId } = req.query;

      const where: any = {};

      if (artistId) where.artistId = artistId;
      if (platform) where.platform = platform.toUpperCase();
      if (dateFrom || dateTo) {
        where.metricDate = {};
        if (dateFrom) where.metricDate.gte = new Date(dateFrom as string);
        if (dateTo) where.metricDate.lte = new Date(dateTo as string);
      }

      const metrics = await prisma.platformMetric.findMany({
        where,
        orderBy: { metricDate: 'asc' },
        take: 1000,
      });

      // Transform for chart: { date: '2025-01-01', followers: 1000, likes: 500 }
      const trends = metrics.map((m) => {
        const point: any = { date: m.metricDate };
        point[metric] = (m as any)[metric] || 0;
        point.followers = m.followers;
        point.likes = m.likes;
        point.streams = m.streams;
        point.artistId = m.artistId;
        return point;
      });

      return res.status(200).json({
        success: true,
        data: { trends },
      });
    } catch (error) {
      throw error;
    }
  },

  // Demographics: Age group breakdown
  getDemographicsAge: async (req: any, res: Response) => {
    try {
      const { artistId, concertId } = req.query;

      const cacheKey = `demo:age:${artistId || 'all'}:${concertId || 'all'}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: JSON.parse(cached),
          cached: true,
        });
      }

      const where: any = { dimension: 'AGE_GROUP' };
      if (artistId) where.artistId = artistId;
      if (concertId) where.concertId = concertId;

      const data = await prisma.audienceDemographic.groupBy({
        by: ['dimensionValue'],
        where,
        _sum: {
          absoluteCount: true,
        },
        _avg: {
          percentage: true,
        },
        orderBy: {
          _sum: {
            absoluteCount: 'desc',
          },
        },
      });

      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));

      return res.status(200).json({
        success: true,
        data: { breakdown: data },
      });
    } catch (error) {
      throw error;
    }
  },

  // Demographics: Gender distribution
  getDemographicsGender: async (req: any, res: Response) => {
    try {
      const { artistId, concertId } = req.query;

      const cacheKey = `demo:gender:${artistId || 'all'}:${concertId || 'all'}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: JSON.parse(cached),
          cached: true,
        });
      }

      const where: any = { dimension: 'GENDER' };
      if (artistId) where.artistId = artistId;
      if (concertId) where.concertId = concertId;

      const data = await prisma.audienceDemographic.groupBy({
        by: ['dimensionValue'],
        where,
        _sum: {
          absoluteCount: true,
        },
        _avg: {
          percentage: true,
        },
        orderBy: {
          _sum: {
            absoluteCount: 'desc',
          },
        },
      });

      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));

      return res.status(200).json({
        success: true,
        data: { breakdown: data },
      });
    } catch (error) {
      throw error;
    }
  },

  // Demographics: Geographic distribution (for map)
  getDemographicsGeo: async (req: any, res: Response) => {
    try {
      const { artistId, concertId } = req.query;

      const where: any = { dimension: 'GEOGRAPHY' };
      if (artistId) where.artistId = artistId;
      if (concertId) where.concertId = concertId;

      const data = await prisma.audienceDemographic.groupBy({
        by: ['dimensionValue'],
        where,
        _sum: {
          absoluteCount: true,
        },
        orderBy: {
          _sum: {
            absoluteCount: 'desc',
          },
        },
        take: 100,
      });

      // Return GeoJSON-like structure for frontend map
      // Frontend will need to geocode dimensionValue (city names) to coordinates
      const features = data.map((item, index) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [0, 0], // Placeholder - frontend geocodes city names
        },
        properties: {
          name: item.dimensionValue,
          count: item._sum.absoluteCount || 0,
          rank: index + 1,
        },
      }));

      return res.status(200).json({
        success: true,
        data: {
          type: 'FeatureCollection',
          features,
        },
      });
    } catch (error) {
      throw error;
    }
  },

  // Genre popularity
  getGenres: async (req: any, res: Response) => {
    try {
      const { artistId } = req.query;

      const cacheKey = `genres:${artistId || 'all'}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: JSON.parse(cached),
          cached: true,
        });
      }

      // Get genre popularity based on artist counts and platform metrics
      const genres = await prisma.genre.findMany({
        include: {
          _count: {
            select: { artists: true },
          },
        },
        orderBy: {
          artists: {
            _count: 'desc',
          },
        },
      });

      const enrichedGenres = await Promise.all(
        genres.map(async (genre) => {
          const artistsInGenre = await prisma.artist.findMany({
            where: {
              genres: {
                some: { genreId: genre.id },
              },
            },
            select: { id: true },
          });

          const artistIds = artistsInGenre.map((a) => a.id);

          // Get total followers for this genre (sum of latest platform metrics)
          const latestMetrics = await prisma.platformMetric.groupBy({
            by: ['artistId'],
            where: {
              artistId: { in: artistIds },
            },
            _max: {
              metricDate: true,
              followers: true,
            },
          });

          const totalFollowers = latestMetrics.reduce((sum, m) => sum + Number(m._max.followers || 0), 0);

          return {
            genreId: genre.id,
            genreName: genre.name,
            artistCount: genre._count.artists,
            totalFollowers,
          };
        })
      );

      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(enrichedGenres));

      return res.status(200).json({
        success: true,
        data: { genres: enrichedGenres },
      });
    } catch (error) {
      throw error;
    }
  },
};

export default analyticsController;
