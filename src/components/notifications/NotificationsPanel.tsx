import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Heart, UserPlus, MessageCircle, Phone, CheckCheck, Trash2 } from 'lucide-react';
import { supabase } from '../../contexts/CryptoContext';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  deleteNotification, notificationText, notificationAge,
  type NotificationItem,
} from '../../utils/notifications';
import {
  fetchFollowRequests, acceptFollowRequest, declineFollowRequest,
  fetchAccountsByUsernames, type Account,
} from '../../utils/auth';
import { ProfileAvatar } from '../profile/ProfileAvatar';

export interface NotificationsPanelProps {
  onBack: () => void;
  onOpenProfile: (username: string) => void;
  onOpenMessages: () => void;
  onOpenCreateStory?: () => void;
  /** shell hook: zero the badge when everything is read */
  onAllRead?: () => void;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  follow: <UserPlus className="w-4 h-4 text-cyan-300" />,
  follow_request: <UserPlus className="w-4 h-4 text-amber-300" />,
  follow_accept: <UserPlus className="w-4 h-4 text-emerald-300" />,
  message_request: <MessageCircle className="w-4 h-4 text-cyan-300" />,
  story_reaction: <Heart className="w-4 h-4 text-pink-400" />,
  story_reply: <MessageCircle className="w-4 h-4 text-pink-400" />,
  call: <Phone className="w-4 h-4 text-emerald-300" />,
};

/**
 * Instagram "Activity" screen: grouped, realtime-refreshed notification
 * list with follow-request management inline. RLS guarantees you only
 * ever download your own rows.
 */
export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  onBack,
  onOpenProfile,
  onOpenMessages,
  onAllRead,
}) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<Account[]>([]);

  const myUsernameRef = React.useRef('');

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cached = localStorage.getItem('axon_session');
      const session = cached ? JSON.parse(cached) : null;
      const uname = (session?.username || '').trim().toLowerCase();
      if (!uname) {
        setLoading(false);
        return;
      }
      myUsernameRef.current = uname;
      const [list, reqUsernames] = await Promise.all([
        fetchNotifications(supabase, uname, 60),
        fetchFollowRequests(supabase, uname, 50),
      ]);
      setItems(list);
      if (reqUsernames.length > 0) {
        setRequests(await fetchAccountsByUsernames(supabase, reqUsernames));
      } else {
        setRequests([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    let channel: any = null;
    try {
      channel = supabase
        ?.channel('notif-panel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => load())
        .subscribe();
    } catch {
      /* polling covers it */
    }
    return () => {
      clearInterval(t);
      try { if (channel) supabase?.removeChannel(channel); } catch { /* noop */ }
    };
  }, [load]);

  const handleAccept = async (username: string) => {
    if (!supabase || !myUsernameRef.current) return;
    await acceptFollowRequest(supabase, myUsernameRef.current, username);
    setRequests(prev => prev.filter(r => r.username !== username));
    load();
  };

  const handleDecline = async (username: string) => {
    if (!supabase || !myUsernameRef.current) return;
    await declineFollowRequest(supabase, myUsernameRef.current, username);
    setRequests(prev => prev.filter(r => r.username !== username));
  };

  const markAll = async () => {
    if (!supabase || !myUsernameRef.current) return;
    await markAllNotificationsRead(supabase, myUsernameRef.current);
    setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    onAllRead?.();
  };

  const unread = items.filter(n => !n.read_at).length;

  const openTarget = (n: NotificationItem) => {
    if (n.type === 'message_request' || n.type === 'call') onOpenMessages();
    else onOpenProfile(n.actor);
  };

  return (
    <div className="h-full flex flex-col bg-[#07070d]/80">
      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-4 h-[56px] border-b border-white/[0.06]">
        <button onClick={onBack} className="md:hidden p-1.5 text-zinc-400 hover:text-white" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-white font-bold text-sm tracking-wide flex-1">Notifications</span>
        {unread > 0 && (
          <button
            onClick={markAll}
            className="text-[10px] font-bold tracking-widest uppercase text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5"
          >
            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
          </button>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto feed-scroll">
        {/* Follow requests (private accounts) */}
        {requests.length > 0 && (
          <section className="border-b border-white/[0.06] p-3">
            <h3 className="text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-2">
              Follow requests · {requests.length}
            </h3>
            {requests.map(acc => (
              <div key={acc.id} className="flex items-center gap-2.5 py-2">
                <button type="button" onClick={() => onOpenProfile(acc.username)} className="shrink-0">
                  <ProfileAvatar username={acc.username} size={40} ring="none" />
                </button>
                <button type="button" onClick={() => onOpenProfile(acc.username)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-white font-semibold truncate">@{acc.username}</div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {acc.display_name?.trim() || 'Wants to follow you'}
                  </div>
                </button>
                <button
                  onClick={() => handleAccept(acc.username)}
                  className="btn-premium shrink-0 px-3.5 py-1.5 rounded-lg text-[10px]"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(acc.username)}
                  className="shrink-0 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:border-white/25"
                >
                  Decline
                </button>
              </div>
            ))}
          </section>
        )}

        {/* list */}
        {loading && items.length === 0 && (
          <div className="py-16 text-center text-[10px] tracking-widest uppercase text-zinc-600">Loading…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8 py-16">
            <Heart className="w-10 h-10 text-zinc-700" />
            <p className="text-zinc-400 text-sm font-semibold">No activity yet</p>
            <p className="text-zinc-600 text-xs max-w-xs leading-relaxed">
              New followers, chat requests, story reactions and calls will show up here.
            </p>
          </div>
        )}
        {items.map(n => (
          <div
            key={n.id}
            className={`group flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-white/[0.04] transition-colors ${
              !n.read_at ? 'bg-cyan-400/[0.05]' : 'hover:bg-white/[0.02]'
            }`}
          >
            <button type="button" onClick={() => openTarget(n)} className="shrink-0 relative">
              <ProfileAvatar username={n.actor || 'axon'} size={42} ring="none" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0b0d14] border border-white/10 flex items-center justify-center">
                {TYPE_ICON[n.type] || <Heart className="w-3 h-3 text-zinc-400" />}
              </span>
            </button>
            <button type="button" onClick={() => openTarget(n)} className="flex-1 min-w-0 text-left">
              <p className="text-sm leading-snug">
                <span className="text-white font-semibold">@{n.actor || 'someone'}</span>{' '}
                <span className="text-zinc-300">{notificationText(n)}</span>
              </p>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {notificationAge(n.created_at)}
                {!n.read_at && <span className="text-cyan-400 ml-2 font-bold">NEW</span>}
              </p>
            </button>
            {!n.read_at && (
              <button
                onClick={async () => {
                  await markNotificationRead(supabase, n.id);
                  setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
                }}
                className="shrink-0 p-1.5 text-zinc-500 hover:text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Mark as read"
                aria-label="Mark as read"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={async () => {
                await deleteNotification(supabase, n.id);
                setItems(prev => prev.filter(x => x.id !== n.id));
              }}
              className="shrink-0 p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove"
              aria-label="Remove notification"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationsPanel;
