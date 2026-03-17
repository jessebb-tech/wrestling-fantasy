import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useDraftSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial fetch
    fetchSession()

    // Subscribe to realtime changes
    const channel = supabase
      .channel('draft_session')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'draft_session',
        filter: 'id=eq.1'
      }, (payload) => {
        setSession(payload.new)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchSession() {
    const { data, error } = await supabase
      .from('draft_session')
      .select('*')
      .eq('id', 1)
      .single()

    if (!error) setSession(data)
    setLoading(false)
  }

  return { session, loading, refetch: fetchSession }
}
