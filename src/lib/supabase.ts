import type { SupabaseClient } from '@supabase/supabase-js'

// A URL e a chave "publishable" são públicas por desenho: quem protege os dados são as regras (RLS) do banco.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://jgvaoisqyotwoxohhbne.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xRI9Q38LarHDZgYHkjERDQ_ScSe3uwd'

let client: Promise<SupabaseClient> | null = null

/** Carrega a biblioteca da nuvem só quando precisa (tela de login ou conta já conectada). */
export function loadSupabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  }))
  return client
}

/** Existe uma sessão guardada neste aparelho? Evita carregar a biblioteca sem necessidade. */
export function hasStoredSession(): boolean {
  try { return Object.keys(localStorage).some((name) => /^sb-.+-auth-token/.test(name)) } catch { return false }
}
