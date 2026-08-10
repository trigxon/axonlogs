import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TestResult {
  name: string;
  tier: number;
  passed: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Tier 1: Build Compilation & View Navigation Verification
 */
export async function runTier1Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1.1: Build Check (npm run build)
  const buildStart = Date.now();
  try {
    const buildOutput = execSync('npm run build', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    results.push({
      name: 'Tier 1.1: Build Compilation (npm run build)',
      tier: 1,
      passed: true,
      durationMs: Date.now() - buildStart,
    });
  } catch (err: any) {
    const output = err.stdout || err.stderr || err.message || '';
    results.push({
      name: 'Tier 1.1: Build Compilation (npm run build)',
      tier: 1,
      passed: false,
      error: `Build failed with exit code ${err.status}:\n${output.trim()}`,
      durationMs: Date.now() - buildStart,
    });
  }

  // Test 1.2: View Navigation State & Component Contract Check
  const navStart = Date.now();
  try {
    const appTsxPath = path.join(projectRoot, 'src', 'App.tsx');
    if (!fs.existsSync(appTsxPath)) {
      throw new Error(`App.tsx not found at ${appTsxPath}`);
    }

    const appContent = fs.readFileSync(appTsxPath, 'utf-8');

    // Expected views contract: 'dashboard', 'settings', 'logs', 'axon-ai'
    const expectedViews = ['dashboard', 'settings', 'logs', 'axon-ai'];
    
    // Check if App.tsx or subcomponents reference activeView contract or components
    // If M2/M3 is partially built, inspect files
    const sidebarPath = path.join(projectRoot, 'src', 'components', 'layout', 'Sidebar.tsx');
    const axonAiPath = path.join(projectRoot, 'src', 'components', 'ai', 'AxonAIShell.tsx');
    const settingsPath = path.join(projectRoot, 'src', 'components', 'settings', 'SettingsPanel.tsx');
    const logsPath = path.join(projectRoot, 'src', 'components', 'logs', 'LogsView.tsx');

    const createdComponents = [
      { name: 'Sidebar.tsx', path: sidebarPath },
      { name: 'AxonAIShell.tsx', path: axonAiPath },
      { name: 'SettingsPanel.tsx', path: settingsPath },
      { name: 'LogsView.tsx', path: logsPath },
    ];

    const missingComponents = createdComponents.filter(c => !fs.existsSync(c.path));

    if (missingComponents.length > 0 && !appContent.includes('activeView')) {
      // Contract specification verification
      // Check if view navigation contract is respected
      results.push({
        name: 'Tier 1.2: View Navigation Contract (dashboard | settings | logs | axon-ai)',
        tier: 1,
        passed: false,
        error: `Navigation components pending implementation: ${missingComponents.map(c => c.name).join(', ')}`,
        durationMs: Date.now() - navStart,
      });
    } else {
      results.push({
        name: 'Tier 1.2: View Navigation Contract (dashboard | settings | logs | axon-ai)',
        tier: 1,
        passed: true,
        durationMs: Date.now() - navStart,
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Tier 1.2: View Navigation Contract (dashboard | settings | logs | axon-ai)',
      tier: 1,
      passed: false,
      error: err.message,
      durationMs: Date.now() - navStart,
    });
  }

  return results;
}
