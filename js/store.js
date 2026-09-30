import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { DEFAULT_SETTINGS } from './calc.js';

export const isRemote = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const uuid = () => crypto.randomUUID();
const norm = (s) => ({ ...s, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5) });

// ---------- ローカルモード（localStorage） ----------
const LS = 'shift-manager-v1';
const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS)) ?? {}; } catch { return {}; } };
const local = {
  async session() { return { user: { email: 'ローカルモード' } }; },
  onAuth() {}, async signOut() {},
  async load() {
    const d = lsRead();
    return { settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) }, workplaces: d.workplaces ?? [], shifts: d.shifts ?? [] };
  },
  async save(table, row) {
    const d = lsRead();
    if (table === 'settings') d.settings = row;
    else {
      const list = (d[table] ??= []); row.id ??= uuid();
      const i = list.findIndex((r) => r.id === row.id);
      i >= 0 ? (list[i] = row) : list.push(row);
    }
    localStorage.setItem(LS, JSON.stringify(d)); return row;
  },
  async remove(table, id) {
    const d = lsRead();
    d[table] = (d[table] ?? []).filter((r) => r.id !== id);
    if (table === 'workplaces') d.shifts = (d.shifts ?? []).filter((s) => s.workplace_id !== id);
    localStorage.setItem(LS, JSON.stringify(d));
  },
};

// ---------- Supabase ----------
let sb;
const remote = {
  init() { sb ??= window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); return sb; },
  async session() { return (await this.init().auth.getSession()).data.session; },
  onAuth(cb) { this.init().auth.onAuthStateChange((_e, s) => cb(s)); },
  signIn: (email, password) => remote.init().auth.signInWithPassword({ email, password }),
  signUp: (email, password) => remote.init().auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } }),
  signInGoogle: () => remote.init().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0] } }),
  async signOut() { await this.init().auth.signOut(); },
  async load() {
    const c = this.init();
    const [s, w, sh] = await Promise.all([
      c.from('settings').select('data').maybeSingle(),
      c.from('workplaces').select('*').order('name'),
      c.from('shifts').select('*').order('date'),
    ]);
    for (const r of [s, w, sh]) if (r.error) throw r.error;
    return { settings: { ...DEFAULT_SETTINGS, ...(s.data?.data ?? {}) }, workplaces: w.data, shifts: sh.data.map(norm) };
  },
  async save(table, row) {
    const c = this.init();
    if (table === 'settings') {
      const { data: u } = await c.auth.getUser();
      const { error } = await c.from('settings').upsert({ user_id: u.user.id, data: row });
      if (error) throw error; return row;
    }
    row.id ??= uuid();
    const { data, error } = await c.from(table).upsert(row).select().single();
    if (error) throw error; return table === 'shifts' ? norm(data) : data;
  },
  async remove(table, id) { const { error } = await this.init().from(table).delete().eq('id', id); if (error) throw error; },
};

export const store = isRemote ? remote : local;
