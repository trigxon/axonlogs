import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTier1Tests, type TestResult } from './tier1_build_and_navigation.test.ts';
import { runTier2Tests } from './tier2_dynamic_settings.test.ts';
import { runTier3Tests } from './tier3_data_export_import.test.ts';
import { runTier4Tests } from './tier4_danger_zone_reset.test.ts';
import { runTier5Tests } from './tier5_typewriter_cursor.test.ts';
import { runTier6Tests } from './tier6_webrtc_calls.test.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  console.log('====================================================');
  console.log('        AXON LOGS E2E TEST SUITE RUNNER            ');
  console.log('====================================================\n');
  console.log(`Project Root: ${projectRoot}`);
  console.log(`Execution Time: ${new Date().toISOString()}\n`);

  const startTime = Date.now();
  const allResults: TestResult[] = [];

  console.log('--- Executing Tier 1: Build & View Navigation ---');
  const t1 = await runTier1Tests(projectRoot);
  allResults.push(...t1);

  console.log('--- Executing Tier 2: Dynamic Settings CSS Variables ---');
  const t2 = await runTier2Tests(projectRoot);
  allResults.push(...t2);

  console.log('--- Executing Tier 3: Data Export & Import ---');
  const t3 = await runTier3Tests(projectRoot);
  allResults.push(...t3);

  console.log('--- Executing Tier 4: Danger Zone Reset ---');
  const t4 = await runTier4Tests(projectRoot);
  allResults.push(...t4);

  console.log('--- Executing Tier 5: Typewriter & Cursor Contract ---');
  const t5 = await runTier5Tests(projectRoot);
  allResults.push(...t5);

  console.log('--- Executing Tier 6: WebRTC Calling Contract ---');
  const t6 = await runTier6Tests(projectRoot);
  allResults.push(...t6);

  const totalDuration = Date.now() - startTime;

  console.log('\n====================================================');
  console.log('                TEST RESULTS SUMMARY                ');
  console.log('====================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  for (const r of allResults) {
    const icon = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[Tier ${r.tier}] ${icon} - ${r.name} (${r.durationMs}ms)`);
    if (!r.passed && r.error) {
      console.log(`         Error: ${r.error.replace(/\n/g, '\n                ')}`);
      failedCount++;
    } else {
      passedCount++;
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(`Total Executed: ${allResults.length}`);
  console.log(`Passed:         ${passedCount}`);
  console.log(`Failed:         ${failedCount}`);
  console.log(`Total Duration: ${totalDuration}ms`);
  console.log('----------------------------------------------------\n');

  if (failedCount > 0) {
    console.error(`❌ Suite finished with ${failedCount} failure(s).`);
    process.exit(1);
  } else {
    console.log('✅ All tests passed successfully!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
