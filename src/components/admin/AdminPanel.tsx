import { useEffect, useState } from 'react';
import {
  ShieldCheck, Users, FileText, ScrollText, Search, Loader2,
  Ban, Trash2, Undo2, RefreshCw, Lock, X, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useCrypto } from '../../contexts/CryptoContext';
import {
  checkAdminRole, fetchAdminStats, searchAccountsAdmin, adminOperate,
  fetchAuditLog, fetchReports, resolveReport,
  type AdminStats, type AdminAuditRow, type ReportRow, type AccountRow,
} from '../../utils/admin';

type Tab = 'stats' | 'accounts' | 'reports' | 'audit';

const fmtBytes = (n: number): string =>
  n > 1024 * 1024 * 1024 ? `${(n / 1024 ** 3).toFixed(2)} GB`
    : n > 1024 * 1024 ? `${(n / 1024 ** 2).toFixed(1)} MB`
      : n > 1024 ? `${(n / 1024).toFixed(0)} KB` : `${n} B`;

const StatCard: React.FC<{ label: string; value: string | number; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
    <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-500">{label}</div>
    <div className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</div>
    {sub && <div className="text-[10px] text-zinc-600 mt-1">{sub}</div>}
  </div>
);

const UnavailableStat: React.FC<{ label: string; note: string }> = ({ label, note }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.015] p-4 opacity-60">
    <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-600">{label}</div>
    <div className="text-sm text-zinc-500 mt-1">Not recorded</div>
    <div className="text-[10px] text-zinc-600 mt-1">{note}</div>
  </div>
);

/**
 * Phase 7 — owner-only admin panel.
 * The gate is the SERVER: `admin_users` is readable by admins only, so a
 * non-admin sees "no access" because the query literally returns nothing.
 * The panel never shows chat content — moderation is evidence-based.
 */
