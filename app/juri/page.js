'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Juri() {
  const [pertandingan, setPertandingan] = useState([])
  const [pilihan, setPilihan] = useState(null)
  const [nomorJuri, setNomorJuri] = useState(null)
  const [ronde, setRonde] = useState(1)

  useEffect(() => {
    fetchPertandingan()
  }, [])

  async function fetchPertandingan() {
    const { data } = await supabase.from('pertandingan').select('*').eq('status', 'aktif')
    setPertandingan(data || [])
  }

  async function tambahNilai(peserta, jenis) {
    const nilai = jenis === 'tendangan' ? 2 : 1
    const kolom = jenis === 'tendangan' ? 'tendangan' : 'pukulan'

    const { data: existing } = await supabase
      .from('nilai_tanding')
      .select('*')
      .eq('pertandingan_id', pilihan.id)
      .eq('ronde', ronde)
      .eq('juri', nomorJuri)
      .eq('peserta', peserta)
      .single()

    if (existing) {
      await supabase.from('nilai_tanding').update({ [kolom]: existing[kolom] + nilai }).eq('id', existing.id)
    } else {
      await supabase.from('nilai_tanding').insert({
        pertandingan_id: pilihan.id,
        ronde,
        juri: nomorJuri,
        peserta,
        [kolom]: nilai
      })
    }
  }

  if (!pilihan) return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold text-green-400 mb-6">👊 Pilih Pertandingan</h1>
      {pertandingan.map(p => (
        <button key={p.id} onClick={() => setPilihan(p)} className="w-full bg-gray-800 p-4 rounded-xl mb-3 text-left">
          <p className="font-bold">{p.kategori}</p>
          <p><span className="text-red-400">{p.peserta_merah}</span> vs <span className="text-blue-400">{p.peserta_biru}</span></p>
        </button>
      ))}
    </main>
  )

  if (!nomorJuri) return (
    <main className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Kamu Juri Berapa?</h1>
      {[1, 2, 3].map(n => (
        <button key={n} onClick={() => setNomorJuri(n)} className="bg-green-600 hover:bg-green-700 py-4 px-10 rounded-xl text-xl font-bold">
          Juri {n}
        </button>
      ))}
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold text-green-400">Juri {nomorJuri}</h1>
        <p className="text-gray-400">{pilihan.kategori}</p>
        <div className="flex justify-center gap-3 mt-2">
          {[1, 2, 3].map(r => (
            <button key={r} onClick={() => setRonde(r)} className={`px-4 py-2 rounded-lg font-bold ${ronde === r ? 'bg-yellow-500 text-black' : 'bg-gray-700'}`}>
              Ronde {r}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-900 p-4 rounded-xl text-center">
          <h2 className="text-xl font-bold text-red-300 mb-4">{pilihan.peserta_merah}</h2>
          <button onClick={() => tambahNilai('merah', 'tendangan')} className="w-full bg-red-600 hover:bg-red-500 py-6 rounded-xl text-lg font-bold mb-3">
            🦵 Tendangan +2
          </button>
          <button onClick={() => tambahNilai('merah', 'pukulan')} className="w-full bg-red-700 hover:bg-red-600 py-6 rounded-xl text-lg font-bold">
            👊 Pukulan +1
          </button>
        </div>
        <div className="bg-blue-900 p-4 rounded-xl text-center">
          <h2 className="text-xl font-bold text-blue-300 mb-4">{pilihan.peserta_biru}</h2>
          <button onClick={() => tambahNilai('biru', 'tendangan')} className="w-full bg-blue-600 hover:bg-blue-500 py-6 rounded-xl text-lg font-bold mb-3">
            🦵 Tendangan +2
          </button>
          <button onClick={() => tambahNilai('biru', 'pukulan')} className="w-full bg-blue-700 hover:bg-blue-600 py-6 rounded-xl text-lg font-bold">
            👊 Pukulan +1
          </button>
        </div>
      </div>
    </main>
  )
}