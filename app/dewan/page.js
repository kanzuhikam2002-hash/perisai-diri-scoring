'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Dewan() {
  const [pertandingan, setPertandingan] = useState([])
  const [pilihan, setPilihan] = useState(null)
  const [ronde, setRonde] = useState(1)
  const [log, setLog] = useState([])

  useEffect(() => {
    fetchPertandingan()
  }, [])

  useEffect(() => {
    if (!pilihan) return
    updateSesiAktif(pilihan.id)
    fetchLog()
    const channel = supabase
      .channel('log_nilai_dewan')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'log_nilai' }, () => {
        fetchLog()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [pilihan, ronde])

  async function fetchPertandingan() {
    const { data } = await supabase.from('pertandingan').select('*').eq('status', 'aktif')
    setPertandingan(data || [])
  }

  async function updateSesiAktif(id) {
    await supabase.from('sesi_aktif').update({ pertandingan_id: id, updated_at: new Date().toISOString() }).eq('id', 1)
  }

  async function fetchLog() {
    const { data } = await supabase
      .from('log_nilai')
      .select('*')
      .eq('pertandingan_id', pilihan.id)
      .eq('ronde', ronde)
      .order('created_at', { ascending: false })
    setLog(data || [])
  }

  async function tambahNilai(peserta, jenis, nilai) {
    const { data: existing } = await supabase
      .from('nilai_tanding')
      .select('*')
      .eq('pertandingan_id', pilihan.id)
      .eq('ronde', ronde)
      .eq('juri', 0)
      .eq('peserta', peserta)

    if (existing && existing.length > 0) {
      const kolom = jenis === 'bantingan' ? 'bantingan' : 'pelanggaran'
      await supabase.from('nilai_tanding').update({ [kolom]: existing[0][kolom] + nilai }).eq('id', existing[0].id)
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

    await supabase.from('log_nilai').insert({
      pertandingan_id: pilihan.id,
      ronde,
      juri: 0,
      peserta,
      jenis,
      nilai
    })
  }

  const labelJenis = {
    tendangan: '🦵 Tendangan',
    pukulan: '👊 Pukulan',
    bantingan: '🤸 Bantingan',
    pelanggaran: '⚠️ Pelanggaran'
  }

  function LogSection({ peserta }) {
    const filtered = log.filter(l => l.peserta === peserta)
    const namaLabel = peserta === 'merah' ? pilihan.peserta_merah : pilihan.peserta_biru
    const warna = peserta === 'merah' ? 'text-red-300' : 'text-blue-300'
    const bgHeader = peserta === 'merah' ? 'bg-red-700' : 'bg-blue-700'

    return (
      <div className="mt-2">
        <div className={`${bgHeader} rounded-lg px-3 py-1 mb-2`}>
          <span className={`font-bold text-white text-sm`}>
            {peserta === 'merah' ? '🔴' : '🔵'} {namaLabel}
          </span>
        </div>
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-xs px-2">Belum ada input</p>
        ) : (
          <div className="space-y-1">
            {filtered.map(l => (
              <div key={l.id} className="flex justify-between items-center bg-gray-700 rounded-lg px-3 py-2 text-sm">
                <div>
                  <span className="text-gray-300">{labelJenis[l.jenis] || l.jenis}</span>
                  {l.juri > 0 && <span className="text-gray-500 text-xs ml-2">· Juri {l.juri}</span>}
                  {l.juri === 0 && <span className="text-orange-400 text-xs ml-2">· Dewan</span>}
                </div>
                <span className={`font-bold ${l.nilai > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {l.nilai > 0 ? `+${l.nilai}` : l.nilai}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!pilihan) return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold text-orange-400 mb-6">⚖️ Dewan</h1>
      {pertandingan.map(p => (
        <button key={p.id} onClick={() => setPilihan(p)} className="w-full bg-gray-800 p-4 rounded-xl mb-3 text-left">
          <p className="font-bold">{p.kategori}</p>
          <p>
            <span className="font-bold text-white bg-red-700 px-2 py-0.5 rounded mr-1">🔴 {p.peserta_merah}</span>
            <span className="text-gray-400">vs</span>
            <span className="font-bold text-white bg-blue-700 px-2 py-0.5 rounded ml-1">🔵 {p.peserta_biru}</span>
          </p>
        </button>
      ))}
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="mb-2">
        <button onClick={() => { setPilihan(null); updateSesiAktif(null) }} className="text-gray-400 hover:text-white text-sm">← Ganti Pertandingan</button>
      </div>
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold text-orange-400">⚖️ Dewan</h1>
        <p className="text-gray-400">{pilihan.kategori}</p>
        <div className="flex justify-center gap-3 mt-2">
          {[1, 2, 3].map(r => (
            <button key={r} onClick={() => setRonde(r)}
              className={`px-4 py-2 rounded-lg font-bold ${ronde === r ? 'bg-yellow-500 text-black' : 'bg-gray-700'}`}>
              Ronde {r}
            </button>
          ))}
        </div>
      </div>

      {/* Input Nilai */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {['merah', 'biru'].map(peserta => (
          <div key={peserta} className={`${peserta === 'merah' ? 'bg-red-900 border-red-400' : 'bg-blue-900 border-blue-400'} border-2 p-4 rounded-xl text-center`}>
            <h2 className="text-base font-extrabold text-white bg-opacity-80 rounded-lg py-1 px-2 mb-3"
              style={{ backgroundColor: peserta === 'merah' ? '#b91c1c' : '#1d4ed8' }}>
              {peserta === 'merah' ? '🔴' : '🔵'} {peserta === 'merah' ? pilihan.peserta_merah : pilihan.peserta_biru}
            </h2>
            <button onClick={() => tambahNilai(peserta, 'bantingan', 3)} className="w-full bg-green-600 hover:bg-green-500 py-3 rounded-xl font-bold mb-2 text-sm">
              🤸 Bantingan +3
            </button>
            <button onClick={() => tambahNilai(peserta, 'pelanggaran', -1)} className="w-full bg-yellow-600 hover:bg-yellow-500 py-3 rounded-xl font-bold mb-2 text-sm">
              ⚠️ Pelanggaran -1
            </button>
            <button onClick={() => tambahNilai(peserta, 'pelanggaran', -2)} className="w-full bg-yellow-700 hover:bg-yellow-600 py-3 rounded-xl font-bold mb-2 text-sm">
              ⚠️ Pelanggaran -2
            </button>
            <button onClick={() => tambahNilai(peserta, 'pelanggaran', -5)} className="w-full bg-red-600 hover:bg-red-500 py-3 rounded-xl font-bold mb-2 text-sm">
              🚨 Pelanggaran -5
            </button>
            <button onClick={() => tambahNilai(peserta, 'pelanggaran', -10)} className="w-full bg-red-800 hover:bg-red-700 py-3 rounded-xl font-bold text-sm">
              🚨 Pelanggaran -10
            </button>
          </div>
        ))}
      </div>

      {/* Histori Log */}
      <div className="bg-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-bold text-yellow-400 mb-3">📋 Histori Ronde {ronde}</h3>
        <div className="grid grid-cols-2 gap-4">
          <LogSection peserta="merah" />
          <LogSection peserta="biru" />
        </div>
      </div>
    </main>
  )
}