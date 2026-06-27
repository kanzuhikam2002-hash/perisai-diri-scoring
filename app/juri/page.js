'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const COOLDOWN_MS = 1500

function generateDeviceId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('juri_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('juri_device_id', id)
  }
  return id
}

export default function Juri() {
  const [sesi, setSesi] = useState(null)
  const [pertandingan, setPertandingan] = useState(null)
  const [nomorJuri, setNomorJuri] = useState(null)
  const [slotTerpakai, setSlotTerpakai] = useState([])
  const [loading, setLoading] = useState(true)
  const [cooldown, setCooldown] = useState({ merah: false, biru: false })
  const [feedback, setFeedback] = useState(null)
  const deviceId = useRef(generateDeviceId())
  const lastInputTime = useRef({})

  // Ref ini selalu sinkron dengan pertandingan_id TERBARU.
  // Dipakai untuk membuang hasil fetch yang datang "basi" (telat),
  // supaya data lama tidak menimpa data baru.
  const pertandinganIdRef = useRef(null)
  const seqRef = useRef(0)

  // Subscribe sesi_aktif realtime
  useEffect(() => {
    fetchSesiAwal()
    const ch = supabase.channel('sesi_aktif_juri')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesi_aktif' }, (payload) => {
        applySesi(payload.new)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Reset nomorJuri HANYA kalau pertandingan_id beneran hilang
  useEffect(() => {
    if (!sesi?.pertandingan_id) {
      setNomorJuri(null)
    }
  }, [sesi?.pertandingan_id])

  // Subscribe slot juri realtime — channel unik per pertandingan
  useEffect(() => {
    fetchSlot()
    const ch = supabase.channel(`sesi_juri_slot_${sesi?.pertandingan_id ?? 'none'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesi_juri' }, () => fetchSlot())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [sesi?.pertandingan_id])

  // Cleanup slot saat close/refresh
  useEffect(() => {
    if (!nomorJuri) return
    const cleanup = async () => {
      await supabase.from('sesi_juri').delete().eq('device_id', deviceId.current)
    }
    window.addEventListener('beforeunload', cleanup)
    return () => {
      window.removeEventListener('beforeunload', cleanup)
      cleanup()
    }
  }, [nomorJuri])

  // Fetch awal saat mount
  async function fetchSesiAwal() {
    setLoading(true)
    const { data: s } = await supabase.from('sesi_aktif').select('*').eq('id', 1).single()
    await applySesi(s)
    setLoading(false)
  }

  // Dipanggil setiap kali ada perubahan sesi_aktif (dari realtime payload ATAU fetch awal).
  // Pakai sequence guard: kalau ada applySesi() lain yang lebih baru sudah
  // mulai berjalan sebelum query pertandingan ini selesai, hasil ini dibuang.
  async function applySesi(s) {
    const mySeq = ++seqRef.current
    pertandinganIdRef.current = s?.pertandingan_id ?? null
    setSesi(s)

    if (s?.pertandingan_id) {
      const { data: p } = await supabase.from('pertandingan').select('*').eq('id', s.pertandingan_id).single()
      if (mySeq !== seqRef.current) return // ada update lebih baru, buang hasil ini
      setPertandingan(p || null)
    } else {
      if (mySeq !== seqRef.current) return
      setPertandingan(null)
    }
  }

  async function fetchSlot() {
    const pid = pertandinganIdRef.current
    if (!pid) return
    const { data } = await supabase.from('sesi_juri')
      .select('*')
      .eq('pertandingan_id', pid)
    // Buang hasil basi kalau pertandingan sudah berganti lagi sejak query dimulai
    if (pertandinganIdRef.current !== pid) return
    const mySlot = data?.find(d => d.device_id === deviceId.current)
    if (mySlot) setNomorJuri(mySlot.nomor_juri)
    setSlotTerpakai(data?.map(d => d.nomor_juri) || [])
  }

  async function pilihJuri(n) {
    if (slotTerpakai.includes(n)) return
    await supabase.from('sesi_juri').delete().eq('device_id', deviceId.current)
    const { error } = await supabase.from('sesi_juri').insert({
      pertandingan_id: sesi.pertandingan_id,
      nomor_juri: n,
      device_id: deviceId.current
    })
    if (!error) setNomorJuri(n)
  }

  async function tambahNilai(peserta, jenis) {
    const key = `${peserta}_${jenis}`
    const now = Date.now()
    if (lastInputTime.current[key] && (now - lastInputTime.current[key]) < COOLDOWN_MS) {
      setFeedback({ pesan: '⏳ Terlalu cepat! Tunggu sebentar.', tipe: 'error' })
      setTimeout(() => setFeedback(null), 2000)
      return
    }
    lastInputTime.current[key] = now

    if (sesi?.status !== 'aktif') {
      setFeedback({ pesan: '🚫 Pertandingan belum dimulai.', tipe: 'error' })
      setTimeout(() => setFeedback(null), 2000)
      return
    }

    setCooldown(prev => ({ ...prev, [peserta]: true }))

    const nilai = jenis === 'tendangan' ? 2 : 1
    const kolom = jenis === 'tendangan' ? 'tendangan' : 'pukulan'
    const ronde = sesi.ronde

    const { data: existing } = await supabase
      .from('nilai_tanding')
      .select('*')
      .eq('pertandingan_id', pertandingan.id)
      .eq('ronde', ronde)
      .eq('juri', nomorJuri)
      .eq('peserta', peserta)

    if (existing && existing.length > 0) {
      await supabase.from('nilai_tanding')
        .update({ [kolom]: existing[0][kolom] + nilai })
        .eq('id', existing[0].id)
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
      nilai,
      created_at: new Date().toISOString()
    })

    setFeedback({ pesan: `✅ ${jenis === 'tendangan' ? 'Tendangan' : 'Pukulan'} +${nilai} tercatat`, tipe: 'sukses' })
    setTimeout(() => setFeedback(null), 1500)
    setTimeout(() => setCooldown(prev => ({ ...prev, [peserta]: false })), COOLDOWN_MS)
  }

  // ── UI States ──

  if (loading) return (
    <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <p className="text-gray-400 text-xl animate-pulse">Memuat...</p>
    </main>
  )

  if (!sesi?.pertandingan_id || !pertandingan) return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-6xl animate-bounce">⏳</div>
      <h1 className="text-2xl font-bold text-yellow-400">Menunggu Dewan</h1>
      <p className="text-gray-400 text-center">Dewan belum memilih partai.<br />Harap tunggu...</p>
    </main>
  )

  if (sesi?.status === 'selesai') return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-6xl animate-bounce">⏳</div>
      <h1 className="text-2xl font-bold text-yellow-400">Menunggu Dewan</h1>
      <p className="text-gray-400 text-center">Pertandingan selesai.<br />Menunggu partai berikutnya...</p>
    </main>
  )

  if (!nomorJuri) return (
    <main className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-white mb-2">Kamu Juri Berapa?</h1>
      <div className="bg-gray-800 rounded-xl p-4 text-center mb-4 w-full max-w-sm">
        <p className="text-gray-400 text-sm mb-1">{pertandingan.kategori}</p>
        <p>
          <span className="text-white font-bold bg-red-700 px-2 py-0.5 rounded">🔴 {pertandingan.peserta_merah}</span>
          <span className="text-gray-400 mx-2">vs</span>
          <span className="text-white font-bold bg-blue-700 px-2 py-0.5 rounded">🔵 {pertandingan.peserta_biru}</span>
        </p>
      </div>
      {[1, 2, 3].map(n => {
        const terpakai = slotTerpakai.includes(n)
        return (
          <button key={n} onClick={() => pilihJuri(n)} disabled={terpakai}
            className={`py-4 px-10 rounded-xl text-xl font-bold w-48 transition-all
              ${terpakai
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'}`}>
            Juri {n} {terpakai ? '🔒' : ''}
          </button>
        )
      })}
    </main>
  )

  const ronde = sesi.ronde
  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={async () => {
          await supabase.from('sesi_juri').delete().eq('device_id', deviceId.current)
          setNomorJuri(null)
        }} className="text-gray-400 hover:text-white text-sm">← Ganti Juri</button>
        <div className="text-center">
          <span className="text-green-400 font-bold">Juri {nomorJuri}</span>
          <span className="text-gray-500 mx-2">·</span>
          <span className="text-yellow-400 font-bold">Ronde {ronde}</span>
        </div>
        <div className="w-20"></div>
      </div>

      <p className="text-gray-400 text-center text-sm mb-4">{pertandingan.kategori}</p>

      {feedback && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-all
          ${feedback.tipe === 'sukses' ? 'bg-green-600' : 'bg-red-600'}`}>
          {feedback.pesan}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-900 border-2 border-red-500 p-4 rounded-xl text-center">
          <h2 className="text-base font-extrabold text-white bg-red-600 rounded-lg py-2 px-3 mb-4">
            🔴 {pertandingan.peserta_merah}
          </h2>
          <button onClick={() => tambahNilai('merah', 'tendangan')}
            disabled={cooldown.merah}
            className={`w-full py-6 rounded-xl text-lg font-bold mb-3 transition-all
              ${cooldown.merah ? 'bg-gray-600 cursor-not-allowed' : 'bg-red-500 hover:bg-red-400'}`}>
            🦵 Tendangan +2
          </button>
          <button onClick={() => tambahNilai('merah', 'pukulan')}
            disabled={cooldown.merah}
            className={`w-full py-6 rounded-xl text-lg font-bold transition-all
              ${cooldown.merah ? 'bg-gray-600 cursor-not-allowed' : 'bg-red-700 hover:bg-red-600'}`}>
            👊 Pukulan +1
          </button>
        </div>

        <div className="bg-blue-900 border-2 border-blue-500 p-4 rounded-xl text-center">
          <h2 className="text-base font-extrabold text-white bg-blue-600 rounded-lg py-2 px-3 mb-4">
            🔵 {pertandingan.peserta_biru}
          </h2>
          <button onClick={() => tambahNilai('biru', 'tendangan')}
            disabled={cooldown.biru}
            className={`w-full py-6 rounded-xl text-lg font-bold mb-3 transition-all
              ${cooldown.biru ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-400'}`}>
            🦵 Tendangan +2
          </button>
          <button onClick={() => tambahNilai('biru', 'pukulan')}
            disabled={cooldown.biru}
            className={`w-full py-6 rounded-xl text-lg font-bold transition-all
              ${cooldown.biru ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-600'}`}>
            👊 Pukulan +1
          </button>
        </div>
      </div>
    </main>
  )
}