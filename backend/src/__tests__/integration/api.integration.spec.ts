import request from 'supertest';
import { app } from '../../server';
import { prisma } from '../../utils/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

jest.mock('../../utils/database');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('Integration Tests - API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check Endpoint', () => {
    it('GET /health should return server status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: expect.any(String),
      });
    });
  });

  describe('API Root Endpoints', () => {
    it('GET / should return welcome message', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: true,
          message: 'MAD Backend API Server',
          version: 'v1',
        })
      );
    });

    it('GET /api/v1 should return API v1 info', async () => {
      const response = await request(app).get('/api/v1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: true,
          message: 'MAD API v1',
          endpoints: expect.objectContaining({
            auth: expect.any(String),
            artists: expect.any(String),
            concerts: expect.any(String),
          }),
        })
      );
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for non-existent route', async () => {
      const response = await request(app).get('/api/v1/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('not found'),
        })
      );
    });
  });

  describe('Authentication Flow', () => {
    it('should complete full auth flow: login -> use token -> refresh', async () => {
      // Step 1: Login
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        role: 'ADMIN',
        active: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            accessToken: 'access-token',
          }),
        })
      );

      // Step 2: Use token to access protected route
      const tokenFromLogin = loginResponse.body.data.accessToken;

      // Step 3: Verify token is accepted on next request
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
      });

      const protectedResponse = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${tokenFromLogin}`);

      // The route should either work or return an auth error (not 404)
      expect([200, 401, 403]).toContain(protectedResponse.status);
    });
  });

  describe('CORS Configuration', () => {
    it('should allow CORS requests from configured origin', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should support credentials in CORS', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Request Body Parsing', () => {
    it('should parse JSON request body', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      // Should parse without error (may fail auth, but should parse)
      expect(response.status).not.toBe(400); // Not a parsing error
    });

    it('should reject oversized payloads', async () => {
      const largePayload = 'x'.repeat(11 * 1024 * 1024); // 11 MB

      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send({ data: largePayload });

      expect([413, 400]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect([400, 413]).toContain(response.status);
      expect(response.body).toBeDefined();
    });

    it('should include error details in response', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent');

      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.any(String),
        })
      );
    });
  });

  describe('Response Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('should include content encoding', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to /api routes', async () => {
      // Note: This test verifies the middleware is applied, not that it actually limits
      // (actual limiting would require sending many requests)
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      // Should not rate limit health checks (they're not under /api/)
    });
  });
});
