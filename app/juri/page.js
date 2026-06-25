'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Juri() {
  const [pertandingan, setPertandingan] = useState(null)
  const [nomorJuri, setNomorJuri] = useState(null)
  const [ronde, setRonde] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSesiAktif()
    const channel = supabase
      .channel('sesi_aktif')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesi_aktif' }, () => {
        fetchSesiAktif()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchSesiAktif() {
    setLoading(true)
    const { data: sesi } = await supabase.from('sesi_aktif').select('*').limit(1).single()
    if (sesi?.pertandingan_id) {
      const { data: p } = await supabase.from('pertandingan').select('*').eq('id', sesi.pertandingan_id).single()
      setPertandingan(p || null)
    } else {
      setPertandingan(null)
    }
    setLoading(false)
  }

  async function tambahNilai(peserta, jenis) {
    const nilai = jenis === 'tendangan' ? 2 : 1
    const kolom = jenis === 'tendangan' ? 'tendangan' : 'pukulan'

    const { data: existing } = await supabase
      .from('nilai_tanding')
      .select('*')
      .eq('pertandingan_id', pertandingan.id)
      .eq('ronde', ronde)
      .eq('juri', nomorJuri)
      .eq('peserta', peserta)

    if (existing && existing.length > 0) {
      await supabase.from('nilai_tanding').update({ [kolom]: existing[0][kolom] + nilai }).eq('id', existing[0].id)
    } else {
      await supabase.from('nilai_tanding').insert({
        pertandingan_id: pertandingan.id,
        ronde,
        juri: nomorJuri,
        peserta,
        tendangan: jenis === 'tendangan' ? nilai : 0,
        pukulan: jenis === 'pukulan' ? nilai : 0
      })
    }

    await supabase.from('log_nilai').insert({
      pertandingan_id: pertandingan.id,
      ronde,
      juri: nomorJuri,
      peserta,
      jenis,
      nilai
    })
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <p className="text-gray-400 text-xl">Memuat...</p>
    </main>
  )

  if (!pertandingan) return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-6xl">⏳</div>
      <h1 className="text-2xl font-bold text-yellow-400">Menunggu Dewan</h1>
      <p className="text-gray-400 text-center">Dewan belum memilih pertandingan.<br />Harap tunggu...</p>
    </main>
  )

  if (!nomorJuri) return (
    <main className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-white mb-2">Kamu Juri Berapa?</h1>
      <div className="bg-gray-800 rounded-xl p-4 text-center mb-4">
        <p className="text-gray-400 text-sm mb-1">{pertandingan.kategori}</p>
        <p>
          <span className="text-red-300 font-bold">{pertandingan.peserta_merah}</span>
          <span className="text-gray-400 mx-2">vs</span>
          <span className="text-blue-300 font-bold">{pertandingan.peserta_biru}</span>
        </p>
      </div>
      {[1, 2, 3].map(n => (
        <button key={n} onClick={() => setNomorJuri(n)}
          className="bg-green-600 hover:bg-green-700 py-4 px-10 rounded-xl text-xl font-bold w-48">
          Juri {n}
        </button>
      ))}
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="flex gap-4 mb-2">
        <button onClick={() => setNomorJuri(null)} className="text-gray-400 hover:text-white text-sm">← Ganti Juri</button>
      </div>
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold text-green-400">Juri {nomorJuri}</h1>
        <p className="text-gray-400">{pertandingan.kategori}</p>
        <div className="flex justify-center gap-3 mt-2">
          {[1, 2, 3].map(r => (
            <button key={r} onClick={() => setRonde(r)}
              className={`px-4 py-2 rounded-lg font-bold ${ronde === r ? 'bg-yellow-500 text-black' : 'bg-gray-700'}`}>
              Ronde {r}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-900 p-4 rounded-xl text-center border-2 border-red-400">
          <h2 className="text-xl font-extrabold text-white bg-red-600 rounded-lg py-2 px-3 mb-4">
            🔴 {pertandingan.peserta_merah}
          </h2>
          <button onClick={() => tambahNilai('merah', 'tendangan')}
            className="w-full bg-red-500 hover:bg-red-400 py-6 rounded-xl text-lg font-bold mb-3 text-white">
            🦵 Tendangan +2
          </button>
          <button onClick={() => tambahNilai('merah', 'pukulan')}
            className="w-full bg-red-700 hover:bg-red-600 py-6 rounded-xl text-lg font-bold text-white">
            👊 Pukulan +1
          </button>
        </div>
        <div className="bg-blue-900 p-4 rounded-xl text-center border-2 border-blue-400">
          <h2 className="text-xl font-extrabold text-white bg-blue-600 rounded-lg py-2 px-3 mb-4">
            🔵 {pertandingan.peserta_biru}
          </h2>
          <button onClick={() => tambahNilai('biru', 'tendangan')}
            className="w-full bg-blue-500 hover:bg-blue-400 py-6 rounded-xl text-lg font-bold mb-3 text-white">
            🦵 Tendangan +2
          </button>
          <button onClick={() => tambahNilai('biru', 'pukulan')}
            className="w-full bg-blue-700 hover:bg-blue-600 py-6 rounded-xl text-lg font-bold text-white">
            👊 Pukulan +1
          </button>
        </div>
      </div>
    </main>
  )
}