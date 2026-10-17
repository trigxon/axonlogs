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

    // Expected views contract: chat inbox | conversation | profile | settings
    const expectedViews = ['chat', 'profile', 'settings'];

    // Instagram-style chat-only shell: rail + inbox + conversation + profile
    const chatAppPath = path.join(projectRoot, 'src', 'components', 'layout', 'ChatApp.tsx');
    const inboxPath = path.join(projectRoot, 'src', 'components', 'chat', 'InboxPanel.tsx');
    const conversationPath = path.join(projectRoot, 'src', 'components', 'chat', 'ConversationPanel.tsx');
    const profilePath = path.join(projectRoot, 'src', 'components', 'profile', 'ProfilePanel.tsx');
    const settingsPath = path.join(projectRoot, 'src', 'components', 'settings', 'SettingsPanel.tsx');

    const requiredComponents = [
      { name: 'ChatApp.tsx', path: chatAppPath },
      { name: 'InboxPanel.tsx', path: inboxPath },
      { name: 'ConversationPanel.tsx', path: conversationPath },
      { name: 'ProfilePanel.tsx', path: profilePath },
      { name: 'SettingsPanel.tsx', path: settingsPath },
    ];

    const missingComponents = requiredComponents.filter(c => !fs.existsSync(c.path));

    // Distraction-free contract: the old terminal views must be gone
    const retiredComponents = [
      'src/components/layout/TerminalUI.tsx',
      'src/components/layout/Sidebar.tsx',
      'src/components/ai/AxonAIShell.tsx',
      'src/components/logs/LogsView.tsx',
    ].map(p => path.join(projectRoot, p));

    const lingering = retiredComponents.filter(p => fs.existsSync(p));

    if (missingComponents.length > 0 || lingering.length > 0) {
      results.push({
        name: 'Tier 1.2: Chat-Only Navigation Contract (inbox | chat | profile | settings)',
        tier: 1,
        passed: false,
        error: `Missing: ${missingComponents.map(c => c.name).join(', ') || 'none'}; Lingering: ${lingering.map(p => path.basename(p)).join(', ') || 'none'}`,
        durationMs: Date.now() - navStart,
      });
    } else {
      results.push({
        name: 'Tier 1.2: Chat-Only Navigation Contract (inbox | chat | profile | settings)',
        tier: 1,
        passed: true,
        durationMs: Date.now() - navStart,
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Tier 1.2: Chat-Only Navigation Contract (inbox | chat | profile | settings)',
      tier: 1,
      passed: false,
      error: err.message,
      durationMs: Date.now() - navStart,
    });
  }

  return results;
}
