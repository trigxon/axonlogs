import React, { useEffect, useState } from 'react';
import { supabase } from '../../contexts/CryptoContext';
import Avatar from './Avatar';

/**
 * Profile-aware avatar: resolves the account's uploaded photo (or chosen
 * gradient) for a username and renders the standard themed Avatar.
 * (Formerly lived on StoriesRail — moved here when stories left the product.)
 */
export const ProfileAvatar: React.FC<{ username: string; size?: number; ring?: 'none' | 'seen' }> = ({
  username,
  size = 56,
  ring = 'none',
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const [gradient, setGradient] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, avatar_gradient')
        .eq('username', username.trim().toLowerCase())
        .maybeSingle();
      if (!alive) return;
      setSrc(data?.avatar_url || null);
      setGradient(data?.avatar_gradient || undefined);
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [username]);
  return <Avatar seed={username} name={`@${username}`} size={size} ring={ring} src={src} gradient={gradient} />;
};

export default ProfileAvatar;
