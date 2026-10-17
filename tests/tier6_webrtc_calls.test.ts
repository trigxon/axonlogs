import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestResult } from './tier1_build_and_navigation.test.ts';

function makeResult(name: string, passed: boolean, details: string): TestResult {
  return { name, tier: 6, passed, error: passed ? undefined : details, durationMs: 0 };
}

/**
 * Tier 6: WebRTC Calling Contract
 *
 * Guards the real P2P calling integration against known regressions:
 *  1. COMM-LINK / VideoTunnel must stay fully removed from the UI.
 *  2. CryptoContext must implement the full signaling protocol
 *     (invite → accept → offer → answer → ice → end) over the room channel.
 *  3. A real RTCPeerConnection with STUN must be created (no local-only stub).
 *  4. CallOverlay must play the REMOTE stream (not just local preview) and
 *     expose incoming-call accept/decline.
 */
export async function runTier6Tests(projectRoot: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const readSrc = (...parts: string[]): string =>
    fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');

  // ── 6.1: COMM-LINK & VideoTunnel fully removed ──────────────────────────
  try {
    const shell = readSrc('src', 'components', 'layout', 'ChatApp.tsx');
    const noCommLink = !/COMM-LINK/i.test(shell);
    const noTunnel = !/VideoTunnel/i.test(shell);
    const tunnelFileGone = !fs.existsSync(path.join(projectRoot, 'src', 'components', 'layout', 'VideoTunnel.tsx'));

    const passed = noCommLink && noTunnel && tunnelFileGone;
    results.push(makeResult(
      'Tier 6.1: COMM-LINK / VideoTunnel fully removed',
      passed,
      passed ? 'No COMM-LINK button, no VideoTunnel import/render/file'
        : `noCommLink=${noCommLink} noTunnel=${noTunnel} tunnelFileGone=${tunnelFileGone}`
    ));
  } catch (err) {
    results.push(makeResult('Tier 6.1: COMM-LINK / VideoTunnel fully removed', false, String(err)));
  }

  // ── 6.2: Full signaling protocol in CryptoContext ───────────────────────
  try {
    const ctx = readSrc('src', 'contexts', 'CryptoContext.tsx');
    const kinds = ['call-invite', 'call-accept', 'call-offer', 'call-answer', 'call-ice', 'call-end'];
    const allKinds = kinds.every(k => ctx.includes(`'${k}'`));
    const ridesRoomChannel = /event:\s*'webrtc'/.test(ctx);
    const hasIncoming = /incomingCall/.test(ctx) && /acceptIncomingCall/.test(ctx) && /rejectIncomingCall/.test(ctx);
    const hasTimeouts = /30000/.test(ctx) && /20000/.test(ctx);

    const passed = allKinds && ridesRoomChannel && hasIncoming && hasTimeouts;
    results.push(makeResult(
      'Tier 6.2: WebRTC signaling protocol (invite/accept/offer/answer/ice/end)',
      passed,
      passed ? 'All six signaling kinds ride the webrtc broadcast event; incoming-call API + timeouts present'
        : `allKinds=${allKinds} ridesRoomChannel=${ridesRoomChannel} hasIncoming=${hasIncoming} hasTimeouts=${hasTimeouts}`
    ));
  } catch (err) {
    results.push(makeResult('Tier 6.2: WebRTC signaling protocol', false, String(err)));
  }

  // ── 6.3: Real RTCPeerConnection with STUN ───────────────────────────────
  try {
    const ctx = readSrc('src', 'contexts', 'CryptoContext.tsx');
    const createsPc = /new RTCPeerConnection\(/.test(ctx);
    const stun = /stun:stun\.l\.google\.com:19302/.test(ctx);
    const tracksSent = /addTrack\(/.test(ctx);
    const remoteAssembled = /ontrack/.test(ctx) && /setRemoteStream/.test(ctx);
    const strictRoles = /role:\s*'caller'/.test(ctx) && /role:\s*'callee'/.test(ctx);

    const passed = createsPc && stun && tracksSent && remoteAssembled && strictRoles;
    results.push(makeResult(
      'Tier 6.3: Real RTCPeerConnection (STUN, tracks, remote assembly, strict roles)',
      passed,
      passed ? 'P2P connection created with STUN; local tracks sent; remote stream assembled; caller/callee roles strict'
        : `createsPc=${createsPc} stun=${stun} tracksSent=${tracksSent} remoteAssembled=${remoteAssembled} strictRoles=${strictRoles}`
    ));
  } catch (err) {
    results.push(makeResult('Tier 6.3: Real RTCPeerConnection', false, String(err)));
  }

  // ── 6.4: CallOverlay plays remote stream + handles incoming calls ───────
  try {
    const overlay = readSrc('src', 'components', 'calling', 'CallOverlay.tsx');
    const usesRemote = /remoteStream/.test(overlay);
    const attachesSrcObject = /srcObject/.test(overlay);
    const audioCarrier = /<audio[^>]*remoteAudioRef|remoteAudioRef[^>]*>/.test(overlay) || /remoteAudioRef/.test(overlay);
    const incomingScreen = /IncomingCallScreen/.test(overlay) && /rejectIncomingCall/.test(overlay);
    const realQuality = /getCallRtt/.test(overlay);
    const mounted = /<IncomingCallScreen \/>/.test(readSrc('src', 'components', 'layout', 'ChatApp.tsx'));

    const passed = usesRemote && attachesSrcObject && audioCarrier && incomingScreen && realQuality && mounted;
    results.push(makeResult(
      'Tier 6.4: CallOverlay remote playback + incoming-call screen',
      passed,
      passed ? 'Overlay binds remoteStream via srcObject (video + audio carrier), ships IncomingCallScreen, samples live RTT'
        : `usesRemote=${usesRemote} attachesSrcObject=${attachesSrcObject} audioCarrier=${audioCarrier} incomingScreen=${incomingScreen} realQuality=${realQuality} mounted=${mounted}`
    ));
  } catch (err) {
    results.push(makeResult('Tier 6.4: CallOverlay remote playback + incoming-call screen', false, String(err)));
  }

  return results;
}
