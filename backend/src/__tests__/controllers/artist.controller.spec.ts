import { Request, Response } from 'express';
import { artistController } from '../../controllers/artist.controller';
import { prisma } from '../../utils/database';

jest.mock('../../utils/database');

describe('Artist Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = { query: {}, params: {} };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('list', () => {
    it('should return paginated artists', async () => {
      mockRequest.query = { page: '1', limit: '10' };

      const mockArtists = [
        {
          id: 'artist-1',
          artistName: 'Artist One',
          active: true,
          genres: [],
        },
      ];

      (prisma.artist.findMany as jest.Mock).mockResolvedValue(mockArtists);
      (prisma.artist.count as jest.Mock).mockResolvedValue(1);

      await artistController.list(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            artists: mockArtists,
            pagination: expect.objectContaining({
              page: 1,
              limit: 10,
              total: 1,
            }),
          }),
        })
      );
    });

    it('should filter artists by search', async () => {
      mockRequest.query = { search: 'John', page: '1', limit: '10' };

      (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.artist.count as jest.Mock).mockResolvedValue(0);

      await artistController.list(mockRequest as Request, mockResponse as Response);

      expect(prisma.artist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        })
      );
    });

    it('should filter artists by genre', async () => {
      mockRequest.query = { genre: 'Rock', page: '1', limit: '10' };

      const mockGenre = { id: 1, name: 'Rock' };
      (prisma.genre.findFirst as jest.Mock).mockResolvedValue(mockGenre);
      (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.artist.count as jest.Mock).mockResolvedValue(0);

      await artistController.list(mockRequest as Request, mockResponse as Response);

      expect(prisma.genre.findFirst).toHaveBeenCalled();
      expect(prisma.artist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            genres: { some: { genreId: 1 } },
          }),
        })
      );
    });

    it('should handle active filter', async () => {
      mockRequest.query = { active: 'true', page: '1', limit: '10' };

      (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.artist.count as jest.Mock).mockResolvedValue(0);

      await artistController.list(mockRequest as Request, mockResponse as Response);

      expect(prisma.artist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            active: true,
          }),
        })
      );
    });

    it('should handle pagination correctly', async () => {
      mockRequest.query = { page: '3', limit: '20' };

      (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.artist.count as jest.Mock).mockResolvedValue(100);

      await artistController.list(mockRequest as Request, mockResponse as Response);

      expect(prisma.artist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40, // (3 - 1) * 20
          take: 20,
        })
      );
    });
  });

  describe('getById', () => {
    it('should return artist with details', async () => {
      mockRequest.params = { id: 'artist-1' };

      const mockArtist = {
        id: 'artist-1',
        artistName: 'Artist One',
        genres: [],
        platformMetrics: [],
        concerts: [],
      };

      (prisma.artist.findUnique as jest.Mock).mockResolvedValue(mockArtist);

      await artistController.getById(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { artist: mockArtist },
        })
      );
    });

    it('should handle artist not found', async () => {
      mockRequest.params = { id: 'nonexistent' };

      (prisma.artist.findUnique as jest.Mock).mockResolvedValue(null);

      await artistController.getById(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Artist not found',
        })
      );
    });

    it('should include recent metrics and concerts', async () => {
      mockRequest.params = { id: 'artist-1' };

      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({
        id: 'artist-1',
        platformMetrics: Array(10).fill({ id: 'metric' }),
      });

      await artistController.getById(mockRequest as Request, mockResponse as Response);

      expect(prisma.artist.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            platformMetrics: expect.objectContaining({
              take: 10,
            }),
            concerts: expect.objectContaining({
              take: 5,
            }),
          }),
        })
      );
    });
  });

  describe('create', () => {
    it('should create an artist with valid data', async () => {
      mockRequest.body = {
        artistName: 'New Artist',
        genre: 'Pop',
        nationality: 'India',
      };

      const mockNewArtist = {
        id: 'artist-2',
        artistName: 'New Artist',
        genre: 'Pop',
      };

      (prisma.artist.create as jest.Mock).mockResolvedValue(mockNewArtist);

      await artistController.create(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { artist: mockNewArtist },
        })
      );
    });

    it('should reject duplicate artist name', async () => {
      mockRequest.body = {
        artistName: 'Existing Artist',
      };

      (prisma.artist.create as jest.Mock).mockRejectedValue({
        code: 'P2002', // Prisma unique constraint error
      });

      await expect(
        artistController.create(mockRequest as Request, mockResponse as Response)
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('should validate required fields', async () => {
      mockRequest.body = { genre: 'Pop' }; // Missing artistName

      await expect(
        artistController.create(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update artist with valid data', async () => {
      mockRequest.params = { id: 'artist-1' };
      mockRequest.body = {
        artistName: 'Updated Name',
        genre: 'Rock',
      };

      (prisma.artist.update as jest.Mock).mockResolvedValue({
        id: 'artist-1',
        artistName: 'Updated Name',
      });
      (prisma.artist.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'artist-1' })
        .mockResolvedValueOnce({ id: 'artist-1', artistName: 'Updated Name' });

      await artistController.update(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should handle artist not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockRequest.body = { artistName: 'Updated Name' };

      (prisma.artist.findUnique as jest.Mock).mockResolvedValue(null);

      await artistController.update(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Artist not found',
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete an artist', async () => {
      mockRequest.params = { id: 'artist-1' };

      (prisma.artist.update as jest.Mock).mockResolvedValue({ id: 'artist-1', active: false });

      await artistController.delete(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Artist deactivated successfully',
        })
      );
    });
  });
});
