import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useOwners() {
  const [owners, setOwners] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOwners()

    const channel = supabase
      .channel('owners_realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'owners'
      }, () => { fetchOwners() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchOwners() {
    const { data, error } = await supabase
      .from('owners')
      .select('*')
      .order('draft_order', { ascending: true, nullsFirst: false })

    if (!error) setOwners(data || [])
    setLoading(false)
  }

  return { owners, loading, refetch: fetchOwners }
}
