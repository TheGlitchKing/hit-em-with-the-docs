/**
 * Document tier classification system.
 * Classifies documents into 5 tiers based on content structure.
 */

export const TIERS = ['guide', 'standard', 'example', 'reference', 'admin'] as const;
export type Tier = (typeof TIERS)[number];

export interface TierDefinition {
  id: Tier;
  name: string;
  description: string;
  sizeRange: { min: number; max: number }; // in KB
  indicators: string[];
  headingPatterns: RegExp[];
}

export const TIER_DEFINITIONS: Record<Tier, TierDefinition> = {
  guide: {
    id: 'guide',
    name: 'Guide',
    description: 'Step-by-step how-to guides',
    sizeRange: { min: 15, max: 30 },
    indicators: [
      'how to', 'step by step', 'tutorial', 'guide', 'walkthrough',
      'getting started', 'learn', 'implement', 'build', 'create',
    ],
    headingPatterns: [
      /^#+\s*(prerequisites?|requirements?)/i,
      /^#+\s*(step\s*\d+|first|next|then|finally)/i,
      /^#+\s*(overview|introduction|getting started)/i,
      /^#+\s*(example|demo|try it)/i,
    ],
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Coding standards and conventions',
    sizeRange: { min: 5, max: 15 },
    indicators: [
      'standard', 'convention', 'rule', 'must', 'should', 'must not',
      'should not', 'required', 'recommended', 'best practice', 'guideline',
    ],
    headingPatterns: [
      /^#+\s*(rules?|guidelines?|conventions?)/i,
      /^#+\s*(do|don'?t|avoid|prefer)/i,
      /^#+\s*(naming|formatting|style)/i,
      /^#+\s*(required|recommended|optional)/i,
    ],
  },
  example: {
    id: 'example',
    name: 'Example',
    description: 'Code examples and templates',
    sizeRange: { min: 3, max: 10 },
    indicators: [
      'example', 'sample', 'template', 'snippet', 'code', 'demo',
      'showcase', 'pattern example', 'usage example',
    ],
    headingPatterns: [
      /^#+\s*(example|sample|template)/i,
      /^#+\s*(code|snippet|usage)/i,
      /^#+\s*(input|output|result)/i,
    ],
  },
  reference: {
    id: 'reference',
    name: 'Reference',
    description: 'Comprehensive references',
    sizeRange: { min: 30, max: 100 },
    indicators: [
      'reference', 'specification', 'api', 'complete', 'comprehensive',
      'all', 'full list', 'documentation', 'schema', 'interface',
    ],
    headingPatterns: [
      /^#+\s*(api|schema|interface|type)/i,
      /^#+\s*(parameters?|arguments?|options?)/i,
      /^#+\s*(methods?|functions?|endpoints?)/i,
      /^#+\s*(properties|fields|attributes)/i,
    ],
  },
  admin: {
    id: 'admin',
    name: 'Admin',
    description: 'Administrative/operational docs',
    sizeRange: { min: 10, max: 20 },
    indicators: [
      'admin', 'administrative', 'operational', 'maintenance', 'ops',
      'manage', 'configure', 'setup', 'deployment', 'monitoring',
    ],
    headingPatterns: [
      /^#+\s*(configuration|setup|installation)/i,
      /^#+\s*(maintenance|monitoring|logging)/i,
      /^#+\s*(backup|restore|recovery)/i,
      /^#+\s*(troubleshooting|debugging)/i,
    ],
  },
};

export interface TierClassificationResult {
  tier: Tier;
  confidence: number; // 0-1
  scores: Record<Tier, number>;
  reasoning: string[];
}

/**
 * Classify document content into a tier
 */
export function classifyTier(content: string): TierClassificationResult {
  const scores: Record<Tier, number> = {
    guide: 0,
    standard: 0,
    example: 0,
    reference: 0,
    admin: 0,
  };

  const reasoning: string[] = [];
  const lowerContent = content.toLowerCase();

  // Calculate content size in KB
  const sizeKB = Buffer.byteLength(content, 'utf8') / 1024;

  // Score based on indicators
  for (const tier of TIERS) {
    const def = TIER_DEFINITIONS[tier];

    // Check indicators
    for (const indicator of def.indicators) {
      const regex = new RegExp(`\\b${escapeRegExp(indicator)}\\b`, 'gi');
      const matches = lowerContent.match(regex);
      if (matches) {
        scores[tier] += matches.length * 2;
        if (matches.length >= 3) {
          reasoning.push(`Found indicator "${indicator}" ${matches.length} times (${tier})`);
        }
      }
    }

    // Check heading patterns
    for (const pattern of def.headingPatterns) {
      const matches = content.match(new RegExp(pattern.source, 'gim'));
      if (matches) {
        scores[tier] += matches.length * 5;
        reasoning.push(`Matched heading pattern for ${tier}: ${matches.length} matches`);
      }
    }

    // Size-based scoring
    if (sizeKB >= def.sizeRange.min && sizeKB <= def.sizeRange.max) {
      scores[tier] += 10;
      reasoning.push(`Size ${sizeKB.toFixed(1)}KB matches ${tier} range`);
    }
  }

  // Additional heuristics

  // Code block ratio indicates example or reference
  const codeBlockCount = (content.match(/```/g) ?? []).length / 2;
  const lines = content.split('\n').length;
  const codeRatio = codeBlockCount / (lines / 50);

  if (codeRatio > 0.5) {
    scores.example += 15;
    reasoning.push('High code block ratio suggests example');
  }

  // Bullet/numbered list ratio indicates guide or standard
  const listItems = (content.match(/^[\s]*[-*\d.]+\s/gm) ?? []).length;
  const listRatio = listItems / lines;

  if (listRatio > 0.3) {
    scores.guide += 10;
    scores.standard += 8;
    reasoning.push('High list ratio suggests guide or standard');
  }

  // Table presence indicates reference
  const tables = (content.match(/^\|.*\|$/gm) ?? []).length;
  if (tables > 5) {
    scores.reference += 15;
    reasoning.push('Multiple tables suggest reference');
  }

  // Warning/Note boxes indicate admin or troubleshooting
  const warnings = (content.match(/>\s*\*\*(warning|note|caution|important)/gi) ?? []).length;
  if (warnings > 2) {
    scores.admin += 10;
    reasoning.push('Warning boxes suggest admin documentation');
  }

  // Find the winning tier
  let maxScore = 0;
  let winningTier: Tier = 'guide';

  for (const tier of TIERS) {
    if (scores[tier] > maxScore) {
      maxScore = scores[tier];
      winningTier = tier;
    }
  }

  // Calculate confidence based on score difference
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const topScore = sortedScores[0] ?? 0;
  const secondScore = sortedScores[1] ?? 0;
  const scoreDiff = topScore - secondScore;

  let confidence = 0.5;
  if (topScore > 0) {
    confidence = Math.min(0.5 + (scoreDiff / topScore) * 0.3 + (topScore / 100) * 0.2, 0.95);
  }

  return {
    tier: winningTier,
    confidence,
    scores,
    reasoning,
  };
}

/**
 * Get tier definition by ID
 */
export function getTierDefinition(tier: Tier): TierDefinition {
  return TIER_DEFINITIONS[tier];
}

/**
 * Check if a string is a valid tier
 */
export function isValidTier(value: string): value is Tier {
  return TIERS.includes(value as Tier);
}

/**
 * Get tier display name
 */
export function getTierDisplayName(tier: Tier): string {
  return TIER_DEFINITIONS[tier].name;
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
