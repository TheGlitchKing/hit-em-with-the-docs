import { describe, it, expect } from 'vitest';
import {
  TIERS,
  TIER_DEFINITIONS,
  classifyTier,
  getTierDefinition,
  isValidTier,
  getTierDisplayName,
  LIFECYCLE_TRACKED_TIERS,
  isLifecycleTrackedTier,
} from '../../../src/core/domains/classifier.js';

describe('Tier Classifier', () => {
  describe('TIERS', () => {
    it('should have 9 tiers (added "plan" in 2.2.0; "fact", "incident-narrative", "incident-facts" in 2.3.0)', () => {
      expect(TIERS).toHaveLength(9);
    });

    it('should include all expected tiers', () => {
      expect(TIERS).toContain('guide');
      expect(TIERS).toContain('standard');
      expect(TIERS).toContain('example');
      expect(TIERS).toContain('reference');
      expect(TIERS).toContain('admin');
      expect(TIERS).toContain('plan');
      expect(TIERS).toContain('fact');
      expect(TIERS).toContain('incident-narrative');
      expect(TIERS).toContain('incident-facts');
    });
  });

  describe('TIER_DEFINITIONS', () => {
    it('should have a definition for each tier', () => {
      for (const tier of TIERS) {
        expect(TIER_DEFINITIONS[tier]).toBeDefined();
      }
    });

    it('should have required properties', () => {
      for (const tier of TIERS) {
        const def = TIER_DEFINITIONS[tier];
        expect(def.id).toBe(tier);
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.indicators).toBeInstanceOf(Array);
        expect(def.headingPatterns).toBeInstanceOf(Array);
        expect(def.sizeRange.min).toBeLessThan(def.sizeRange.max);
      }
    });
  });

  describe('classifyTier', () => {
    it('should classify guide content', () => {
      const guideContent = `
# How to Setup Authentication

## Overview
This guide shows you how to set up authentication.

## Prerequisites
- Node.js installed
- Database configured

## Step 1: Install dependencies
First, install the required packages.

## Step 2: Configure settings
Next, configure your settings.

## Step 3: Test the setup
Finally, test everything works.
`;

      const result = classifyTier(guideContent);
      expect(result.tier).toBe('guide');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify standard content', () => {
      const standardContent = `
# API Design Standards

## Rules

### Rule 1: Use REST conventions
You MUST use REST conventions for all endpoints.

**DO:**
- Use nouns for resources

**DON'T:**
- Use verbs in URLs

### Rule 2: Naming conventions
All endpoints SHOULD follow kebab-case naming.

## Guidelines
Follow these best practices for consistent API design.
`;

      const result = classifyTier(standardContent);
      expect(['standard', 'guide']).toContain(result.tier);
    });

    it('should classify example content', () => {
      const exampleContent = `
# React Component Example

## Code

\`\`\`typescript
export function Button({ label }: Props) {
  return <button>{label}</button>;
}
\`\`\`

## Usage

\`\`\`typescript
<Button label="Click me" />
\`\`\`

## Output
Renders a button with the label.
`;

      const result = classifyTier(exampleContent);
      expect(['example', 'guide']).toContain(result.tier);
    });

    it('should classify reference content', () => {
      const referenceContent = `
# API Reference

## Endpoints

### GET /api/users

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number |
| limit | number | No | Items per page |

### POST /api/users

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | User name |
| email | string | Yes | User email |

## Types

### User

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique ID |
| name | string | Display name |

## Methods

### getUser(id)
Returns a user by ID.
`;

      const result = classifyTier(referenceContent);
      expect(['reference', 'admin']).toContain(result.tier);
    });

    it('should return confidence between 0 and 1', () => {
      const content = 'Some random content';
      const result = classifyTier(content);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should return scores for all tiers', () => {
      const content = 'Some content here';
      const result = classifyTier(content);

      for (const tier of TIERS) {
        expect(result.scores).toHaveProperty(tier);
      }
    });
  });

  describe('getTierDefinition', () => {
    it('should return the correct definition', () => {
      const guideDef = getTierDefinition('guide');
      expect(guideDef.id).toBe('guide');
      expect(guideDef.name).toBe('Guide');
    });
  });

  describe('isValidTier', () => {
    it('should return true for valid tiers', () => {
      expect(isValidTier('guide')).toBe(true);
      expect(isValidTier('standard')).toBe(true);
      expect(isValidTier('admin')).toBe(true);
      expect(isValidTier('plan')).toBe(true);
      expect(isValidTier('fact')).toBe(true);
      expect(isValidTier('incident-narrative')).toBe(true);
      expect(isValidTier('incident-facts')).toBe(true);
    });

    it('should return false for invalid tiers', () => {
      expect(isValidTier('invalid')).toBe(false);
      expect(isValidTier('')).toBe(false);
      expect(isValidTier('GUIDE')).toBe(false);
      expect(isValidTier('incident')).toBe(false); // must be incident-narrative or incident-facts
      expect(isValidTier('playbook-symptoms')).toBe(false); // symptoms is a field, not a tier
    });
  });

  describe('getTierDisplayName', () => {
    it('should return display names', () => {
      expect(getTierDisplayName('guide')).toBe('Guide');
      expect(getTierDisplayName('standard')).toBe('Standard');
      expect(getTierDisplayName('admin')).toBe('Admin');
      expect(getTierDisplayName('plan')).toBe('Plan');
    });
  });

  // --- 2.3.0: knowledge-base tiers ---
  describe('LIFECYCLE_TRACKED_TIERS (2.3.0)', () => {
    it('includes plan, fact, incident-narrative, incident-facts', () => {
      expect(LIFECYCLE_TRACKED_TIERS).toContain('plan');
      expect(LIFECYCLE_TRACKED_TIERS).toContain('fact');
      expect(LIFECYCLE_TRACKED_TIERS).toContain('incident-narrative');
      expect(LIFECYCLE_TRACKED_TIERS).toContain('incident-facts');
    });

    it('does NOT include doc-style tiers', () => {
      expect(LIFECYCLE_TRACKED_TIERS).not.toContain('guide');
      expect(LIFECYCLE_TRACKED_TIERS).not.toContain('standard');
      expect(LIFECYCLE_TRACKED_TIERS).not.toContain('example');
      expect(LIFECYCLE_TRACKED_TIERS).not.toContain('reference');
      expect(LIFECYCLE_TRACKED_TIERS).not.toContain('admin');
    });

    it('isLifecycleTrackedTier returns true only for lifecycle tiers', () => {
      expect(isLifecycleTrackedTier('plan')).toBe(true);
      expect(isLifecycleTrackedTier('fact')).toBe(true);
      expect(isLifecycleTrackedTier('incident-narrative')).toBe(true);
      expect(isLifecycleTrackedTier('incident-facts')).toBe(true);
      expect(isLifecycleTrackedTier('guide')).toBe(false);
      expect(isLifecycleTrackedTier('admin')).toBe(false);
      expect(isLifecycleTrackedTier(undefined)).toBe(false);
      expect(isLifecycleTrackedTier(null)).toBe(false);
      expect(isLifecycleTrackedTier('')).toBe(false);
      expect(isLifecycleTrackedTier('FACT')).toBe(false);
    });
  });

  describe('fact tier (2.3.0)', () => {
    it('TIER_DEFINITIONS.fact has the right shape', () => {
      const def = TIER_DEFINITIONS.fact;
      expect(def).toBeDefined();
      expect(def.id).toBe('fact');
      expect(def.name).toBe('Fact');
      expect(def.indicators).toContain('claim');
      expect(def.indicators).toContain('confidence');
      expect(def.indicators).toContain('provenance');
    });

    it('classifyTier scores fact-shaped content into the fact tier', () => {
      const factContent = `
# Alloy reads env only at entrypoint

## Claim
Grafana Alloy reads environment variables at entrypoint only, never refreshing them mid-run.

## How to verify
\`docker exec alloy printenv VAR\` after restart shows the new value; without restart shows old.

## Consequences
Updating Vault tokens via .env requires a container restart, not a config reload.

## Provenance
Confidence: high. Last verified: 2026-05-14.
`;
      const result = classifyTier(factContent);
      expect(result.tier).toBe('fact');
    });
  });

  describe('incident-narrative tier (2.3.0)', () => {
    it('TIER_DEFINITIONS["incident-narrative"] has the right shape', () => {
      const def = TIER_DEFINITIONS['incident-narrative'];
      expect(def).toBeDefined();
      expect(def.id).toBe('incident-narrative');
      expect(def.name).toBe('Incident narrative');
      expect(def.indicators).toContain('postmortem');
      expect(def.indicators).toContain('severity');
      expect(def.indicators).toContain('root cause');
    });

    it('classifyTier scores postmortem-shaped content into incident-narrative', () => {
      const postmortemContent = `
# Postmortem: Vault Down on Auth-Staging

## Timeline
- 14:02 — Alert fires for Vault on-call
- 14:05 — On-call investigates, finds Vault is fine
- 14:15 — Root cause identified: Alloy scrape worker stuck

## Root Cause
Grafana Alloy's scrape worker was stuck on a stale connection.

## Impact
Severity: high. False positive page during off-hours.

## Resolution
Restarted Alloy container.

## Lessons Learned
- Alloy can produce false-positive metric outages
- On-call playbook should check Alloy before assuming Vault outage
`;
      const result = classifyTier(postmortemContent);
      expect(result.tier).toBe('incident-narrative');
    });
  });

  // --- 2.2.0: plan tier ---
  describe('plan tier (2.2.0)', () => {
    it('TIER_DEFINITIONS.plan has the right shape', () => {
      const def = TIER_DEFINITIONS.plan;
      expect(def).toBeDefined();
      expect(def.id).toBe('plan');
      expect(def.name).toBe('Plan');
      expect(def.indicators).toContain('phase');
      expect(def.indicators).toContain('task');
      expect(def.indicators).toContain('atom');
    });

    it('classifyTier scores plan-shaped content into the plan tier', () => {
      const planContent = `
# Task Plan: Migrate to Postgres

## Goal
Migrate from MySQL to Postgres without downtime.

## Scope at a glance
Three phases.

## Phases

### Phase 1: Schema port
- [ ] Atom: dump schema
- [ ] Atom: convert types
- [ ] Atom: validate

## Decisions Made
- Use logical replication for the cutover

## Status
Phase 1 in progress
`;
      const result = classifyTier(planContent);
      // Plan-shaped content should win the classification
      expect(result.tier).toBe('plan');
    });
  });
});
