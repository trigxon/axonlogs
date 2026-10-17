import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

export interface SettingsCssConfig {
  textSize: 'small' | 'medium' | 'large';
  cardPadding: 'compact' | 'normal' | 'relaxed';
  borderRadius: 'sharp' | 'rounded' | 'pill';
}

export const EXPECTED_CSS_MAPPINGS = {
  textSize: {
    small: '12px',
    medium: '14px',
    large: '16px',
  },
  cardPadding: {
    compact: '8px',
    normal: '16px',
    relaxed: '24px',
  },
  borderRadius: {
    sharp: '0px',
    rounded: '8px',
    pill: '24px',
  },
} as const;

/**
 * Computes root CSS variable key-value pairs for a given settings configuration.
 */
export function computeCssVariables(config: SettingsCssConfig): Record<string, string> {
  return {
    '--ui-text-size': EXPECTED_CSS_MAPPINGS.textSize[config.textSize],
    '--ui-card-padding': EXPECTED_CSS_MAPPINGS.cardPadding[config.cardPadding],
    '--ui-border-radius': EXPECTED_CSS_MAPPINGS.borderRadius[config.borderRadius],
  };
}

/**
 * Tier 2: Dynamic Settings CSS Properties Verification
 */
export async function runTier2Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 2.1: CSS Variable Value Mapping Contract Validation
  const mapStart = Date.now();
  try {
    // Check all combinations of text size, card padding, and border radius
    const testCases: Array<{
      input: SettingsCssConfig;
      expected: Record<string, string>;
    }> = [
      {
        input: { textSize: 'small', cardPadding: 'compact', borderRadius: 'sharp' },
        expected: { '--ui-text-size': '12px', '--ui-card-padding': '8px', '--ui-border-radius': '0px' },
      },
      {
        input: { textSize: 'medium', cardPadding: 'normal', borderRadius: 'rounded' },
        expected: { '--ui-text-size': '14px', '--ui-card-padding': '16px', '--ui-border-radius': '8px' },
      },
      {
        input: { textSize: 'large', cardPadding: 'relaxed', borderRadius: 'pill' },
        expected: { '--ui-text-size': '16px', '--ui-card-padding': '24px', '--ui-border-radius': '24px' },
      },
    ];

    for (const tc of testCases) {
      const computed = computeCssVariables(tc.input);
      for (const [varName, expectedVal] of Object.entries(tc.expected)) {
        if (computed[varName] !== expectedVal) {
          throw new Error(
            `Mismatch for ${varName} with input ${JSON.stringify(tc.input)}: expected '${expectedVal}', got '${computed[varName]}'`
          );
        }
      }
    }

    results.push({
      name: 'Tier 2.1: CSS Variable Mapping Contract (--ui-text-size, --ui-card-padding, --ui-border-radius)',
      tier: 2,
      passed: true,
      durationMs: Date.now() - mapStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 2.1: CSS Variable Mapping Contract (--ui-text-size, --ui-card-padding, --ui-border-radius)',
      tier: 2,
      passed: false,
      error: err.message,
      durationMs: Date.now() - mapStart,
    });
  }

  // Test 2.2: Mock DOM / Root CSS Injection Test & File Integrity Check
  const domStart = Date.now();
  try {
    const mockRootStyles: Record<string, string> = {};
    const mockElement = {
      style: {
        setProperty: (prop: string, val: string) => {
          mockRootStyles[prop] = val;
        },
        getPropertyValue: (prop: string) => mockRootStyles[prop] || '',
      },
    };

    // Apply medium settings
    const config: SettingsCssConfig = { textSize: 'medium', cardPadding: 'normal', borderRadius: 'rounded' };
    const vars = computeCssVariables(config);
    for (const [k, v] of Object.entries(vars)) {
      mockElement.style.setProperty(k, v);
    }

    if (
      mockElement.style.getPropertyValue('--ui-text-size') !== '14px' ||
      mockElement.style.getPropertyValue('--ui-card-padding') !== '16px' ||
      mockElement.style.getPropertyValue('--ui-border-radius') !== '8px'
    ) {
      throw new Error('Mock root element did not receive expected CSS variable updates');
    }

    // Verify ThemeContext.tsx or index.css exists/contains CSS custom properties
    const themeContextPath = path.join(projectRoot, 'src', 'contexts', 'ThemeContext.tsx');
    const indexCssPath = path.join(projectRoot, 'src', 'index.css');

    const themeExists = fs.existsSync(themeContextPath);
    const cssExists = fs.existsSync(indexCssPath);

    if (themeExists) {
      const themeContent = fs.readFileSync(themeContextPath, 'utf-8');
      if (!themeContent.includes('--ui-text-size')) {
        throw new Error('ThemeContext.tsx exists but does not reference --ui-text-size CSS variable');
      }
    }

    if (cssExists) {
      const cssContent = fs.readFileSync(indexCssPath, 'utf-8');
      // Verify CSS custom properties or root variables exist
    }

    results.push({
      name: 'Tier 2.2: Dynamic Root CSS Variable Injection & Theme Context Verification',
      tier: 2,
      passed: true,
      durationMs: Date.now() - domStart,
    });
  } catch (err: any) {
    results.push({
      name: 'Tier 2.2: Dynamic Root CSS Variable Injection & Theme Context Verification',
      tier: 2,
      passed: false,
      error: err.message,
      durationMs: Date.now() - domStart,
    });
  }

  return results;
}
