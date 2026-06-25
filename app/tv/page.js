'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function TV() {
  const [pertandingan, setPertandingan] = useState([])
  const [pilihan, setPilihan] = useState(null)
  const [skor, setSkor] = useState({ merah: 0, biru: 0 })
  const [ronde, setRonde] = useState(1)

  useEffect(() => {
    fetchPertandingan()
  }, [])

  useEffect(() => {
    if (!pilihan) return
    fetchSkor()
    const channel = supabase
      .channel('nilai_tanding')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nilai_tanding' }, () => {
        fetchSkor()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [pilihan, ronde])

  async function fetchPertandingan() {
    const { data } = await supabase.from('pertandingan').select('*').eq('status', 'aktif')
    setPertandingan(data || [])
  }

  async function fetchSkor() {
    const { data } = await supabase
      .from('nilai_tanding')
      .select('*')
      .eq('pertandingan_id', pilihan.id)
      .eq('ronde', ronde)

    let merah = 0, biru = 0
    data?.forEach(d => {
      const total = (d.tendangan || 0) + (d.pukulan || 0) + (d.bantingan || 0) + (d.pelanggaran || 0)
      if (d.peserta === 'merah') merah += total
      else biru += total
    })
    setSkor({ merah, biru })
  }

  if (!pilihan) return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold text-red-400 mb-6">📺 Pilih Pertandingan</h1>
      {pertandingan.map(p => (
        <button key={p.id} onClick={() => setPilihan(p)} className="w-full bg-gray-800 p-4 rounded-xl mb-3 text-left">
          <p className="font-bold text-yellow-400">{p.kategori}</p>
          <p className="mt-1">
            <span className="font-bold text-white bg-red-700 px-2 py-0.5 rounded mr-2">🔴 {p.peserta_merah}</span>
            <span className="text-gray-400">vs</span>
            <span className="font-bold text-white bg-blue-700 px-2 py-0.5 rounded ml-2">🔵 {p.peserta_biru}</span>
          </p>
        </button>
      ))}
    </main>
  )

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="text-center py-4 bg-gray-900">
        <button onClick={() => setPilihan(null)} className="float-left ml-4 text-gray-400 hover:text-white text-sm">← Ganti</button>
        <h1 className="text-2xl font-bold text-yellow-400">⚔️ PERISAI DIRI</h1>
        <p className="text-gray-400 text-sm">{pilihan.kategori}</p>
        <div className="flex justify-center gap-3 mt-2">
          {[1, 2, 3].map(r => (
            <button key={r} onClick={() => setRonde(r)}
              className={`px-4 py-1 rounded-lg font-bold ${ronde === r ? 'bg-yellow-500 text-black' : 'bg-gray-700'}`}>
              Ronde {r}
            </button>
          ))}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="flex flex-1">
        {/* Sudut Merah */}
        <div className="flex-1 bg-red-900 flex flex-col items-center justify-center gap-4">
          <div className="bg-red-700 px-6 py-3 rounded-2xl text-center">
            <p className="text-xs text-red-200 font-semibold tracking-widest uppercase mb-1">Sudut Merah</p>
            <p className="text-3xl font-extrabold text-white">🔴 {pilihan.peserta_merah}</p>
            {pilihan.kontingen_merah && (
              <p className="text-red-200 text-sm mt-1">{pilihan.kontingen_merah}</p>
            )}
          </div>
          <p className="text-9xl font-black text-white">{skor.merah}</p>
        </div>

        {/* Divider */}
        <div className="w-1 bg-yellow-400"></div>

        {/* Sudut Biru */}
        <div className="flex-1 bg-blue-900 flex flex-col items-center justify-center gap-4">
          <div className="bg-blue-700 px-6 py-3 rounded-2xl text-center">
            <p className="text-xs text-blue-200 font-semibold tracking-widest uppercase mb-1">Sudut Biru</p>
            <p className="text-3xl font-extrabold text-white">🔵 {pilihan.peserta_biru}</p>
            {pilihan.kontingen_biru && (
              <p className="text-blue-200 text-sm mt-1">{pilihan.kontingen_biru}</p>
            )}
          </div>
          <p className="text-9xl font-black text-white">{skor.biru}</p>
        </div>
      </div>
    </main>
  )
}