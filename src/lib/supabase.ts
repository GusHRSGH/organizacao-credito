import { createClient } from '@supabase/supabase-js'

// A URL e a chave "publishable" são públicas por desenho: quem protege os dados são as regras (RLS) do banco.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://jgvaoisqyotwoxohhbne.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xRI9Q38LarHDZgYHkjERDQ_ScSe3uwd'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
