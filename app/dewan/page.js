'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Dewan() {
  const [pertandingan, setPertandingan] = useState([])
  const [pilihan, setPilihan] = useState(null)
  const [ronde, setRonde] = useState(1)

  useEffect(() => {
    fetchPertandingan()
  }, [])

  async function fetchPertandingan() {
    const { data } = await supabase.from('pertandingan').select('*').eq('status', 'aktif')
    setPertandingan(data || [])
  }

  async function tambahNilai(peserta, jenis, nilai) {
    const { data: existing } = await supabase
      .from('nilai_tanding')
      .select('*')
      .eq('pertandingan_id', pilihan.id)
      .eq('ronde', ronde)
      .eq('juri', 0)
      .eq('peserta', peserta)
      .single()

    if (existing) {
      const kolom = jenis === 'bantingan' ? 'bantingan' : 'pelanggaran'
      await supabase.from('nilai_tanding').update({ [kolom]: existing[kolom] + nilai }).eq('id', existing.id)
    } else {
      await supabase.from('nilai_tanding').insert({
        pertandingan_id: pilihan.id,
        ronde,
        juri: 0,
        peserta,
        bantingan: jenis === 'bantingan' ? nilai : 0,
        pelanggaran: jenis === 'pelanggaran' ? nilai : 0
      })
    }
  }

  if (!pilihan) return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold text-orange-400 mb-6">⚖️ Dewan</h1>
      {pertandingan.map(p => (
        <button key={p.id} onClick={() => setPilihan(p)} className="w-full bg-gray-800 p-4 rounded-xl mb-3 text-left">
          <p className="font-bold">{p.kategori}</p>
          <p><span className="text-red-400">{p.peserta_merah}</span> vs <span className="text-blue-400">{p.peserta_biru}</span></p>
        </button>
      ))}
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold text-orange-400">⚖️ Dewan</h1>
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
        {['merah', 'biru'].map(peserta => (
          <div key={peserta} className={`${peserta === 'merah' ? 'bg-red-900' : 'bg-blue-900'} p-4 rounded-xl text-center`}>
            <h2 className={`text-xl font-bold mb-4 ${peserta === 'merah' ? 'text-red-300' : 'text-blue-300'}`}>
              {peserta === 'merah' ? pilihan.peserta_merah : pilihan.peserta_biru}
            </h2>
            <button onClick={() => tambahNilai(peserta, 'bantingan', 3)} className="w-full bg-green-600 hover:bg-green-500 py-4 rounded-xl font-bold mb-2">
              🤸 Bantingan +3
            </button>
            <button onClick={() => tambahNilai(peserta, 'pelanggaran', -1)} className="w-full bg-yellow-600 hover:bg-yellow-500 py-4 rounded-xl font-bold mb-2">
              ⚠️ Pelanggaran Sedang -1
            </button>
            <button onClick={() => tambahNilai(peserta, 'pelanggaran', -2)} className="w-full bg-yellow-700 hover:bg-yellow-600 py-4 rounded-xl font-bold mb-2">
              ⚠️ Pelanggaran Sedang -2
            </button>
            <button onClick={() => tambahNilai(peserta, 'pelanggaran', -5)} className="w-full bg-red-600 hover:bg-red-500 py-4 rounded-xl font-bold mb-2">
              🚨 Pelanggaran Berat -5
            </button>
            <button onClick={() => tambahNilai(peserta, 'pelanggaran', -10)} className="w-full bg-red-800 hover:bg-red-700 py-4 rounded-xl font-bold">
              🚨 Pelanggaran Berat -10
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}