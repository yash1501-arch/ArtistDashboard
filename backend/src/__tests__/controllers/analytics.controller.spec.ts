import { Request, Response } from 'express';
import { analyticsController } from '../../controllers/analytics.controller';
import { prisma, redis } from '../../utils/database';

jest.mock('../../utils/database');

describe('Analytics Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = { query: {} };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getRoG (Rate of Growth)', () => {
    it('should return cached RoG data if available', async () => {
      mockRequest.query = { artistId: 'artist-1', period: 'daily' };
      const cachedData = [{ artistId: 'artist-1', rog: 5.2 }];

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedData));

      await analyticsController.getRoG(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          cached: true,
          data: cachedData,
        })
      );
    });

    it('should calculate RoG from database if not cached', async () => {
      mockRequest.query = { artistId: 'artist-1', period: 'daily' };

      const mockMetrics = [
        {
          id: 'metric-1',
          artistId: 'artist-1',
          platform: 'INSTAGRAM',
          rogDaily: 2.5,
          rogWeekly: null,
          rogMonthly: null,
          followers: 10000,
          artist: { id: 'artist-1', artistName: 'Artist One' },
        },
      ];

      (redis.get as jest.Mock).mockResolvedValue(null);
      (prisma.platformMetric.findMany as jest.Mock).mockResolvedValue(mockMetrics);
      (redis.setex as jest.Mock).mockResolvedValue('OK');

      await analyticsController.getRoG(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            results: expect.arrayContaining([
              expect.objectContaining({
                rog: 2.5,
                artistName: 'Artist One',
              }),
            ]),
          }),
        })
      );
    });

    it('should filter by platform', async () => {
      mockRequest.query = { platform: 'SPOTIFY', period: 'daily' };

      (redis.get as jest.Mock).mockResolvedValue(null);
      (prisma.platformMetric.findMany as jest.Mock).mockResolvedValue([]);
      (redis.setex as jest.Mock).mockResolvedValue('OK');

      await analyticsController.getRoG(mockRequest as Request, mockResponse as Response);

      expect(prisma.platformMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            platform: 'SPOTIFY',
          }),
        })
      );
    });

    it('should handle different periods', async () => {
      mockRequest.query = { period: 'weekly' };

      const mockMetrics = [
        {
          id: 'metric-1',
          rogDaily: null,
          rogWeekly: 3.2,
          rogMonthly: null,
          artist: { artistName: 'Artist' },
        },
      ];

      (redis.get as jest.Mock).mockResolvedValue(null);
      (prisma.platformMetric.findMany as jest.Mock).mockResolvedValue(mockMetrics);
      (redis.setex as jest.Mock).mockResolvedValue('OK');

      await analyticsController.getRoG(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            results: expect.arrayContaining([
              expect.objectContaining({
                rog: 3.2,
              }),
            ]),
          }),
        })
      );
    });

    it('should filter out null RoG values', async () => {
      mockRequest.query = { period: 'monthly' };

      const mockMetrics = [
        {
          id: 'metric-1',
          rogDaily: 2.5,
          rogWeekly: 3.2,
          rogMonthly: null,
          artist: { artistName: 'Artist' },
        },
      ];

      (redis.get as jest.Mock).mockResolvedValue(null);
      (prisma.platformMetric.findMany as jest.Mock).mockResolvedValue(mockMetrics);
      (redis.setex as jest.Mock).mockResolvedValue('OK');

      await analyticsController.getRoG(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            results: [],
          }),
        })
      );
    });
  });

  describe('getTrends', () => {
    it('should return trend data for chart', async () => {
      mockRequest.query = { metric: 'followers', platform: 'INSTAGRAM' };

      const mockMetrics = [
        {
          id: 'metric-1',
          metricDate: new Date('2025-01-01'),
          followers: 10000,
          likes: 500,
          streams: 1000,
          artistId: 'artist-1',
        },
      ];

      (prisma.platformMetric.findMany as jest.Mock).mockResolvedValue(mockMetrics);

      await analyticsController.getTrends(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            trends: expect.arrayContaining([
              expect.objectContaining({
                date: new Date('2025-01-01'),
                followers: 10000,
              }),
            ]),
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      mockRequest.query = {
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
      };

      (prisma.platformMetric.findMany as jest.Mock).mockResolvedValue([]);

      await analyticsController.getTrends(mockRequest as Request, mockResponse as Response);

      expect(prisma.platformMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            metricDate: expect.objectContaining({
              gte: new Date('2025-01-01'),
              lte: new Date('2025-12-31'),
            }),
          }),
        })
      );
    });

    it('should handle partial date range', async () => {
      mockRequest.query = {
        dateFrom: '2025-01-01',
      };

      (prisma.platformMetric.findMany as jest.Mock).mockResolvedValue([]);

      await analyticsController.getTrends(mockRequest as Request, mockResponse as Response);

      expect(prisma.platformMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            metricDate: expect.objectContaining({
              gte: new Date('2025-01-01'),
            }),
          }),
        })
      );
    });

    it('should order trends by date ascending', async () => {
      mockRequest.query = {};

      (prisma.platformMetric.findMany as jest.Mock).mockResolvedValue([]);

      await analyticsController.getTrends(mockRequest as Request, mockResponse as Response);

      expect(prisma.platformMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { metricDate: 'asc' },
        })
      );
    });

    it('should handle database errors', async () => {
      mockRequest.query = {};

      (prisma.platformMetric.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        analyticsController.getTrends(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getComparison', () => {
    it('should compare metrics across artists', async () => {
      mockRequest.query = { artistIds: 'artist-1,artist-2', platform: 'SPOTIFY' };

      (prisma.platformMetric.findMany as jest.Mock).mockResolvedValue([]);

      await analyticsController.getComparison(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });

  describe('getDemographics', () => {
    it('should return demographic data', async () => {
      mockRequest.query = { artistId: 'artist-1' };

      (prisma.audienceDemographic.findMany as jest.Mock).mockResolvedValue([]);

      await analyticsController.getDemographics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });
});
