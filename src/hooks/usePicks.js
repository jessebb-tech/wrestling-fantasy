import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function usePicks() {
  const [picks, setPicks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPicks()

    const channel = supabase
      .channel('picks_realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'picks'
      }, (payload) => {
        setPicks(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchPicks() {
    const { data, error } = await supabase
      .from('picks')
      .select(`
        *,
        owner:owners(id, name, draft_order),
        wrestler:wrestlers(id, name, school, seed, weight_class, total_points, is_eliminated)
      `)
      .order('pick_number', { ascending: true })

    if (!error) setPicks(data || [])
    setLoading(false)
  }

  return { picks, loading, refetch: fetchPicks }
}
