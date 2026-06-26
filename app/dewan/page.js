'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const WINDOW_MS = 2000 // 2 detik window validasi

function hitungValidasi(logs) {
  // Group by ronde + peserta, sort by waktu
  // Cek apakah ada 2+ juri dalam 2 detik dengan jenis sama
  const hasil = []

  // Group per ronde
  const byRonde = {}
  logs.forEach(l => {
    if (l.juri === 0) return // skip dewan
    const key = `${l.ronde}_${l.peserta}`
    if (!byRonde[key]) byRonde[key] = []
    byRonde[key].push(l)
  })

  Object.entries(byRonde).forEach(([key, entries]) => {
    // Sort by created_at
    const sorted = [...entries].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    // Sliding window: cari grup yang masuk dalam 2 detik
    let i = 0
    while (i < sorted.length) {
      const base = new Date(sorted[i].created_at)
      const grup = [sorted[i]]

      let j = i + 1
      while (j < sorted.length) {
        const diff = new Date(sorted[j].created_at) - base
        if (diff <= WINDOW_MS) {
          grup.push(sorted[j])
          j++
        } else break
      }

      if (grup.length >= 2) {
        // Cek semua jenis sama
        const jenisSama = grup.every(g => g.jenis === grup[0].jenis)
        // Cek juri unik
        const juriUnik = new Set(grup.map(g => g.juri)).size
        const status = jenisSama && juriUnik >= 2 ? 'sah' : 'hangus'
        grup.forEach(g => hasil.push({ ...g, status }))
        i = j
      } else {
        // Hanya 1 juri dalam window ini
        hasil.push({ ...sorted[i], status: 'tidak_sah' })
        i++
      }
    }
  })

  return hasil
}

