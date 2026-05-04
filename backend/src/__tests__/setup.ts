import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Mock Prisma Client
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    artist: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    concert: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    platformMetric: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
    },
    genre: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    ingestionJob: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  })),
}));

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn(() => ({
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    flushdb: jest.fn().mockResolvedValue('OK'),
  }));
});

// Global test setup
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-purposes-only-min-32-chars';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-purposes-min-32-chars';
});

afterEach(() => {
  jest.clearAllMocks();
});
