import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

function makeResult(name: string, passed: boolean, details: string): TestResult {
  return { name, tier: 5, passed, error: passed ? undefined : details, durationMs: 0 };
}

/**
 * Tier 5: Typewriter & Cursor Contract
 *
 * Guards the typewriter integration against known regressions:
 *  1. onComplete must live in a ref (a changing callback identity used to
 *     restart the animation on every parent re-render — the clock re-renders
 *     TerminalUI every second).
 *  2. Historical messages must not replay the animation on page load
 *     (freshness gate on created_at).
 *  3. rAF loop must be cancelled on unmount.
 *  4. cursor-blink (element opacity) and caret-blink (caret-color) must be
 *     distinct keyframes so inputs never flash their whole body.
 */
export async function runTier5Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ── 5.1: TypewriterText stabilises onComplete via ref ──────────────────
  try {
    const src = fs.readFileSync(
      path.join(projectRoot, 'src/components/ui/TypewriterText.tsx'),
      'utf8'
    );
    const hasRef = /onCompleteRef\s*=\s*useRef/.test(src);
    const refUsedInEffect = /onCompleteRef\.current\?\.\(\)/.test(src);
    const notInDeps = !/\[\s*text,\s*speed,\s*onComplete\s*\]/.test(src);
    const cancelsRaf = /cancelAnimationFrame/.test(src);
    const hasAnimateGate = /animate\s*\??:\s*boolean|animate = true/.test(src);

    const passed = hasRef && refUsedInEffect && notInDeps && cancelsRaf && hasAnimateGate;
    results.push(makeResult(
      'Tier 5.1: TypewriterText onComplete ref stabilisation & rAF cleanup',
      passed,
      passed
        ? 'onComplete stored in ref, excluded from effect deps, rAF cancelled, animate prop present'
        : `hasRef=${hasRef} refUsedInEffect=${refUsedInEffect} notInDeps=${notInDeps} cancelsRaf=${cancelsRaf} hasAnimateGate=${hasAnimateGate}`
    ));
  } catch (err) {
    results.push(makeResult('Tier 5.1: TypewriterText onComplete ref stabilisation & rAF cleanup', false, String(err)));
  }

  // ── 5.2: Freshness gate in ConversationPanel (no replay of history) ──────
  try {
    const src = fs.readFileSync(
      path.join(projectRoot, 'src/components/chat/ConversationPanel.tsx'),
      'utf8'
    );
    const freshnessGate = /!animatedMsgs\.has\(msg\.id\)\s*&&\s*Date\.now\(\)\s*-\s*(?:new Date\(msg\.created_at\)\.getTime\(\)|t)\s*<\s*\d+/.test(src);
    const stampsT = /const t = new Date\(msg\.created_at\)\.getTime\(\)/.test(src);
    const skipsSelf = /!isSelf\s*&&/.test(src);

    const passed = freshnessGate && skipsSelf && stampsT;
    results.push(makeResult(
      'Tier 5.2: Typewriter freshness gate (history renders instantly, own messages never animate)',
      passed,
      passed
        ? 'TypewriterText only mounts for non-self messages newer than the freshness window'
        : `freshnessGate=${freshnessGate} skipsSelf=${skipsSelf}`
    ));
  } catch (err) {
    results.push(makeResult('Tier 5.2: Typewriter freshness gate', false, String(err)));
  }

  // ── 5.3: Distinct cursor/caret keyframes in CSS ────────────────────────
  try {
    const css = fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf8');
    const hasCursorBlink = /@keyframes cursor-blink\s*\{[^}]*opacity/.test(css);
    const hasCaretBlink = /@keyframes caret-blink\s*\{[^}]*caret-color/.test(css);
    const axonCaretUsesCaret = /\.axon-caret\s*\{[^}]*animation:\s*caret-blink/.test(css);

    // cursor-blink must NOT animate caret-color (it targets the span cursor)
    const cursorBlock = css.match(/@keyframes cursor-blink\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const cursorIsOpacityOnly = /opacity/.test(cursorBlock) && !/caret-color/.test(cursorBlock);

    const passed = hasCursorBlink && hasCaretBlink && axonCaretUsesCaret && cursorIsOpacityOnly;
    results.push(makeResult(
      'Tier 5.3: Distinct cursor-blink (opacity) vs caret-blink (caret-color) keyframes',
      passed,
      passed
        ? 'cursor-blink animates opacity only; caret-blink animates caret-color; .axon-caret uses caret-blink'
        : `hasCursorBlink=${hasCursorBlink} hasCaretBlink=${hasCaretBlink} axonCaretUsesCaret=${axonCaretUsesCaret} cursorIsOpacityOnly=${cursorIsOpacityOnly}`
    ));
  } catch (err) {
    results.push(makeResult('Tier 5.3: Distinct cursor/caret keyframes', false, String(err)));
  }

  // ── 5.4: Shared CodeBlock extraction (no duplicate definition) ─────────
  try {
    const shared = fs.readFileSync(path.join(projectRoot, 'src/components/CodeBlock.tsx'), 'utf8');
    const typewriter = fs.readFileSync(
      path.join(projectRoot, 'src/components/ui/TypewriterText.tsx'),
      'utf8'
    );

    const sharedExports = /export default CodeBlock/.test(shared);
    const typewriterImports = /import CodeBlock from '\.\.\/CodeBlock'/.test(typewriter);
    // The old inline definition must be gone (no "const CodeBlock =" in any chat view)
    const conversation = fs.readFileSync(
      path.join(projectRoot, 'src/components/chat/ConversationPanel.tsx'),
      'utf8'
    );
    const noDuplicate = !/const CodeBlock\s*=/.test(conversation);

    const passed = sharedExports && typewriterImports && noDuplicate;
    results.push(makeResult(
      'Tier 5.4: CodeBlock extracted to shared module, no duplicate definitions',
      passed,
      passed
        ? 'CodeBlock.tsx exports default; TypewriterText imports it; no local redefinition in chat views'
        : `sharedExports=${sharedExports} typewriterImports=${typewriterImports} noDuplicate=${noDuplicate}`
    ));
  } catch (err) {
    results.push(makeResult('Tier 5.4: Shared CodeBlock extraction', false, String(err)));
  }

  return results;
}
