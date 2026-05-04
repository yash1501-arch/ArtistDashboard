import { loginSchema, createUserSchema, createArtistSchema } from '../../validations/zodSchemas';
import { ZodError } from 'zod';

describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('should accept valid login credentials', () => {
      const validData = {
        email: 'user@example.com',
        password: 'password123',
      };

      expect(() => loginSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        password: 'password123',
      };

      expect(() => loginSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject missing email', () => {
      const invalidData = {
        password: 'password123',
      };

      expect(() => loginSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject missing password', () => {
      const invalidData = {
        email: 'user@example.com',
      };

      expect(() => loginSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject empty password', () => {
      const invalidData = {
        email: 'user@example.com',
        password: '',
      };

      expect(() => loginSchema.parse(invalidData)).toThrow(ZodError);
    });
  });

  describe('createUserSchema', () => {
    it('should accept valid user data', () => {
      const validData = {
        email: 'newuser@example.com',
        password: 'password123456',
        role: 'VIEWER',
      };

      expect(() => createUserSchema.parse(validData)).not.toThrow();
    });

    it('should reject password shorter than 6 characters', () => {
      const invalidData = {
        email: 'user@example.com',
        password: 'pass',
        role: 'VIEWER',
      };

      expect(() => createUserSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject invalid role', () => {
      const invalidData = {
        email: 'user@example.com',
        password: 'password123',
        role: 'SUPERUSER',
      };

      expect(() => createUserSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'password123',
        role: 'VIEWER',
      };

      expect(() => createUserSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should accept ADMIN or VIEWER role', () => {
      const adminData = {
        email: 'admin@example.com',
        password: 'password123',
        role: 'ADMIN',
      };

      const viewerData = {
        email: 'viewer@example.com',
        password: 'password123',
        role: 'VIEWER',
      };

      expect(() => createUserSchema.parse(adminData)).not.toThrow();
      expect(() => createUserSchema.parse(viewerData)).not.toThrow();
    });
  });

  describe('createArtistSchema', () => {
    it('should accept valid artist data', () => {
      const validData = {
        artistName: 'John Doe',
        genre: 'Pop',
        nationality: 'India',
      };

      expect(() => createArtistSchema.parse(validData)).not.toThrow();
    });

    it('should reject missing artistName', () => {
      const invalidData = {
        genre: 'Pop',
        nationality: 'India',
      };

      expect(() => createArtistSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject empty artistName', () => {
      const invalidData = {
        artistName: '',
        genre: 'Pop',
      };

      expect(() => createArtistSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should accept optional fields', () => {
      const dataWithOptional = {
        artistName: 'Jane Smith',
        age: 28,
        gender: 'Female',
        bio: 'A talented musician',
      };

      expect(() => createArtistSchema.parse(dataWithOptional)).not.toThrow();
    });

    it('should validate URL fields', () => {
      const invalidData = {
        artistName: 'Artist',
        photoUrl: 'not-a-url',
      };

      expect(() => createArtistSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should accept valid URLs', () => {
      const validData = {
        artistName: 'Artist',
        photoUrl: 'https://example.com/photo.jpg',
        wikiUrl: 'https://en.wikipedia.org/wiki/Artist',
      };

      expect(() => createArtistSchema.parse(validData)).not.toThrow();
    });

    it('should reject negative age', () => {
      const invalidData = {
        artistName: 'Artist',
        age: -5,
      };

      expect(() => createArtistSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should reject negative follower counts', () => {
      const invalidData = {
        artistName: 'Artist',
        instagramFollowers: -100,
      };

      expect(() => createArtistSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should accept nullable fields', () => {
      const dataWithNull = {
        artistName: 'Artist',
        bio: null,
        photoUrl: null,
        age: null,
      };

      expect(() => createArtistSchema.parse(dataWithNull)).not.toThrow();
    });
  });

  describe('Truncation and Limits', () => {
    it('should reject artist name exceeding max length', () => {
      const longName = 'a'.repeat(256);
      const invalidData = {
        artistName: longName,
      };

      expect(() => createArtistSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('should accept artist name at max length', () => {
      const maxName = 'a'.repeat(255);
      const validData = {
        artistName: maxName,
      };

      expect(() => createArtistSchema.parse(validData)).not.toThrow();
    });

    it('should reject bio exceeding max length', () => {
      const longBio = 'a'.repeat(2001);
      const invalidData = {
        artistName: 'Artist',
        bio: longBio,
      };

      expect(() => createArtistSchema.parse(invalidData)).toThrow(ZodError);
    });
  });
});
