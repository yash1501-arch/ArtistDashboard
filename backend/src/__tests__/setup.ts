import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const mockModel = () => ({
  findMany: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  upsert: jest.fn(),
  count: jest.fn(),
  groupBy: jest.fn(),
});

const mockPrisma = {
  user: mockModel(),
  artist: mockModel(),
  artistGenre: mockModel(),
  concert: mockModel(),
  platformMetric: mockModel(),
  genre: mockModel(),
  audienceDemographic: mockModel(),
  ingestionJob: mockModel(),
  refreshToken: mockModel(),
  venue: mockModel(),
  canonicalEvent: mockModel(),
  sourceEventReference: mockModel(),
  duplicateGroup: mockModel(),
  duplicateGroupMember: mockModel(),
  validationLog: mockModel(),
  predictionOutput: mockModel(),
  predictionTrainingData: mockModel(),
  featureSnapshot: mockModel(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $queryRawUnsafe: jest.fn(),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue(true),
  keys: jest.fn().mockResolvedValue([]),
  del: jest.fn().mockResolvedValue(0),
};

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  DemographicDimension: {
    AGE_GROUP: 'AGE_GROUP',
    GENDER: 'GENDER',
    GEOGRAPHY: 'GEOGRAPHY',
    GENRE: 'GENRE',
  },
  EventValidationStatus: {
    PENDING: 'PENDING',
    VALIDATED: 'VALIDATED',
    REJECTED: 'REJECTED',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    DUPLICATE: 'DUPLICATE',
  },
  JobStatus: {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
  },
  JobType: {
    EXCEL_IMPORT: 'EXCEL_IMPORT',
    PLATFORM_SYNC: 'PLATFORM_SYNC',
    CONCERT_RESEARCH: 'CONCERT_RESEARCH',
    CONCERT_SCRAPE: 'CONCERT_SCRAPE',
  },
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
    PrismaClientValidationError: class PrismaClientValidationError extends Error {},
  },
}));

jest.mock('../utils/database', () => ({
  prisma: mockPrisma,
  redis: mockRedis,
  connectRedis: jest.fn(),
  getRedis: jest.fn(() => null),
  connectDatabase: jest.fn(),
  disconnectDatabase: jest.fn(),
  enableShutdownHooks: jest.fn(),
}));

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
  for (const value of Object.values(mockPrisma)) {
    if (typeof value === 'function') {
      value.mockReset();
      continue;
    }

    if (value && typeof value === 'object') {
      for (const method of Object.values(value)) {
        if (typeof method === 'function') method.mockReset();
      }
    }
  }

  for (const method of Object.values(mockRedis)) {
    method.mockReset();
  }

  jest.clearAllMocks();
});