const AdminPanel: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { account, addLog } = useCrypto();
  const [roleChecked, setRoleChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>('stats');

  // stats
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // accounts
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [opBusy, setOpBusy] = useState('');
  const [opErr, setOpErr] = useState<string | null>(null);

  // reports
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});

  // audit
  const [audit, setAudit] = useState<AdminAuditRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkAdminRole();
      if (cancelled) return;
      setIsAdmin(ok);
      setRoleChecked(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const loadTab = async (t: Tab) => {
    setStatsErr(null);
    if (t === 'stats') {
      setLoadingStats(true);
      const res = await fetchAdminStats();
      setLoadingStats(false);
      if (res.ok) setStats(res.stats!); else setStatsErr(res.error || 'stats unavailable');
    }
    if (t === 'accounts') setAccounts(await searchAccountsAdmin(query));
    if (t === 'reports') setReports(await fetchReports());
    if (t === 'audit') setAudit(await fetchAuditLog());
  };

  useEffect(() => {
    if (isAdmin) void loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tab]);

  if (!roleChecked) {
    return (
      <div className="h-app flex items-center justify-center text-zinc-500 text-xs gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking access…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="h-app flex items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-white/10 bg-[#0a0c12] p-6 text-center">
          <Lock className="w-6 h-6 text-zinc-500 mx-auto mb-3" />
          <h2 className="text-white text-sm font-bold mb-1">No access</h2>
          <p className="text-zinc-500 text-xs leading-relaxed mb-4">
            This area is restricted to the server-defined admin role. Access is
            enforced by the database — it cannot be enabled from this device.
          </p>
          <button onClick={onBack} className="text-cyan-400 hover:text-cyan-300 text-xs font-bold">
            Back to chats
          </button>
        </div>
      </div>
    );
  }

  const operate = async (action: 'ban' | 'unban' | 'delete', a: AccountRow) => {
    const reason =
      action === 'unban'
        ? ''
        : window.prompt(
          action === 'ban'
            ? `Reason for banning @${a.username}? (recorded in the audit log)`
            : `Reason for DELETING @${a.username}? This hard-deletes the account and its content.`,
          ''
        );
    if (reason === null) return;
    if (action !== 'unban' && !reason.trim()) { setOpErr('A reason is required — it goes into the audit log.'); return; }
    if (action === 'delete' && !window.confirm(`Really DELETE @${a.username} permanently? This cannot be undone.`)) return;
    setOpBusy(`${action}:${a.username}`);
    setOpErr(null);
    const res = await adminOperate(action, a.username, reason.trim());
    setOpBusy('');
    if (!res.ok) { setOpErr(res.error || 'Operation failed.'); return; }
    addLog(`Admin: ${action} @${a.username}`);
    setAccounts(await searchAccountsAdmin(query));
    void loadTab('audit');
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'stats', label: 'Overview', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: 'accounts', label: 'Accounts', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'reports', label: `Reports${stats?.reports_open ? ` · ${stats.reports_open}` : ''}`, icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'audit', label: 'Audit log', icon: <ScrollText className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="h-app flex flex-col text-[#d6d8de] font-mono">
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] shrink-0">
        <button onClick={onBack} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/5" aria-label="Back">
          <X className="w-4 h-4" />
        </button>
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-white">Admin</h1>
          <p className="text-[10px] text-zinc-600 truncate">
            Signed in as @{account?.username} · role enforced by the server
          </p>
        </div>
        <button onClick={() => loadTab(tab)} className="p-2 rounded-full text-zinc-400 hover:text-white" aria-label="Refresh" title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-white/[0.06] overflow-x-auto shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/30' : 'text-zinc-400 hover:text-white border border-transparent'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto feed-scroll p-4">
        {/* ------------------------------ OVERVIEW ------------------------------ */}
        {tab === 'stats' && (
          <div>
            {statsErr && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 text-amber-300 text-xs mb-4 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" /> {statsErr}
              </div>
            )}
            {!stats && !statsErr && (
              <div className="text-zinc-500 text-xs flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
            )}
            {stats && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  <StatCard label="Accounts" value={stats.accounts_total} sub={`${stats.accounts_verified} verified · ${stats.accounts_legacy} legacy`} />
                  <StatCard label="Messages" value={stats.messages_total} />
                  <StatCard label="Chats" value={stats.chats_total} />
                  <StatCard label="Calls" value={stats.calls_total} />
                  <StatCard label="Reports open" value={stats.reports_open} sub={`${stats.reports_total} all-time`} />
                  <StatCard label="Banned" value={stats.banned_total} />
                  <StatCard label="Attachment storage" value={fmtBytes(stats.attachments_bytes)} sub="attachments + avatars buckets" />
                  <UnavailableStat label="OTP outcomes" note="Verification attempts are not stored server-side yet." />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <UnavailableStat label="Rate-limit events" note="Auth rate-limit hits are visible in the Supabase dashboard logs, not in-app." />
                  <UnavailableStat label="Service health" note="Live probes live in the hosting dashboards (Vercel / Supabase)." />
                </div>
                <div className="mt-6">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-2">Newest accounts</h3>
                  <div className="rounded-xl border border-white/10 overflow-hidden">
                    {stats.newest_accounts.map(a => (
                      <div key={a.username} className="flex items-center gap-3 px-3 py-2 border-b border-white/[0.04] last:border-0">
                        <span className="text-xs text-white flex-1 truncate">@{a.username}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${a.verified ? 'text-emerald-400 bg-emerald-400/10' : 'text-amber-400 bg-amber-400/10'}`}>
                          {a.verified ? 'VERIFIED' : 'UNVERIFIED'}
                        </span>
                        <span className="text-[10px] text-zinc-600">{new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                    {stats.newest_accounts.length === 0 && <div className="px-3 py-4 text-zinc-600 text-xs">No accounts yet.</div>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ------------------------------ ACCOUNTS ------------------------------ */}
        {tab === 'accounts' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2 flex-1 rounded-xl bg-black/30 border border-white/10 px-3 py-2">
                <Search className="w-3.5 h-3.5 text-zinc-500" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void loadTab('accounts'); }}
                  placeholder="Search accounts by username…"
                  className="flex-1 bg-transparent outline-none text-xs text-white placeholder:text-zinc-600"
                />
              </div>
              <button onClick={() => void loadTab('accounts')} className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold px-3 py-2">
                Search
              </button>
            </div>
            {opErr && <div className="rounded-lg border border-red-400/30 bg-red-500/5 p-2.5 text-red-300 text-xs mb-3">{opErr}</div>}
            <div className="rounded-xl border border-white/10 overflow-hidden">
              {accounts.map(a => (
                <div key={a.username} className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] last:border-0">
                  <span className="text-xs text-white flex-1 min-w-0 truncate">
                    @{a.username}
                    {a.banned && <span className="ml-2 text-[9px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">BANNED</span>}
                  </span>
                  <span className="text-[10px] text-zinc-600 hidden sm:inline">{new Date(a.created_at).toLocaleDateString()}</span>
                  {a.banned ? (
                    <button
                      onClick={() => operate('unban', a)}
                      disabled={opBusy === `unban:${a.username}`}
                      className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 border border-emerald-400/30 rounded-lg px-2 py-1"
                    >
                      {opBusy === `unban:${a.username}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />} Unban
                    </button>
                  ) : (
                    <button
                      onClick={() => operate('ban', a)}
                      disabled={opBusy === `ban:${a.username}`}
                      className="flex items-center gap-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 border border-amber-400/30 rounded-lg px-2 py-1"
                    >
                      {opBusy === `ban:${a.username}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />} Ban
                    </button>
                  )}
                  <button
                    onClick={() => operate('delete', a)}
                    disabled={opBusy === `delete:${a.username}`}
                    className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 border border-red-400/30 rounded-lg px-2 py-1"
                    title="Hard-delete account and content"
                  >
                    {opBusy === `delete:${a.username}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete
                  </button>
                </div>
              ))}
              {accounts.length === 0 && <div className="px-3 py-6 text-zinc-600 text-xs text-center">No accounts matched.</div>}
            </div>
            <p className="text-zinc-600 text-[10px] mt-2 leading-relaxed">
              Bans revoke the user's sessions server-side (Supabase Auth) and mark the profile.
              Deletion is immediate and permanent (documented retention policy). Every action is
              written to the immutable audit log with your username and the reason.
            </p>
          </div>
        )}

        {/* ------------------------------ REPORTS ------------------------------ */}
        {tab === 'reports' && (
          <div>
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-3 text-cyan-200/80 text-[11px] leading-relaxed mb-4 flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                End-to-end encrypted chats cannot be read by anyone — including you. Reports carry
                only what the reporter chose to attach. Act on evidence, never on ciphertext.
              </span>
            </div>
            {reports.length === 0 && <div className="text-zinc-600 text-xs text-center py-8">No reports filed.</div>}
            {reports.map(r => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    r.status === 'open' ? 'text-amber-400 bg-amber-400/10'
                      : r.status === 'actioned' ? 'text-emerald-400 bg-emerald-400/10'
                        : 'text-zinc-400 bg-white/5'
                  }`}>{r.status.toUpperCase()}</span>
                  <span className="text-xs text-white font-bold">{r.reason.slice(0, 80)}</span>
                  <span className="text-[10px] text-zinc-600 ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                  <span className="text-zinc-600">reporter:</span> @{r.reporter_username}
                  {r.reported_username && (<><span className="text-zinc-600"> · reported:</span> @{r.reported_username}</>)}
                  {r.chat_id && (<><span className="text-zinc-600"> · chat:</span> <span className="font-mono">{r.chat_id.slice(0, 8)}…</span></>)}
                </div>
                {r.evidence && (
                  <div className="mt-2 rounded-lg bg-black/40 border border-white/10 p-2.5">
                    <div className="text-[9px] font-bold tracking-widest uppercase text-zinc-600 mb-1">Reporter-attached evidence</div>
                    <div className="text-[11px] text-zinc-300 whitespace-pre-wrap break-words">{r.evidence}</div>
                  </div>
                )}
                {r.status === 'open' ? (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <input
                      value={reportNotes[r.id] || ''}
                      onChange={e => setReportNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="Resolution note (goes to the audit log)…"
                      className="flex-1 min-w-[10rem] rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400/50"
                    />
                    {(['reviewed', 'actioned', 'dismissed'] as const).map(s => (
                      <button
                        key={s}
                        onClick={async () => {
                          const res = await resolveReport(r.id, s, reportNotes[r.id] || '', account?.username || '');
                          if (res.ok) setReports(await fetchReports());
                        }}
                        className={`text-[10px] font-bold rounded-lg px-2.5 py-2 border ${
                          s === 'actioned' ? 'text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10'
                            : s === 'dismissed' ? 'text-zinc-400 border-white/10 hover:bg-white/5'
                              : 'text-cyan-400 border-cyan-400/30 hover:bg-cyan-400/10'
                        }`}
                      >
                        {s === 'actioned' ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : null}
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-[10px] text-zinc-500">
                    Resolved {r.resolved_by ? `by @${r.resolved_by} ` : ''}{r.resolved_at ? new Date(r.resolved_at).toLocaleString() : ''}
                    {r.admin_note && ` — “${r.admin_note}”`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ------------------------------ AUDIT LOG ------------------------------ */}
        {tab === 'audit' && (
          <div>
            <p className="text-zinc-600 text-[10px] mb-3 leading-relaxed">
              Append-only record of every moderation action: actor, action, target, time, details.
              Rows cannot be edited or deleted — not even by admins.
            </p>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              {audit.length === 0 && <div className="px-3 py-6 text-zinc-600 text-xs text-center">No entries yet.</div>}
              {audit.map(row => (
                <div key={row.id} className="px-3 py-2.5 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      row.action.includes('delete') ? 'text-red-400 bg-red-400/10'
                        : row.action.includes('ban') ? 'text-amber-400 bg-amber-400/10'
                          : 'text-cyan-400 bg-cyan-400/10'
                    }`}>{row.action.toUpperCase()}</span>
                    <span className="text-xs text-white">@{row.actor_username}</span>
                    <span className="text-[10px] text-zinc-600">→ {row.target_type} {row.target_id ? `@${row.target_id}` : ''}</span>
                    <span className="text-[10px] text-zinc-600 ml-auto">{new Date(row.created_at).toLocaleString()}</span>
                  </div>
                  {Object.keys(row.details || {}).length > 0 && (
                    <div className="text-[10px] text-zinc-500 mt-1 font-mono break-all">
                      {JSON.stringify(row.details)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
