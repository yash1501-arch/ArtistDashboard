import { Response } from 'express';
import { prisma } from '../utils/database';
import { CreateConcertInput, UpdateConcertInput } from '../validations/zodSchemas';

export const concertController = {
  // List concerts with pagination and filters
  list: async (req: any, res: Response) => {
    try {
      const {
        page = 1,
        limit = 50,
        artistId,
        city,
        country,
        dateFrom,
        dateTo,
      } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      // Build where clause
      const where: any = {};

      if (artistId) where.artistId = artistId;
      if (city) where.city = { contains: city as string, mode: 'insensitive' };
      if (country) where.country = { contains: country as string, mode: 'insensitive' };

      if (dateFrom || dateTo) {
        where.concertDate = {};
        if (dateFrom) where.concertDate.gte = new Date(dateFrom as string);
        if (dateTo) where.concertDate.lte = new Date(dateTo as string);
      }

      const [concerts, total] = await Promise.all([
        prisma.concert.findMany({
          where,
          include: {
            artist: {
              select: {
                id: true,
                artistName: true,
                nationality: true,
              },
            },
          },
          orderBy: { concertDate: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.concert.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          concerts,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string)),
          },
        },
      });
    } catch (error) {
      throw error;
    }
  },

  // Get single concert by ID
  getById: async (req: any, res: Response) => {
    try {
      const { id } = req.params;

      const concert = await prisma.concert.findUnique({
        where: { id },
        include: {
          artist: {
            select: {
              id: true,
              artistName: true,
              nationality: true,
            },
          },
          audienceDemographics: {
            orderBy: { metricDate: 'desc' },
          },
        },
      });

      if (!concert) {
        return res.status(404).json({
          success: false,
          message: 'Concert not found',
          code: 'CONCERT_NOT_FOUND',
        });
      }

      return res.status(200).json({
        success: true,
        data: { concert },
      });
    } catch (error) {
      throw error;
    }
  },

  // Create concert (admin only)
  create: async (req: any, res: Response) => {
    try {
      const input: CreateConcertInput = req.body;

      // Verify artist exists
      const artist = await prisma.artist.findUnique({
        where: { id: input.artistId },
      });

      if (!artist) {
        return res.status(400).json({
          success: false,
          message: 'Artist not found',
          code: 'ARTIST_NOT_FOUND',
        });
      }

      const concertDate = new Date(input.concertDate);

      const filteredInput = Object.fromEntries(
        Object.entries(input).filter(([_, v]) => v !== null)
      );

      const concert = await prisma.concert.create({
        data: {
          ...filteredInput,
          concertDate,
        } as any,
        include: {
          artist: {
            select: {
              id: true,
              artistName: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        data: { concert },
        message: 'Concert created successfully',
      });
    } catch (error) {
      throw error;
    }
  },

  // Update concert (admin only)
  update: async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const input: UpdateConcertInput = req.body;

      // Check if concert exists
      const existing = await prisma.concert.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Concert not found',
          code: 'CONCERT_NOT_FOUND',
        });
      }

      const updateData: any = { ...input };
      if (input.concertDate) {
        updateData.concertDate = new Date(input.concertDate);
      }

      const concert = await prisma.concert.update({
        where: { id },
        data: updateData,
        include: {
          artist: {
            select: {
              id: true,
              artistName: true,
            },
          },
        },
      });

      return res.status(200).json({
        success: true,
        data: { concert },
        message: 'Concert updated successfully',
      });
    } catch (error) {
      throw error;
    }
  },

  // Get cities with aggregated stats
  getCities: async (req: any, res: Response) => {
    try {
      const { country } = req.query;

      const where: any = {};
      if (country) {
        where.country = { contains: country as string, mode: 'insensitive' };
      }

      const cities = await prisma.concert.groupBy({
        by: ['city', 'state', 'country'],
        where,
        _sum: {
          ticketsSold: true,
          totalRevenue: true,
          capacity: true,
        },
        _count: {
          id: true,
        },
        orderBy: {
          _sum: {
            totalRevenue: 'desc',
          },
        },
        take: 50,
      });

      // Format response
      const formatted = cities.map((city) => ({
        city: city.city,
        state: city.state,
        country: city.country,
        concertCount: city._count.id,
        totalTicketsSold: city._sum.ticketsSold || 0,
        totalRevenue: city._sum.totalRevenue || 0,
        totalCapacity: city._sum.capacity || 0,
        avgTicketPrice: city._sum.totalRevenue && city._sum.ticketsSold && city._sum.ticketsSold > 0
          ? Number(city._sum.totalRevenue) / Number(city._sum.ticketsSold)
          : 0,
      }));

      return res.status(200).json({
        success: true,
        data: { cities: formatted },
      });
    } catch (error) {
      throw error;
    }
  },

  // Get venues with aggregated stats
  getVenues: async (_req: any, res: Response) => {
    try {
      const venues = await prisma.concert.groupBy({
        by: ['venueName', 'city', 'country'],
        _sum: {
          ticketsSold: true,
          totalRevenue: true,
          capacity: true,
        },
        _count: {
          id: true,
        },
        orderBy: {
          _sum: {
            totalRevenue: 'desc',
          },
        },
        take: 50,
      });

      const formatted = venues.map((venue) => ({
        venueName: venue.venueName,
        city: venue.city,
        country: venue.country,
        concertCount: venue._count.id,
        totalTicketsSold: venue._sum.ticketsSold || 0,
        totalRevenue: venue._sum.totalRevenue || 0,
        avgTicketPrice: venue._sum.totalRevenue && venue._sum.ticketsSold && venue._sum.ticketsSold > 0
          ? Number(venue._sum.totalRevenue) / Number(venue._sum.ticketsSold)
          : 0,
      }));

      return res.status(200).json({
        success: true,
        data: { venues: formatted },
      });
    } catch (error) {
      throw error;
    }
  },
};

export default concertController;
