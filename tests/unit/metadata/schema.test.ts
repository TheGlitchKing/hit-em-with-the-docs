import { describe, it, expect } from 'vitest';
import {
  MetadataSchema,
  validateMetadata,
  validatePartialMetadata,
  getMissingRequiredFields,
  getMissingFields,
  calculateMetadataCompleteness,
  REQUIRED_FIELDS,
  ALL_METADATA_FIELDS,
  getFieldCategory,
} from '../../../src/core/metadata/schema.js';

describe('Metadata Schema', () => {
  describe('REQUIRED_FIELDS', () => {
    it('should have 6 required fields', () => {
      expect(REQUIRED_FIELDS).toHaveLength(6);
    });

    it('should include core required fields', () => {
      expect(REQUIRED_FIELDS).toContain('title');
      expect(REQUIRED_FIELDS).toContain('tier');
      expect(REQUIRED_FIELDS).toContain('domains');
      expect(REQUIRED_FIELDS).toContain('status');
      expect(REQUIRED_FIELDS).toContain('last_updated');
      expect(REQUIRED_FIELDS).toContain('version');
    });
  });

  describe('ALL_METADATA_FIELDS', () => {
    it('should have 21 fields', () => {
      expect(ALL_METADATA_FIELDS).toHaveLength(21);
    });
  });

  describe('validateMetadata', () => {
    it('should validate correct metadata', () => {
      const validMetadata = {
        title: 'Test Document',
        tier: 'guide',
        domains: ['security'],
        audience: ['all'],
        tags: ['test'],
        status: 'active',
        last_updated: '2025-01-01',
        version: '1.0.0',
      };

      const result = validateMetadata(validMetadata);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid tier', () => {
      const invalidMetadata = {
        title: 'Test',
        tier: 'invalid-tier',
        domains: ['security'],
        status: 'active',
        last_updated: '2025-01-01',
        version: '1.0.0',
      };

      const result = validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid date format', () => {
      const invalidMetadata = {
        title: 'Test',
        tier: 'guide',
        domains: ['security'],
        status: 'active',
        last_updated: '01-01-2025', // Wrong format
        version: '1.0.0',
      };

      const result = validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid version format', () => {
      const invalidMetadata = {
        title: 'Test',
        tier: 'guide',
        domains: ['security'],
        status: 'active',
        last_updated: '2025-01-01',
        version: '1.0', // Missing patch version
      };

      const result = validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
    });
  });

  describe('validatePartialMetadata', () => {
    it('should validate partial metadata', () => {
      const partialMetadata = {
        title: 'Test Document',
        tier: 'guide',
      };

      const result = validatePartialMetadata(partialMetadata);
      expect(result.valid).toBe(true);
    });

    it('should still reject invalid values', () => {
      const partialMetadata = {
        tier: 'invalid-tier',
      };

      const result = validatePartialMetadata(partialMetadata);
      expect(result.valid).toBe(false);
    });
  });

  describe('getMissingRequiredFields', () => {
    it('should return missing required fields', () => {
      const data = {
        title: 'Test',
        tier: 'guide',
      };

      const missing = getMissingRequiredFields(data);
      expect(missing).toContain('domains');
      expect(missing).toContain('status');
      expect(missing).toContain('last_updated');
      expect(missing).toContain('version');
      expect(missing).not.toContain('title');
      expect(missing).not.toContain('tier');
    });

    it('should return empty array when all required fields present', () => {
      const data = {
        title: 'Test',
        tier: 'guide',
        domains: ['security'],
        status: 'active',
        last_updated: '2025-01-01',
        version: '1.0.0',
      };

      const missing = getMissingRequiredFields(data);
      expect(missing).toHaveLength(0);
    });
  });

  describe('getMissingFields', () => {
    it('should return both required and optional missing fields', () => {
      const data = {
        title: 'Test',
      };

      const { required, optional } = getMissingFields(data);

      expect(required).toContain('tier');
      expect(required).toContain('domains');
      expect(optional).toContain('purpose');
      expect(optional).toContain('author');
    });
  });

  describe('calculateMetadataCompleteness', () => {
    it('should calculate 100% for complete metadata', () => {
      const data: Record<string, unknown> = {};
      for (const field of ALL_METADATA_FIELDS) {
        data[field] = 'value';
      }

      const completeness = calculateMetadataCompleteness(data);
      expect(completeness).toBe(100);
    });

    it('should calculate correct percentage for partial metadata', () => {
      const data = {
        title: 'Test',
        tier: 'guide',
        domains: ['security'],
        status: 'active',
        last_updated: '2025-01-01',
        version: '1.0.0',
      };

      const completeness = calculateMetadataCompleteness(data);
      // 6 out of 21 fields = ~28.57%
      expect(completeness).toBeCloseTo(28.57, 1);
    });

    it('should return 0 for empty metadata', () => {
      const completeness = calculateMetadataCompleteness({});
      expect(completeness).toBe(0);
    });
  });

  describe('getFieldCategory', () => {
    it('should categorize core fields', () => {
      expect(getFieldCategory('title')).toBe('core');
      expect(getFieldCategory('tier')).toBe('core');
      expect(getFieldCategory('domains')).toBe('core');
    });

    it('should categorize status fields', () => {
      expect(getFieldCategory('status')).toBe('status');
      expect(getFieldCategory('last_updated')).toBe('status');
      expect(getFieldCategory('version')).toBe('status');
    });

    it('should categorize auto-generated fields', () => {
      expect(getFieldCategory('word_count')).toBe('auto');
      expect(getFieldCategory('estimated_read_time')).toBe('auto');
      expect(getFieldCategory('backlinks')).toBe('auto');
    });
  });
});
