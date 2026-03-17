import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useWrestlers(weightClass = null) {
  const [wrestlers, setWrestlers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWrestlers()

    // Subscribe to score updates
    const channel = supabase
      .channel('wrestlers_realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'wrestlers'
      }, (payload) => {
        setWrestlers(prev =>
          prev.map(w => w.id === payload.new.id ? { ...w, ...payload.new } : w)
        )
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [weightClass])

  async function fetchWrestlers() {
    let query = supabase
      .from('wrestlers')
      .select('*')
      .order('weight_class', { ascending: true })
      .order('seed', { ascending: true })

    if (weightClass) {
      query = query.eq('weight_class', weightClass)
    }

    const { data, error } = await query
    if (!error) setWrestlers(data || [])
    setLoading(false)
  }

  return { wrestlers, loading, refetch: fetchWrestlers }
}
