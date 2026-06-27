'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

function hitungSkorRonde(data, ronde) {
  let merah = 0, biru = 0
  data?.filter(d => d.ronde === ronde).forEach(d => {
    const total = (d.tendangan || 0) + (d.pukulan || 0) + (d.bantingan || 0) + (d.pelanggaran || 0)
    if (d.peserta === 'merah') merah += total
    else biru += total
  })
  return { merah, biru }
}

function hitungSkorTotal(data) {
  let merah = 0, biru = 0
  data?.forEach(d => {
    const total = (d.tendangan || 0) + (d.pukulan || 0) + (d.bantingan || 0) + (d.pelanggaran || 0)
    if (d.peserta === 'merah') merah += total
    else biru += total
  })
  return { merah, biru }
}

export default function TV() {
  const [sesi, setSesi] = useState(null)
  const [pertandingan, setPertandingan] = useState(null)
  const [nilaiData, setNilaiData] = useState([])
  const [bracket, setBracket] = useState(null)
  const [bracketMatches, setBracketMatches] = useState([])
  const [ping, setPing] = useState(null)

  // Ref ini selalu sinkron dengan pertandingan_id TERBARU dari sesi_aktif.
  // Dipakai untuk membuang hasil fetch yang datang "basi" (telat),
  // supaya data lama tidak menimpa data baru saat Dewan ganti partai cepat.
  const pertandinganIdRef = useRef(null)
  const seqRef = useRef(0)

  // Ping
  useEffect(() => {
    const interval = setInterval(async () => {
      const t = Date.now()
      await supabase.from('sesi_aktif').select('id').limit(1)
      setPing(Date.now() - t)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Subscribe sesi_aktif — pakai payload langsung, bukan re-fetch,
  // supaya urutan event selalu sesuai urutan commit di database
  useEffect(() => {
    fetchSesiAwal()
    const ch = supabase.channel('tv_sesi')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesi_aktif' }, (payload) => {
        applySesi(payload.new)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Subscribe nilai_tanding — channel unik per pertandingan
  useEffect(() => {
    if (!pertandingan) return
    fetchNilai()
    const ch = supabase.channel(`tv_nilai_${pertandingan.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nilai_tanding' }, () => fetchNilai())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [pertandingan?.id])

  // Subscribe bracket_match — channel unik per bracket
  useEffect(() => {
    if (!bracket) return
    fetchBracketMatches()
    const ch = supabase.channel(`tv_bracket_${bracket.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bracket_match' }, () => fetchBracketMatches())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [bracket?.id])

  async function fetchSesiAwal() {
    const { data: s } = await supabase.from('sesi_aktif').select('*').eq('id', 1).single()
    await applySesi(s)
  }

  // Dipanggil setiap kali ada perubahan sesi_aktif (dari realtime payload ATAU fetch awal).
  // Sequence guard: kalau ada applySesi() lain yang lebih baru sudah mulai
  // berjalan sebelum query pertandingan/bracket ini selesai, hasil ini dibuang.
  async function applySesi(s) {
    const mySeq = ++seqRef.current
    pertandinganIdRef.current = s?.pertandingan_id ?? null
    setSesi(s)

    if (!s?.pertandingan_id) {
      if (mySeq !== seqRef.current) return
      setPertandingan(null)
      setBracket(null)
      return
    }

    const { data: p } = await supabase.from('pertandingan').select('*').eq('id', s.pertandingan_id).single()
    if (mySeq !== seqRef.current) return // ada update lebih baru, buang hasil ini
    setPertandingan(p || null)

    if (s.status === 'selesai' && p?.kategori) {
      const { data: b } = await supabase.from('bracket').select('*').eq('kategori', p.kategori).single()
      if (mySeq !== seqRef.current) return
      setBracket(b || null)
    } else {
      setBracket(null)
    }
  }

  async function fetchNilai() {
    if (!pertandingan) return
    const pid = pertandingan.id
    const { data } = await supabase
      .from('nilai_tanding')
      .select('*')
      .eq('pertandingan_id', pid)
    // Buang hasil basi kalau pertandingan sudah berganti lagi sejak query dimulai
    if (pertandinganIdRef.current !== pid) return
    setNilaiData(data || [])
  }

  async function fetchBracketMatches() {
    if (!bracket) return
    const { data } = await supabase
      .from('bracket_match')
      .select('*')
      .eq('bracket_id', bracket.id)
      .order('babak', { ascending: true })
      .order('posisi', { ascending: true })
    setBracketMatches(data || [])
  }

  // ── Waiting Screen ──
  if (!sesi?.pertandingan_id || !pertandingan) return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6">
      <div className="text-8xl animate-bounce">⏳</div>
      <h1 className="text-3xl font-bold text-yellow-400">Menunggu Pertandingan</h1>
      <p className="text-gray-500">Dewan belum memilih partai</p>
      {ping !== null && (
        <span className={`text-xs px-3 py-1 rounded-full font-mono mt-4 ${ping < 100 ? 'bg-green-900 text-green-300' : ping < 300 ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}`}>
          📶 {ping}ms
        </span>
      )}
    </main>
  )

  // ── Selesai: tampil bagan ──
  if (sesi?.status === 'selesai') {
    const babakLabel = {
      1: 'Babak 1',
      2: 'Perempat Final',
      3: 'Semifinal',
      4: 'Final',
      5: 'Perebutan Juara 3'
    }

    const maxBabak = bracketMatches.length > 0 ? Math.max(...bracketMatches.map(m => m.babak)) : 1
    const babakList = [...new Set(bracketMatches.map(m => m.babak))].sort((a, b) => a - b)

    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col overflow-auto">
        {/* Header */}
        <div className="bg-gray-900 py-4 px-6 flex justify-between items-center border-b border-gray-800">
          <div>
            <h1 className="text-2xl font-bold text-yellow-400">⚔️ PERISAI DIRI</h1>
            <p className="text-gray-400 text-sm">{pertandingan.kategori}</p>
          </div>
          <div className="text-center">
            <span className="bg-green-800 text-green-300 px-3 py-1 rounded-full text-sm font-bold">🏁 Selesai</span>
          </div>
          {ping !== null && (
            <span className={`text-xs px-2 py-1 rounded-full font-mono ${ping < 100 ? 'bg-green-900 text-green-300' : ping < 300 ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}`}>
              📶 {ping}ms
            </span>
          )}
        </div>

        {/* Hasil pertandingan terakhir */}
        {(() => {
          const total = hitungSkorTotal(nilaiData)
          const menang = total.merah > total.biru ? 'merah' : total.biru > total.merah ? 'biru' : null
          return (
            <div className="bg-gray-900 mx-4 mt-4 rounded-2xl p-4 border border-gray-700">
              <p className="text-center text-gray-400 text-xs mb-3 tracking-widest uppercase">Hasil Pertandingan</p>
              <div className="flex justify-around items-center">
                <div className="text-center">
                  <div className={`px-4 py-2 rounded-xl mb-2 ${menang === 'merah' ? 'bg-red-600' : 'bg-gray-800'}`}>
                    <p className="font-bold text-white text-sm">🔴 {pertandingan.peserta_merah}</p>
                  </div>
                  <p className="text-4xl font-black text-white">{total.merah}</p>
                  {menang === 'merah' && <p className="text-yellow-400 text-xs font-bold mt-1">🏆 MENANG</p>}
                </div>
                <div className="text-center">
                  <div className={`px-4 py-2 rounded-xl mb-2 ${menang === 'biru' ? 'bg-blue-600' : 'bg-gray-800'}`}>
                    <p className="font-bold text-white text-sm">🔵 {pertandingan.peserta_biru}</p>
                  </div>
                  <p className="text-4xl font-black text-white">{total.biru}</p>
                  {menang === 'biru' && <p className="text-yellow-400 text-xs font-bold mt-1">🏆 MENANG</p>}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Bagan */}
        {bracket && bracketMatches.length > 0 ? (
          <div className="p-4 overflow-x-auto">
            <p className="text-center text-gray-400 text-xs mb-4 tracking-widest uppercase">Bagan {pertandingan.kategori}</p>
            <div className="flex gap-6 min-w-max">
              {babakList.map(babak => (
                <div key={babak} className="flex flex-col gap-3">
                  <p className="text-center text-yellow-400 text-xs font-bold mb-2 tracking-widest">
                    {babakLabel[babak] || `Babak ${babak}`}
                  </p>
                  {bracketMatches.filter(m => m.babak === babak).map(match => (
                    <div key={match.id}
                      className="bg-gray-800 border border-gray-700 rounded-xl p-3 w-52 text-sm">
                      {match.is_bye ? (
                        <div className="text-center text-gray-500 py-2">BYE</div>
                      ) : (
                        <>
                          <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1
                            ${match.pemenang === 'merah' ? 'bg-red-700' : 'bg-gray-700'}`}>
                            <span className="text-xs">🔴</span>
                            <span className={`font-bold text-xs flex-1 truncate ${match.pemenang === 'merah' ? 'text-white' : 'text-gray-300'}`}>
                              {match.peserta_merah || '—'}
                            </span>
                            {match.pemenang === 'merah' && <span className="text-yellow-400 text-xs">🏆</span>}
                          </div>
                          <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg
                            ${match.pemenang === 'biru' ? 'bg-blue-700' : 'bg-gray-700'}`}>
                            <span className="text-xs">🔵</span>
                            <span className={`font-bold text-xs flex-1 truncate ${match.pemenang === 'biru' ? 'text-white' : 'text-gray-300'}`}>
                              {match.peserta_biru || '—'}
                            </span>
                            {match.pemenang === 'biru' && <span className="text-yellow-400 text-xs">🏆</span>}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-600">Bagan belum tersedia</p>
          </div>
        )}
      </main>
    )
  }

  // ── Main Scoreboard ──
  const ronde = sesi?.ronde || 1
  const total = hitungSkorTotal(nilaiData)
  const r1 = hitungSkorRonde(nilaiData, 1)
  const r2 = hitungSkorRonde(nilaiData, 2)
  const r3 = hitungSkorRonde(nilaiData, 3)

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 text-center py-3 px-4 border-b border-gray-800">
        <div className="flex justify-between items-center">
          <div className="text-left">
            <h1 className="text-xl font-black text-yellow-400 tracking-widest">⚔️ PERISAI DIRI</h1>
            <p className="text-gray-400 text-xs">{pertandingan.kategori}</p>
          </div>
          <div className="text-center">
            <span className="bg-yellow-500 text-black px-4 py-1 rounded-full font-black text-sm">
              RONDE {ronde}
            </span>
          </div>
          {ping !== null && (
            <span className={`text-xs px-2 py-1 rounded-full font-mono ${ping < 100 ? 'bg-green-900 text-green-300' : ping < 300 ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}`}>
              📶 {ping}ms
            </span>
          )}
        </div>
      </div>

      {/* Skor Total */}
      <div className="flex flex-1">
        {/* Merah */}
        <div className="flex-1 bg-red-950 flex flex-col items-center justify-center gap-3">
          <div className="bg-red-700 px-5 py-2.5 rounded-2xl text-center">
            <p className="text-xs text-red-200 tracking-widest uppercase mb-0.5">Sudut Merah</p>
            <p className="text-2xl font-extrabold text-white">🔴 {pertandingan.peserta_merah}</p>
            {pertandingan.kontingen_merah && (
              <p className="text-red-200 text-xs mt-0.5">{pertandingan.kontingen_merah}</p>
            )}
          </div>
          <p className="text-8xl font-black text-white leading-none">{total.merah}</p>
          <p className="text-red-400 text-xs tracking-widest">TOTAL</p>
        </div>

        {/* Divider */}
        <div className="w-0.5 bg-yellow-500 flex flex-col items-center justify-center gap-1 py-4">
        </div>

        {/* Biru */}
        <div className="flex-1 bg-blue-950 flex flex-col items-center justify-center gap-3">
          <div className="bg-blue-700 px-5 py-2.5 rounded-2xl text-center">
            <p className="text-xs text-blue-200 tracking-widest uppercase mb-0.5">Sudut Biru</p>
            <p className="text-2xl font-extrabold text-white">🔵 {pertandingan.peserta_biru}</p>
            {pertandingan.kontingen_biru && (
              <p className="text-blue-200 text-xs mt-0.5">{pertandingan.kontingen_biru}</p>
            )}
          </div>
          <p className="text-8xl font-black text-white leading-none">{total.biru}</p>
          <p className="text-blue-400 text-xs tracking-widest">TOTAL</p>
        </div>
      </div>

      {/* Rincian per Ronde */}
      <div className="bg-gray-900 border-t border-gray-800 px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          {[{ r: 1, s: r1 }, { r: 2, s: r2 }, { r: 3, s: r3 }].map(({ r, s }) => (
            <div key={r}
              className={`rounded-xl p-2 text-center ${ronde === r ? 'bg-gray-700 border border-yellow-500' : 'bg-gray-800'}`}>
              <p className={`text-xs font-bold mb-1 ${ronde === r ? 'text-yellow-400' : 'text-gray-400'}`}>
                Babak {r} {ronde === r ? '▶' : ''}
              </p>
              <div className="flex justify-around items-center">
                <span className={`text-lg font-black ${ronde === r ? 'text-red-300' : 'text-red-400'}`}>{s.merah}</span>
                <span className="text-gray-600 text-xs">—</span>
                <span className={`text-lg font-black ${ronde === r ? 'text-blue-300' : 'text-blue-400'}`}>{s.biru}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}