export default function Dewan() {
  const [pertandingan, setPertandingan] = useState([])
  const [sesi, setSesi] = useState(null)
  const [pilihan, setPilihan] = useState(null)
  const [log, setLog] = useState([])
  const [logDewan, setLogDewan] = useState([])
  const [isAuthed, setIsAuthed] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [ping, setPing] = useState(null)
  
  const PASSWORD = process.env.NEXT_PUBLIC_DEWAN_PASSWORD || '1234'

  // Ping indikator
  useEffect(() => {
    const interval = setInterval(async () => {
      const t = Date.now()
      await supabase.from('sesi_aktif').select('id').limit(1)
      setPing(Date.now() - t)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Password auth
  function handlePasswordSubmit() {
    if (passwordInput === PASSWORD) {
      setIsAuthed(true)
      setPasswordInput('')
    } else {
      alert('Password salah!')
      setPasswordInput('')
    }
  }

  useEffect(() => {
    fetchPertandingan()
    fetchSesi()
  }, [])

  useEffect(() => {
    if (!pilihan) return
    fetchLog()
    const ch = supabase.channel('log_nilai_dewan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'log_nilai' }, () => fetchLog())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [pilihan, sesi?.ronde])

  async function fetchSesi() {
    const { data } = await supabase.from('sesi_aktif').select('*').limit(1).single()
    setSesi(data)
  }

  async function fetchPertandingan() {
    const { data } = await supabase.from('pertandingan').select('*').eq('status', 'aktif')
    setPertandingan(data || [])
  }

  async function fetchLog() {
    if (!pilihan) return
    const { data } = await supabase
      .from('log_nilai')
      .select('*')
      .eq('pertandingan_id', pilihan.id)
      .eq('ronde', sesi?.ronde || 1)
      .order('created_at', { ascending: true })
    setLog(data || [])

    // Log dewan (bantingan/pelanggaran)
    const { data: d } = await supabase
      .from('log_nilai')
      .select('*')
      .eq('pertandingan_id', pilihan.id)
      .eq('juri', 0)
      .eq('ronde', sesi?.ronde || 1)
      .order('created_at', { ascending: false })
    setLogDewan(d || [])
  }

  async function pilihPertandingan(p) {
    setPilihan(p)
    await supabase.from('sesi_aktif').update({
      pertandingan_id: p.id,
      ronde: 1,
      status: 'aktif',
      updated_at: new Date().toISOString()
    }).eq('id', 1)
    // Delay kecil untuk ensure realtime propagation
    setTimeout(() => fetchSesi(), 200)
  }

  async function gantiRonde(r) {
    await supabase.from('sesi_aktif').update({
      ronde: r,
      updated_at: new Date().toISOString()
    }).eq('id', 1)
    setSesi(prev => ({ ...prev, ronde: r }))
  }

  async function akhiriPertandingan() {
    if (!confirm('Akhiri pertandingan ini?')) return
    await supabase.from('sesi_aktif').update({
      status: 'selesai',
      updated_at: new Date().toISOString()
    }).eq('id', 1)
    setSesi(prev => ({ ...prev, status: 'selesai' }))
  }

  async function mulaiLagi() {
    setPilihan(null)
    await supabase.from('sesi_aktif').update({
      pertandingan_id: null,
      ronde: 1,
      status: 'menunggu',
      updated_at: new Date().toISOString()
    }).eq('id', 1)
    fetchPertandingan()
  }

  async function tambahNilai(peserta, jenis, nilai) {
    const ronde = sesi?.ronde || 1
    const { data: existing } = await supabase
      .from('nilai_tanding')
      .select('*')
      .eq('pertandingan_id', pilihan.id)
      .eq('ronde', ronde)
      .eq('juri', 0)
      .eq('peserta', peserta)

    if (existing && existing.length > 0) {
      const kolom = jenis === 'bantingan' ? 'bantingan' : 'pelanggaran'
      await supabase.from('nilai_tanding')
        .update({ [kolom]: existing[0][kolom] + nilai })
        .eq('id', existing[0].id)
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

    const { data: inserted } = await supabase.from('log_nilai').insert({
      pertandingan_id: pilihan.id,
      ronde,
      juri: 0,
      peserta,
      jenis,
      nilai,
      created_at: new Date().toISOString()
    }).select().single()

    fetchLog()
    return inserted
  }

  async function hapusLog(logItem) {
    if (!confirm('Hapus input ini?')) return
    // Hapus dari log
    await supabase.from('log_nilai').delete().eq('id', logItem.id)
    // Kurangi dari nilai_tanding
    const kolom = logItem.jenis === 'bantingan' ? 'bantingan' : 'pelanggaran'
    const { data: existing } = await supabase
      .from('nilai_tanding')
      .select('*')
      .eq('pertandingan_id', pilihan.id)
      .eq('ronde', logItem.ronde)
      .eq('juri', 0)
      .eq('peserta', logItem.peserta)
    if (existing && existing.length > 0) {
      const newVal = existing[0][kolom] - logItem.nilai
      await supabase.from('nilai_tanding')
        .update({ [kolom]: newVal })
        .eq('id', existing[0].id)
    }
    fetchLog()
  }

  // Password screen
  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-6xl mb-4">🔐</div>
        <h1 className="text-2xl font-bold">Akses Dewan</h1>
        <p className="text-gray-400 text-center">Masukkan password untuk melanjutkan</p>
        <div className="w-full max-w-xs">
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
            placeholder="Masukkan password..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-center text-xl tracking-widest mb-3"
            autoFocus
          />
          <button
            onClick={handlePasswordSubmit}
            className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-bold transition-all">
            ✅ Login
          </button>
        </div>
      </main>
    )
  }

  // ── Komponen Histori ──
  function HistoriSection({ peserta }) {
    const validasi = hitungValidasi(log.filter(l => l.peserta === peserta))
    const dewanLog = logDewan.filter(l => l.peserta === peserta)
    const nama = peserta === 'merah' ? pilihan.peserta_merah : pilihan.peserta_biru
    const warnaBg = peserta === 'merah' ? 'bg-red-800' : 'bg-blue-800'
    const warnaHeader = peserta === 'merah' ? 'bg-red-700' : 'bg-blue-700'
    const emoji = peserta === 'merah' ? '🔴' : '🔵'

    const labelStatus = {
      sah: { text: 'SAH ✅', cls: 'text-green-400' },
      hangus: { text: 'HANGUS 🔥', cls: 'text-orange-400' },
      tidak_sah: { text: 'TIDAK SAH ❌', cls: 'text-red-400' }
    }

    const labelJenis = {
      tendangan: '🦵 Tendangan',
      pukulan: '👊 Pukulan',
      bantingan: '🤸 Bantingan',
      pelanggaran: '⚠️ Pelanggaran'
    }

    return (
      <div className={`${warnaBg} rounded-xl p-3`}>
        <div className={`${warnaHeader} rounded-lg px-3 py-1.5 mb-3`}>
          <span className="font-bold text-white text-sm">{emoji} {nama}</span>
        </div>

        {/* Histori Juri */}
        {validasi.length === 0 ? (
          <p className="text-gray-400 text-xs mb-2">Belum ada input juri</p>
        ) : (
          <div className="space-y-1 mb-3">
            {validasi.map((l, idx) => (
              <div key={idx} className="flex justify-between items-center bg-gray-800 bg-opacity-60 rounded-lg px-3 py-2 text-xs">
                <div>
                  <span className="text-gray-200">{labelJenis[l.jenis]}</span>
                  <span className="text-gray-500 ml-1">· Juri {l.juri}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-xs ${labelStatus[l.status]?.cls}`}>
                    {labelStatus[l.status]?.text}
                  </span>
                  <span className={`font-bold ${l.nilai > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {l.nilai > 0 ? `+${l.nilai}` : l.nilai}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Histori Dewan */}
        {dewanLog.length > 0 && (
          <div className="space-y-1">
            <p className="text-gray-400 text-xs mb-1">Input Dewan:</p>
            {dewanLog.map(l => (
              <div key={l.id} className="flex justify-between items-center bg-gray-800 bg-opacity-60 rounded-lg px-3 py-2 text-xs">
                <div>
                  <span className="text-orange-300">{labelJenis[l.jenis]}</span>
                  <span className="text-gray-500 ml-1">· Dewan</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${l.nilai > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {l.nilai > 0 ? `+${l.nilai}` : l.nilai}
                  </span>
                  <button onClick={() => hapusLog(l)} className="text-red-400 hover:text-red-300 text-xs">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── UI States ──

  // Pilih pertandingan
  if (!pilihan) return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-orange-400">⚖️ Dewan</h1>
        {ping !== null && (
          <span className={`text-xs px-2 py-1 rounded-full font-mono ${ping < 100 ? 'bg-green-800 text-green-300' : ping < 300 ? 'bg-yellow-800 text-yellow-300' : 'bg-red-800 text-red-300'}`}>
            📶 {ping}ms
          </span>
        )}
      </div>
      <p className="text-gray-400 text-sm mb-4">Pilih partai untuk memulai:</p>
      {pertandingan.map(p => (
        <button key={p.id} onClick={() => pilihPertandingan(p)}
          className="w-full bg-gray-800 hover:bg-gray-700 p-4 rounded-xl mb-3 text-left transition-all">
          <p className="font-bold text-yellow-400">{p.kategori}</p>
          <p className="mt-1">
            <span className="font-bold text-white bg-red-700 px-2 py-0.5 rounded mr-1">🔴 {p.peserta_merah}</span>
            <span className="text-gray-400 text-xs">vs</span>
            <span className="font-bold text-white bg-blue-700 px-2 py-0.5 rounded ml-1">🔵 {p.peserta_biru}</span>
          </p>
        </button>
      ))}
    </main>
  )

  const ronde = sesi?.ronde || 1
  const statusSelesai = sesi?.status === 'selesai'

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <button onClick={mulaiLagi} className="text-gray-400 hover:text-white text-sm">← Ganti Partai</button>
        <div className="text-center">
          <span className="text-orange-400 font-bold">⚖️ Dewan</span>
          {statusSelesai && <span className="ml-2 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">Selesai</span>}
        </div>
        {ping !== null && (
          <span className={`text-xs px-2 py-1 rounded-full font-mono ${ping < 100 ? 'bg-green-800 text-green-300' : ping < 300 ? 'bg-yellow-800 text-yellow-300' : 'bg-red-800 text-red-300'}`}>
            📶 {ping}ms
          </span>
        )}
      </div>

      <p className="text-gray-400 text-center text-sm mb-3">{pilihan.kategori}</p>

      {/* Ronde selector */}
      <div className="flex justify-center gap-3 mb-4">
        {[1, 2, 3].map(r => (
          <button key={r} onClick={() => gantiRonde(r)} disabled={statusSelesai}
            className={`px-4 py-2 rounded-lg font-bold transition-all ${ronde === r ? 'bg-yellow-500 text-black' : 'bg-gray-700 hover:bg-gray-600'} ${statusSelesai ? 'opacity-50 cursor-not-allowed' : ''}`}>
            Ronde {r}
          </button>
        ))}
      </div>

      {/* Input nilai — disabled kalau selesai */}
      {!statusSelesai && (
        <div className="grid grid-cols-2 gap-4 mb-5">
          {['merah', 'biru'].map(peserta => (
            <div key={peserta}
              className={`${peserta === 'merah' ? 'bg-red-900 border-red-500' : 'bg-blue-900 border-blue-500'} border-2 p-3 rounded-xl text-center`}>
              <h2 className="text-sm font-extrabold text-white rounded-lg py-1.5 px-2 mb-3"
                style={{ backgroundColor: peserta === 'merah' ? '#b91c1c' : '#1d4ed8' }}>
                {peserta === 'merah' ? '🔴' : '🔵'} {peserta === 'merah' ? pilihan.peserta_merah : pilihan.peserta_biru}
              </h2>
              <button onClick={() => tambahNilai(peserta, 'bantingan', 3)}
                className="w-full bg-green-600 hover:bg-green-500 py-3 rounded-xl font-bold mb-2 text-sm">
                🤸 Bantingan +3
              </button>
              <button onClick={() => tambahNilai(peserta, 'pelanggaran', -1)}
                className="w-full bg-yellow-600 hover:bg-yellow-500 py-2.5 rounded-xl font-bold mb-2 text-sm">
                ⚠️ Pelanggaran -1
              </button>
              <button onClick={() => tambahNilai(peserta, 'pelanggaran', -2)}
                className="w-full bg-yellow-700 hover:bg-yellow-600 py-2.5 rounded-xl font-bold mb-2 text-sm">
                ⚠️ Pelanggaran -2
              </button>
              <button onClick={() => tambahNilai(peserta, 'pelanggaran', -5)}
                className="w-full bg-red-600 hover:bg-red-500 py-2.5 rounded-xl font-bold mb-2 text-sm">
                🚨 Pelanggaran -5
              </button>
              <button onClick={() => tambahNilai(peserta, 'pelanggaran', -10)}
                className="w-full bg-red-800 hover:bg-red-700 py-2.5 rounded-xl font-bold text-sm">
                🚨 Pelanggaran -10
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Histori */}
      <div className="bg-gray-800 rounded-xl p-4 mb-4">
        <h3 className="text-base font-bold text-yellow-400 mb-3">📋 Histori Ronde {ronde}</h3>
        <div className="grid grid-cols-2 gap-3">
          <HistoriSection peserta="merah" />
          <HistoriSection peserta="biru" />
        </div>
      </div>

      {/* Akhiri pertandingan */}
      {!statusSelesai ? (
        <button onClick={akhiriPertandingan}
          className="w-full bg-gray-700 hover:bg-red-800 border border-gray-600 hover:border-red-600 py-3 rounded-xl font-bold text-gray-300 hover:text-white transition-all">
          🏁 Akhiri Pertandingan
        </button>
      ) : (
        <button onClick={mulaiLagi}
          className="w-full bg-green-700 hover:bg-green-600 py-3 rounded-xl font-bold text-white transition-all">
          ▶️ Pilih Partai Berikutnya
        </button>
      )}
    </main>
  )
}