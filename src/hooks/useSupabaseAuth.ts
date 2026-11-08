import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { messageOf } from '../lib/format'

/** Sessão do Supabase (link mágico). Só fica ativa quando a fonte em nuvem está selecionada. */
export function useSupabaseAuth(enabled: boolean) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!enabled)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled || !supabase) { setReady(true); return }
    const client = supabase
    setReady(false)
    const { data } = client.auth.onAuthStateChange((_event, current) => setSession(current))
    let mounted = true
    const finishDesktopCallback = async (callbackUrl: string | null) => {
      if (!callbackUrl) return
      try {
        const callback = new URL(callbackUrl)
        const values = new URLSearchParams(callback.hash.slice(1) || callback.search.slice(1))
        const code = values.get('code')
        const authError = values.get('error_description')
        if (authError) throw new Error(authError)
        if (code) {
          const result = await client.auth.exchangeCodeForSession(code)
          if (result.error) throw result.error
        } else {
          const accessToken = values.get('access_token')
          const refreshToken = values.get('refresh_token')
          if (!accessToken || !refreshToken) throw new Error('O link de acesso não trouxe uma sessão válida. Solicite um novo link.')
          const result = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (result.error) throw result.error
        }
        const { data: sessionData } = await client.auth.getSession()
        if (mounted) setSession(sessionData.session)
      } catch (cause) {
        if (mounted) setError(messageOf(cause))
      }
    }
    const unsubscribeDesktop = window.desktopAuth?.onCallback((url) => { void finishDesktopCallback(url) })
    void (async () => {
      await finishDesktopCallback(await window.desktopAuth?.consumeCallback() ?? null)
      const { data: sessionData } = await client.auth.getSession()
      if (mounted) { setSession(sessionData.session); setReady(true) }
    })()
    return () => { mounted = false; unsubscribeDesktop?.(); data.subscription.unsubscribe() }
  }, [enabled])

  return { session, ready, error }
}
