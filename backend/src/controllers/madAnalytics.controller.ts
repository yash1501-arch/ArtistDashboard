import { Request, Response } from 'express';
import { madAnalyticsService } from '../services/madAnalytics.service';

export const madAnalyticsController = {
  getGrowthForecast: async (req: Request, res: Response) => {
    try {
      const { artist_id, metrics } = req.body;
      if (!artist_id) {
        return res.status(400).json({ success: false, message: 'artist_id is required' });
      }
      
      const result = await madAnalyticsService.getGrowthForecast(artist_id, metrics);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('getGrowthForecast error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  },

  getDemandScore: async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const result = await madAnalyticsService.getDemandScore(payload);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('getDemandScore error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  },

  getRevenuePrediction: async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const result = await madAnalyticsService.getRevenuePrediction(payload);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('getRevenuePrediction error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  },

  getLlmPrediction: async (req: Request, res: Response) => {
    try {
      const result = await madAnalyticsService.getLlmPrediction(req.body);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('getLlmPrediction error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  },

  getVenueCapacity: async (req: Request, res: Response) => {
    try {
      const { venue_name } = req.body;
      if (!venue_name) {
        return res.status(400).json({ success: false, message: 'venue_name is required' });
      }
      const result = await madAnalyticsService.getVenueCapacity(req.body);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('getVenueCapacity error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  },

  getPopularityScore: async (req: Request, res: Response) => {
    try {
      const { artist_id, platform_metrics } = req.body;
      if (!artist_id) {
        return res.status(400).json({ success: false, message: 'artist_id is required' });
      }
      const result = await madAnalyticsService.getPopularityScore(artist_id, platform_metrics);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('getPopularityScore error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  },
  
  saveAllPopularityScores: async (_req: Request, res: Response) => {
    try {
      const result = await madAnalyticsService.saveAllPopularityScores();
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('saveAllPopularityScores error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  }
};
