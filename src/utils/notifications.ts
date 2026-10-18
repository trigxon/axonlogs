/* ------------------------------------------------------------------
 * Axon Notifications — activity feed backend client.
 *
 * Rows live in public.notifications (RLS: you only see YOUR rows).
 * Social events (follow / follow request / follow accepted / message
 * request / incoming call) are created by DB triggers; DM receipts are
 * handled by the chat engine itself, not this feed.
 * ------------------------------------------------------------------ */

export interface NotificationItem {
  id: string;
  username: string; // recipient
  actor: string;
  type:
    | 'follow'
    | 'follow_request'
    | 'follow_accept'
    | 'message_request'
    | 'call';
  payload: Record<string, any>;
  read_at: string | null;
  created_at: string;
}

/** Per-group notification preferences (local, applied to in-app + desktop). */
export interface NotifPrefs {
  follows: boolean;      // new followers + accepted requests
  messages: boolean;     // message requests
  calls: boolean;        // incoming / missed calls
  sound: boolean;
  desktop: boolean;
}

const PREFS_KEY = 'axon_notif_prefs';

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  follows: true,
  messages: true,
  calls: true,
  sound: true,
  desktop: false,
};

export const getNotifPrefs = (): NotifPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIF_PREFS };
    return { ...DEFAULT_NOTIF_PREFS, ...(JSON.parse(raw) as Partial<NotifPrefs>) };
  } catch {
    return { ...DEFAULT_NOTIF_PREFS };
  }
};

export const setNotifPrefs = (prefs: NotifPrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
};

/** Does a notification type pass the user's group preference? */
export const prefsAllow = (prefs: NotifPrefs, type: NotificationItem['type']): boolean => {
  if (type === 'follow' || type === 'follow_request' || type === 'follow_accept') return prefs.follows;
  if (type === 'message_request') return prefs.messages;
  if (type === 'call') return prefs.calls;
  return true;
};

/* ------------------------------- reads ------------------------------- */

export const fetchNotifications = async (
  supabase: any,
  username: string,
  limit = 50
): Promise<NotificationItem[]> => {
  if (!supabase) return [];
  const u = username.trim().toLowerCase();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, username, actor, type, payload, read_at, created_at')
    .eq('username', u)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as NotificationItem[];
};

export const fetchUnreadCount = async (supabase: any, username: string): Promise<number> => {
  if (!supabase) return 0;
  const u = username.trim().toLowerCase();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('username', u)
    .is('read_at', null);
  if (error) return 0;
  return count || 0;
};

export const markNotificationRead = async (supabase: any, id: string): Promise<void> => {
  if (!supabase) return;
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
};

export const markAllNotificationsRead = async (supabase: any, username: string): Promise<void> => {
  if (!supabase) return;
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('username', username.trim().toLowerCase())
    .is('read_at', null);
};

export const deleteNotification = async (supabase: any, id: string): Promise<void> => {
  if (!supabase) return;
  await supabase.from('notifications').delete().eq('id', id);
};

/* ------------------------------- labels ------------------------------- */

export const notificationText = (n: NotificationItem): string => {
  switch (n.type) {
    case 'follow':
      return 'started following you';
    case 'follow_request':
      return 'requested to follow you';
    case 'follow_accept':
      return 'accepted your follow request';
    case 'message_request':
      return 'sent you a chat request';
    case 'call':
      return 'called you';
    default:
      return 'did something';
  }
};

/** Relative timestamp for the list (Instagram-style). */
export const notificationAge = (createdAt: string): string => {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
};
