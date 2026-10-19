import { useEffect, useRef, useState } from 'react';
import { File as FileIcon, Lock, Loader2 } from 'lucide-react';
import { supabase } from '../../contexts/CryptoContext';
import {
  resolveChatKey,
  decryptBytes,
  isPrivateAttachment,
  parseAttachmentRef,
} from '../../utils/chatCrypto';

type Resolved =
  | { state: 'ready'; src: string; mime: string; name: string }
  | { state: 'loading' }
  | { state: 'error'; name: string; reason: string };

/**
 * Resolve a "attachments/<chat_id>/<uuid>.enc|<mime>|<name>" reference into
 * a viewable object URL (S4 receiver side):
 *   signed URL (membership-gated) → fetch ciphertext → AES-GCM decrypt with
 *   the conversation key → local blob URL. The plaintext bytes exist only
 *   in this tab's memory.
 */
export const useAttachmentSrc = (fileRef: string, chat: { id: string; share_code: string } | null, myUsername: string): Resolved => {
  const [resolved, setResolved] = useState<Resolved>({ state: 'loading' });
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isPrivateAttachment(fileRef) || !chat) {
      setResolved({ state: 'error', name: fileRef, reason: 'not-encrypted-ref' });
      return;
    }
    (async () => {
      try {
        const { path, mime, name } = parseAttachmentRef(fileRef);
        const key = await resolveChatKey(supabase, chat, myUsername);
        if (!key) throw new Error('no-key');
        const { data: signed, error: signErr } = await supabase!.storage
          .from('attachments')
          .createSignedUrl(path, 300);
        if (signErr || !signed) throw new Error('signed-url-denied');
        const resp = await fetch(signed.signedUrl);
        if (!resp.ok) throw new Error('fetch-failed');
        const cipher = await resp.arrayBuffer();
        const plain = await decryptBytes(key, cipher);
        if (cancelled) return;
        const blob = new Blob([plain], { type: mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setResolved({ state: 'ready', src: url, mime, name });
      } catch (err: any) {
        if (!cancelled) {
          setResolved({
            state: 'error',
            name: parseAttachmentRef(fileRef).name,
            reason: err?.message || 'decrypt-failed',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [fileRef, chat?.id, myUsername]);

  return resolved;
};

/** Inline renderer for encrypted attachments in the conversation body. */
export const EncryptedAttachment: React.FC<{
  fileRef: string;
  chat: { id: string; share_code: string };
  myUsername: string;
}> = ({ fileRef, chat, myUsername }) => {
  const resolved = useAttachmentSrc(fileRef, chat, myUsername);
  const { name } = parseAttachmentRef(fileRef);

  if (resolved.state === 'loading') {
    return (
      <div className="mt-1.5 flex items-center gap-2 text-zinc-500 text-xs max-w-xs rounded-xl border border-white/10 bg-black/30 p-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Decrypting {name}…</span>
      </div>
    );
  }

  if (resolved.state === 'error') {
    return (
      <div className="mt-1.5 flex items-center gap-2 text-zinc-400 text-xs max-w-xs rounded-xl border border-red-400/20 bg-red-500/5 p-3">
        <Lock className="w-3.5 h-3.5 text-red-300" />
        <span>Attachment sealed — open the encryption key on this device to view it.</span>
      </div>
    );
  }

  const { src, mime } = resolved;
  if (mime.startsWith('video/')) {
    return <video controls src={src} className="mt-1.5 w-full max-h-72 rounded-xl bg-black/50" />;
  }
  if (mime.startsWith('audio/')) {
    return <audio controls src={src} className="mt-1.5 max-w-xs h-9 w-full" />;
  }
  if (mime.startsWith('image/')) {
    return (
      <img
        src={src}
        alt={name}
        className="mt-1.5 max-w-full max-h-72 rounded-xl object-contain bg-black/50 border border-white/10"
      />
    );
  }
  return (
    <a
      href={src}
      download={name}
      className="mt-1.5 border border-white/10 p-2.5 rounded-xl flex items-center justify-between bg-black/30 max-w-xs hover:border-cyan-400/40 transition-colors"
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <span className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 text-[10px] font-bold shrink-0">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div className="flex flex-col overflow-hidden">
          <span className="text-white text-xs truncate">{name}</span>
          <span className="text-zinc-500 text-[10px]">decrypted on open</span>
        </div>
      </div>
      <FileIcon className="w-4 h-4 text-cyan-300 shrink-0" />
    </a>
  );
};

export default EncryptedAttachment;
