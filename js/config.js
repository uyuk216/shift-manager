// Supabase の Project URL と anon (publishable) key を入れる。
// anon key は公開して問題ないキー（データ保護は supabase/schema.sql の RLS で行う）。
// 空のままなら、ログインなし・ブラウザ保存の「ローカルモード」で動く。
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
