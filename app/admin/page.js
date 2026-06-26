'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const USIA_OPTIONS = ['Dini 1', 'Dini 2', 'Pra Remaja', 'Remaja', 'Dewasa']
const KELAS_OPTIONS = ['Under A', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'Eksibisi']
const GENDER_OPTIONS = ['Putra', 'Putri']

function generateDeviceId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('admin_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('admin_device_id', id)
  }
  return id
}

export default function Admin() {
  const [tab, setTab] = useState('pertandingan') // 'pertandingan' | 'peserta' | 'bagan'
  const [pertandingan, setPertandingan] = useState([])
  const [pesertaList, setPesertaList] = useState([])
  const [kontingenList, setKontingenList] = useState([])
  const [deviceLocked, setDeviceLocked] = useState(false)
  const [myDevice, setMyDevice] = useState(false)
  const deviceId = useRef(generateDeviceId())
  const [ping, setPing] = useState(null)

  // Bracket/Bagan states
  const [bracketList, setBracketList] = useState([])
  const [bracketMatches, setBracketMatches] = useState({}) // { bracket_id: [matches] }
  const [selectedKatBagan, setSelectedKatBagan] = useState('')
  const [sistemJuara3, setSistemJuara3] = useState('dua_juara3')
  const [loadingBagan, setLoadingBagan] = useState(false)
  const [konfirmasiPemenang, setKonfirmasiPemenang] = useState(null) // { matchId, peserta }

  // Form pertandingan
  const [form, setForm] = useState({
    gender: '', usia: '', kelas: '',
    kontingen_merah: '', peserta_merah: '',
    kontingen_biru: '', peserta_biru: '',
  })
  const [showSuggestMerah, setShowSuggestMerah] = useState(false)
  const [showSuggestBiru, setShowSuggestBiru] = useState(false)

  // Form peserta bagan
  const [formPeserta, setFormPeserta] = useState({
    gender: '', usia: '', kelas: '', nama: '', kontingen: ''
  })
  const [showSuggestPeserta, setShowSuggestPeserta] = useState(false)
  const [filterKategori, setFilterKategori] = useState('')

  // Ping
  useEffect(() => {
    const interval = setInterval(async () => {
      const t = Date.now()
      await supabase.from('sesi_aktif').select('id').limit(1)
      setPing(Date.now() - t)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Lock admin 1 device
  useEffect(() => {
    checkAdminLock()
    const ch = supabase.channel('sesi_admin_ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesi_dewan' }, () => checkAdminLock())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  async function checkAdminLock() {
    // Pakai kolom terpisah di sesi_dewan untuk admin, atau buat row id=2
    const { data } = await supabase.from('sesi_dewan').select('*').eq('id', 2).single()
    if (!data) {
      // Insert row admin kalau belum ada
      await supabase.from('sesi_dewan').insert({ id: 2, device_id: deviceId.current })
      setMyDevice(true)
      setDeviceLocked(false)
      return
    }
    if (!data.device_id) {
      await supabase.from('sesi_dewan').update({ device_id: deviceId.current, updated_at: new Date().toISOString() }).eq('id', 2)
      setMyDevice(true)
      setDeviceLocked(false)
    } else if (data.device_id === deviceId.current) {
      setMyDevice(true)
      setDeviceLocked(false)
    } else {
      setMyDevice(false)
      setDeviceLocked(true)
    }
  }

  useEffect(() => {
    if (!myDevice) return
    const cleanup = async () => {
      await supabase.from('sesi_dewan').update({ device_id: null }).eq('id', 2)
    }
    window.addEventListener('beforeunload', cleanup)
    return () => { window.removeEventListener('beforeunload', cleanup) }
  }, [myDevice])

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    fetchPertandingan()
    fetchPeserta()
    fetchBracket()
  }

  async function fetchPertandingan() {
    const { data } = await supabase.from('pertandingan').select('*').order('id', { ascending: false })
    setPertandingan(data || [])
    const kontingen = new Set()
    data?.forEach(p => {
      if (p.kontingen_merah) kontingen.add(p.kontingen_merah)
      if (p.kontingen_biru) kontingen.add(p.kontingen_biru)
    })
    setKontingenList([...kontingen])
  }

  async function fetchPeserta() {
    const { data } = await supabase.from('bracket_peserta').select('*').order('kategori').order('nama')
    setPesertaList(data || [])
  }

  function getKategori(f) {
    if (!f.gender || !f.usia || !f.kelas) return ''
    return `${f.gender} - ${f.usia} - ${f.kelas}`
  }

  const filterKontingenSuggest = (val) =>
    kontingenList.filter(k => k.toLowerCase().includes(val.toLowerCase()) && val.length > 0)

  async function tambahPertandingan() {
    if (!form.gender || !form.usia || !form.kelas || !form.peserta_merah || !form.peserta_biru)
      return alert('Lengkapi semua field!')
    await supabase.from('pertandingan').insert({
      kategori: getKategori(form),
      kontingen_merah: form.kontingen_merah,
      kontingen_biru: form.kontingen_biru,
      peserta_merah: form.peserta_merah,
      peserta_biru: form.peserta_biru,
      status: 'aktif'
    })
    setForm({ gender: '', usia: '', kelas: '', kontingen_merah: '', peserta_merah: '', kontingen_biru: '', peserta_biru: '' })
    fetchPertandingan()
  }

  async function hapusPertandingan(id) {
    if (!confirm('Hapus pertandingan ini?')) return
    await supabase.from('pertandingan').delete().eq('id', id)
    fetchPertandingan()
  }

  async function tambahPeserta() {
    if (!formPeserta.gender || !formPeserta.usia || !formPeserta.kelas || !formPeserta.nama)
      return alert('Lengkapi semua field peserta!')
    await supabase.from('bracket_peserta').insert({
      kategori: getKategori(formPeserta),
      nama: formPeserta.nama,
      kontingen: formPeserta.kontingen
    })
    setFormPeserta({ gender: '', usia: '', kelas: '', nama: '', kontingen: '' })
    fetchPeserta()
  }

  async function hapusPeserta(id) {
    if (!confirm('Hapus peserta ini?')) return
    await supabase.from('bracket_peserta').delete().eq('id', id)
    fetchPeserta()
  }

  async function fetchBracket() {
    const { data } = await supabase.from('bracket').select('*').order('kategori')
    setBracketList(data || [])
    for (const b of (data || [])) {
      await fetchBracketMatches(b.id)
    }
  }

  async function fetchBracketMatches(bracketId) {
    const { data } = await supabase
      .from('bracket_match')
      .select('*')
      .eq('bracket_id', bracketId)
      .order('babak')
      .order('posisi')
    setBracketMatches(prev => ({ ...prev, [bracketId]: data || [] }))
  }

  // Hitung jumlah babak dari jumlah peserta
  function hitungBabak(n) {
    let babak = 1
    while (Math.pow(2, babak) < n) babak++
    return babak
  }

  // Generate bracket single elimination dengan bye
  function generateBracket(pesertaList, sistemJ3) {
    const n = pesertaList.length
    if (n < 2) return []

    // Acak peserta
    const shuffled = [...pesertaList].sort(() => Math.random() - 0.5)

    const totalBabak = hitungBabak(n)
    const slotTotal = Math.pow(2, totalBabak)
    const jumlahBye = slotTotal - n

    // Isi slot dengan peserta + bye
    const slots = []
    for (let i = 0; i < slotTotal; i++) {
      if (i < n) slots.push(shuffled[i])
      else slots.push(null) // bye
    }

    const matches = []
    const jumlahMatchBabak1 = slotTotal / 2

    // Babak 1
    for (let i = 0; i < jumlahMatchBabak1; i++) {
      const merah = slots[i * 2]
      const biru = slots[i * 2 + 1]
      const isBye = !merah || !biru
      matches.push({
        babak: 1,
        posisi: i + 1,
        peserta_merah: merah?.nama || null,
        kontingen_merah: merah?.kontingen || null,
        peserta_biru: biru?.nama || null,
        kontingen_biru: biru?.kontingen || null,
        pemenang: isBye ? (merah ? 'merah' : 'biru') : null,
        is_bye: isBye
      })
    }

    // Babak 2 dst (placeholder kosong)
    for (let babak = 2; babak <= totalBabak; babak++) {
      const jumlahMatch = Math.pow(2, totalBabak - babak)
      for (let i = 0; i < jumlahMatch; i++) {
        matches.push({
          babak,
          posisi: i + 1,
          peserta_merah: null,
          kontingen_merah: null,
          peserta_biru: null,
          kontingen_biru: null,
          pemenang: null,
          is_bye: false
        })
      }
    }

    // Juara 3
    if (sistemJ3 === 'perebutan') {
      matches.push({
        babak: totalBabak + 1,
        posisi: 1,
        peserta_merah: null,
        kontingen_merah: null,
        peserta_biru: null,
        kontingen_biru: null,
        pemenang: null,
        is_bye: false
      })
    }

    return matches
  }

  async function acakBagan() {
    if (!selectedKatBagan) return alert('Pilih kategori dulu!')
    const pesertaKat = pesertaList.filter(p => p.kategori === selectedKatBagan)
    if (pesertaKat.length < 2) return alert('Minimal 2 peserta!')
    if (!confirm(`Acak bagan untuk ${selectedKatBagan}? Bagan lama akan dihapus.`)) return

    setLoadingBagan(true)

    // Hapus bracket lama
    const { data: existing } = await supabase.from('bracket').select('id').eq('kategori', selectedKatBagan).single()
    if (existing) {
      await supabase.from('bracket_match').delete().eq('bracket_id', existing.id)
      await supabase.from('bracket').delete().eq('id', existing.id)
    }

    // Buat bracket baru
    const { data: newBracket, error: errBracket } = await supabase.from('bracket').insert({
      kategori: selectedKatBagan,
      sistem_juara3: sistemJuara3,
      sudah_diacak: true
    }).select().single()
    
    if (errBracket) {
      alert('Error: ' + errBracket.message)
      setLoadingBagan(false)
      return
    }

    const matches = generateBracket(pesertaKat, sistemJuara3)
    const matchesWithId = matches.map(m => ({ ...m, bracket_id: newBracket.id }))

    const { error: errMatches } = await supabase.from('bracket_match').insert(matchesWithId)
    if (errMatches) {
      alert('Error: ' + errMatches.message)
      setLoadingBagan(false)
      return
    }

    // Promosi bye otomatis ke babak berikutnya
    await promosiBye(newBracket.id)

    await fetchBracket()
    setLoadingBagan(false)
  }

  async function promosiBye(bracketId) {
    const { data: matches } = await supabase
      .from('bracket_match')
      .select('*')
      .eq('bracket_id', bracketId)
      .order('babak')
      .order('posisi')

    const byeMatches = matches.filter(m => m.is_bye && m.pemenang)
    for (const m of byeMatches) {
      await promosiPemenang(bracketId, m, matches, true)
    }
  }

  async function promosiPemenang(bracketId, match, allMatches, skipConfirm = false) {
    const pemenangNama = match.pemenang === 'merah' ? match.peserta_merah : match.peserta_biru
    const pemenangKontingen = match.pemenang === 'merah' ? match.kontingen_merah : match.kontingen_biru

    // Cari match berikutnya
    const nextBabak = match.babak + 1
    const nextPosisi = Math.ceil(match.posisi / 2)
    const isSlotMerah = match.posisi % 2 !== 0

    const nextMatch = allMatches.find(m => m.babak === nextBabak && m.posisi === nextPosisi)
    if (!nextMatch) return

    const updateData = isSlotMerah
      ? { peserta_merah: pemenangNama, kontingen_merah: pemenangKontingen }
      : { peserta_biru: pemenangNama, kontingen_biru: pemenangKontingen }

    await supabase.from('bracket_match').update(updateData).eq('id', nextMatch.id)
  }

  async function pilihPemenang(bracketId, match, peserta) {
    if (!konfirmasiPemenang) {
      setKonfirmasiPemenang({ matchId: match.id, peserta, bracketId, match })
      return
    }

    if (konfirmasiPemenang.matchId !== match.id) {
      setKonfirmasiPemenang({ matchId: match.id, peserta, bracketId, match })
      return
    }

    // Update pemenang
    await supabase.from('bracket_match').update({ pemenang: peserta }).eq('id', match.id)

    // Fetch ulang untuk promosi
    const { data: allMatches } = await supabase
      .from('bracket_match')
      .select('*')
      .eq('bracket_id', bracketId)
      .order('babak')
      .order('posisi')

    const updatedMatch = { ...match, pemenang: peserta }
    await promosiPemenang(bracketId, updatedMatch, allMatches)

    setKonfirmasiPemenang(null)
    await fetchBracketMatches(bracketId)
  }

  async function ubahPemenang(match) {
    if (!confirm('Reset pemenang match ini?')) return
    await supabase.from('bracket_match').update({ pemenang: null }).eq('id', match.id)

    // Reset slot di babak berikutnya
    const nextBabak = match.babak + 1
    const nextPosisi = Math.ceil(match.posisi / 2)
    const isSlotMerah = match.posisi % 2 !== 0
    const { data: allMatches } = await supabase
      .from('bracket_match').select('*').eq('bracket_id', match.bracket_id)

    const nextMatch = allMatches?.find(m => m.babak === nextBabak && m.posisi === nextPosisi)
    if (nextMatch) {
      const resetData = isSlotMerah
        ? { peserta_merah: null, kontingen_merah: null, pemenang: null }
        : { peserta_biru: null, kontingen_biru: null, pemenang: null }
      await supabase.from('bracket_match').update(resetData).eq('id', nextMatch.id)
    }

    await fetchBracketMatches(match.bracket_id)
  }

  // Download PDF bagan
  async function downloadPDFBagan(bracketId, kategori) {
    const matches = bracketMatches[bracketId] || []
    const doc = new jsPDF({ orientation: 'landscape' })

    doc.setFontSize(16)
    doc.text(`Bagan ${kategori}`, 14, 15)
    doc.setFontSize(10)
    doc.text(`Perisai Diri - Single Elimination`, 14, 22)

    const babakList = [...new Set(matches.map(m => m.babak))].sort((a, b) => a - b)
    const maxBabak = Math.max(...babakList.filter(x => x <= 4), 0)
    
    // Generate label babak yang dinamis
    const getBabakLabelPDF = (babak) => {
      if (babak > maxBabak) return `Perebutan Juara 3`
      const sisaBabak = maxBabak - babak
      const labels = ['Final', 'Semifinal', 'Perempat Final', '16 Besar', '32 Besar']
      if (sisaBabak < labels.length) return labels[sisaBabak]
      return `Babak ${babak}`
    }

    let startY = 30
    for (const babak of babakList) {
      const matchesBabak = matches.filter(m => m.babak === babak)
      const rows = matchesBabak.map((m, i) => [
        i + 1,
        m.is_bye ? 'BYE' : (m.peserta_merah || '—'),
        m.is_bye ? '-' : (m.peserta_biru || '—'),
        m.pemenang ? (m.pemenang === 'merah' ? m.peserta_merah : m.peserta_biru) : '—'
      ])

      doc.setFontSize(11)
      doc.text(getBabakLabelPDF(babak), 14, startY)

      autoTable(doc, {
        startY: startY + 3,
        head: [['#', 'Sudut Merah', 'Sudut Biru', 'Pemenang']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [88, 28, 135] },
        styles: { fontSize: 9 },
      })

      startY = doc.lastAutoTable.finalY + 10
    }

    doc.save(`bagan-${kategori.replace(/ /g, '-')}.pdf`)
  }

  // Download PDF peserta
  async function downloadPDFPeserta(kategori) {
    const peserta = kategori
      ? pesertaList.filter(p => p.kategori === kategori)
      : pesertaList

    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(kategori ? `Data Peserta - ${kategori}` : 'Data Peserta Semua Kategori', 14, 15)

    const grouped = {}
    peserta.forEach(p => {
      if (!grouped[p.kategori]) grouped[p.kategori] = []
      grouped[p.kategori].push(p)
    })

    let startY = 25
    for (const kat of Object.keys(grouped)) {
      const rows = grouped[kat].map((p, i) => [i + 1, p.nama, p.kontingen || '—'])
      doc.setFontSize(11)
      doc.text(kat, 14, startY)
      autoTable(doc, {
        startY: startY + 3,
        head: [['#', 'Nama', 'Kontingen']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [88, 28, 135] },
        styles: { fontSize: 9 },
      })
      startY = doc.lastAutoTable.finalY + 10
    }

    doc.save(`peserta-${kategori ? kategori.replace(/ /g, '-') : 'semua'}.pdf`)
  }
  const kategoriList = [...new Set(pesertaList.map(p => p.kategori))].sort()
  const pesertaFiltered = filterKategori
    ? pesertaList.filter(p => p.kategori === filterKategori)
    : pesertaList

  // ── Device locked
  if (deviceLocked) return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-6xl">🔒</div>
      <h1 className="text-2xl font-bold text-red-400">Akses Ditolak</h1>
      <p className="text-gray-400 text-center">Admin sudah login di device lain.<br />Hanya 1 device yang diizinkan.</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-900 text-white pb-10">
      {/* Header */}
      <div className="bg-gray-900 sticky top-0 z-10 border-b border-gray-800 px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-purple-400">🛠️ Admin</h1>
        {ping !== null && (
          <span className={`text-xs px-2 py-1 rounded-full font-mono ${ping < 100 ? 'bg-green-800 text-green-300' : ping < 300 ? 'bg-yellow-800 text-yellow-300' : 'bg-red-800 text-red-300'}`}>
            📶 {ping}ms
          </span>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-800 bg-gray-900 sticky top-12 z-10">
        {[
          { key: 'pertandingan', label: '⚔️ Partai' },
          { key: 'peserta', label: '👥 Peserta' },
          { key: 'bagan', label: '🏆 Bagan' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-bold transition-all border-b-2
              ${tab === t.key ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">

        {/* ── TAB PERTANDINGAN ── */}
        {tab === 'pertandingan' && (
          <div>
            {/* Form Tambah */}
            <div className="bg-gray-800 rounded-2xl p-4 mb-6">
              <h2 className="text-base font-bold text-white mb-4">Tambah Partai</h2>

              {/* Gender + Usia + Kelas */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Gender</label>
                  <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                    <option value="">Pilih</option>
                    {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Usia</label>
                  <select value={form.usia} onChange={e => setForm({ ...form, usia: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                    <option value="">Pilih</option>
                    {USIA_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Kelas</label>
                  <select value={form.kelas} onChange={e => setForm({ ...form, kelas: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                    <option value="">Pilih</option>
                    {KELAS_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>

              {form.gender && form.usia && form.kelas && (
                <p className="text-yellow-400 text-xs mb-3">Kategori: <strong>{getKategori(form)}</strong></p>
              )}

              {/* Sudut Merah */}
              <div className="bg-red-950 rounded-xl p-3 mb-3 border border-red-900">
                <p className="text-red-300 font-bold text-sm mb-2">🔴 Sudut Merah</p>
                <div className="relative mb-2">
                  <label className="text-gray-400 text-xs block mb-1">Kontingen</label>
                  <input value={form.kontingen_merah}
                    onChange={e => { setForm({ ...form, kontingen_merah: e.target.value }); setShowSuggestMerah(true) }}
                    onBlur={() => setTimeout(() => setShowSuggestMerah(false), 150)}
                    placeholder="Nama kontingen..."
                    className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                  {showSuggestMerah && filterKontingenSuggest(form.kontingen_merah).length > 0 && (
                    <div className="absolute z-20 w-full bg-gray-700 rounded-lg mt-1 shadow-xl border border-gray-600">
                      {filterKontingenSuggest(form.kontingen_merah).map(k => (
                        <button key={k} onMouseDown={() => setForm({ ...form, kontingen_merah: k })}
                          className="w-full text-left px-3 py-2 hover:bg-gray-600 text-sm text-white">
                          {k}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <label className="text-gray-400 text-xs block mb-1">Nama Peserta</label>
                <input value={form.peserta_merah}
                  onChange={e => setForm({ ...form, peserta_merah: e.target.value })}
                  placeholder="Nama peserta merah..."
                  className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
              </div>

              {/* Sudut Biru */}
              <div className="bg-blue-950 rounded-xl p-3 mb-4 border border-blue-900">
                <p className="text-blue-300 font-bold text-sm mb-2">🔵 Sudut Biru</p>
                <div className="relative mb-2">
                  <label className="text-gray-400 text-xs block mb-1">Kontingen</label>
                  <input value={form.kontingen_biru}
                    onChange={e => { setForm({ ...form, kontingen_biru: e.target.value }); setShowSuggestBiru(true) }}
                    onBlur={() => setTimeout(() => setShowSuggestBiru(false), 150)}
                    placeholder="Nama kontingen..."
                    className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                  {showSuggestBiru && filterKontingenSuggest(form.kontingen_biru).length > 0 && (
                    <div className="absolute z-20 w-full bg-gray-700 rounded-lg mt-1 shadow-xl border border-gray-600">
                      {filterKontingenSuggest(form.kontingen_biru).map(k => (
                        <button key={k} onMouseDown={() => setForm({ ...form, kontingen_biru: k })}
                          className="w-full text-left px-3 py-2 hover:bg-gray-600 text-sm text-white">
                          {k}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <label className="text-gray-400 text-xs block mb-1">Nama Peserta</label>
                <input value={form.peserta_biru}
                  onChange={e => setForm({ ...form, peserta_biru: e.target.value })}
                  placeholder="Nama peserta biru..."
                  className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
              </div>

              <button onClick={tambahPertandingan}
                className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-xl font-bold transition-all">
                ➕ Tambah Partai
              </button>
            </div>

            {/* List Pertandingan */}
            <h2 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-widest">Daftar Partai</h2>
            {pertandingan.length === 0 && (
              <p className="text-gray-600 text-center py-8">Belum ada partai</p>
            )}
            {pertandingan.map(p => (
              <div key={p.id} className="bg-gray-800 rounded-xl p-4 mb-3 border border-gray-700">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-bold text-yellow-400 text-sm mb-2">{p.kategori}</p>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white bg-red-700 px-2 py-0.5 rounded text-xs">🔴 {p.peserta_merah}</span>
                        {p.kontingen_merah && <span className="text-gray-500 text-xs">{p.kontingen_merah}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white bg-blue-700 px-2 py-0.5 rounded text-xs">🔵 {p.peserta_biru}</span>
                        {p.kontingen_biru && <span className="text-gray-500 text-xs">{p.kontingen_biru}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => hapusPertandingan(p.id)}
                    className="text-red-500 hover:text-red-400 text-sm ml-2 p-1">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB PESERTA ── */}
        {tab === 'peserta' && (
          <div>
            {/* Form Tambah Peserta */}
            <div className="bg-gray-800 rounded-2xl p-4 mb-6">
              <h2 className="text-base font-bold text-white mb-4">Tambah Peserta Bagan</h2>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Gender</label>
                  <select value={formPeserta.gender} onChange={e => setFormPeserta({ ...formPeserta, gender: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                    <option value="">Pilih</option>
                    {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Usia</label>
                  <select value={formPeserta.usia} onChange={e => setFormPeserta({ ...formPeserta, usia: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                    <option value="">Pilih</option>
                    {USIA_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Kelas</label>
                  <select value={formPeserta.kelas} onChange={e => setFormPeserta({ ...formPeserta, kelas: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg px-2 py-2 text-white text-sm">
                    <option value="">Pilih</option>
                    {KELAS_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>

              {formPeserta.gender && formPeserta.usia && formPeserta.kelas && (
                <p className="text-yellow-400 text-xs mb-3">Kategori: <strong>{getKategori(formPeserta)}</strong></p>
              )}

              <label className="text-gray-400 text-xs block mb-1">Nama Peserta</label>
              <input value={formPeserta.nama}
                onChange={e => setFormPeserta({ ...formPeserta, nama: e.target.value })}
                placeholder="Nama lengkap peserta..."
                className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white text-sm mb-2" />

              <div className="relative mb-3">
                <label className="text-gray-400 text-xs block mb-1">Kontingen</label>
                <input value={formPeserta.kontingen}
                  onChange={e => { setFormPeserta({ ...formPeserta, kontingen: e.target.value }); setShowSuggestPeserta(true) }}
                  onBlur={() => setTimeout(() => setShowSuggestPeserta(false), 150)}
                  placeholder="Nama kontingen..."
                  className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                {showSuggestPeserta && filterKontingenSuggest(formPeserta.kontingen).length > 0 && (
                  <div className="absolute z-20 w-full bg-gray-700 rounded-lg mt-1 shadow-xl border border-gray-600">
                    {filterKontingenSuggest(formPeserta.kontingen).map(k => (
                      <button key={k} onMouseDown={() => setFormPeserta({ ...formPeserta, kontingen: k })}
                        className="w-full text-left px-3 py-2 hover:bg-gray-600 text-sm text-white">
                        {k}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={tambahPeserta}
                className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-xl font-bold transition-all">
                ➕ Tambah Peserta
              </button>
            </div>

            {/* Filter + List Peserta */}
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Daftar Peserta</h2>
              <select value={filterKategori} onChange={e => setFilterKategori(e.target.value)}
                className="bg-gray-700 rounded-lg px-2 py-1 text-white text-xs">
                <option value="">Semua Kategori</option>
                {kategoriList.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            {kategoriList.filter(k => !filterKategori || k === filterKategori).map(kat => {
              const pesertaKat = pesertaFiltered.filter(p => p.kategori === kat)
              return (
                <div key={kat} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-yellow-400 text-xs font-bold">{kat}</p>
                    <span className="bg-gray-700 text-gray-400 text-xs px-2 py-0.5 rounded-full">{pesertaKat.length} peserta</span>
                  </div>
                  {pesertaKat.map((p, idx) => (
                    <div key={p.id} className="bg-gray-800 rounded-xl px-4 py-3 mb-2 flex justify-between items-center border border-gray-700">
                      <div>
                        <span className="text-gray-500 text-xs mr-2">{idx + 1}.</span>
                        <span className="text-white text-sm font-bold">{p.nama}</span>
                        {p.kontingen && <span className="text-gray-500 text-xs ml-2">· {p.kontingen}</span>}
                      </div>
                      <button onClick={() => hapusPeserta(p.id)} className="text-red-500 hover:text-red-400 text-sm">🗑️</button>
                    </div>
                  ))}
                </div>
              )
            })}

            {pesertaFiltered.length === 0 && (
              <p className="text-gray-600 text-center py-8">Belum ada peserta</p>
            )}
          </div>
        )}

        {/* ── TAB BAGAN ── */}
        {tab === 'bagan' && (
          <div>
            {/* Pilih Kategori + Acak */}
            <div className="bg-gray-800 rounded-2xl p-4 mb-6">
              <h2 className="text-base font-bold text-white mb-4">⚙️ Generate Bagan</h2>

              <label className="text-gray-400 text-xs block mb-1">Kategori</label>
              <select value={selectedKatBagan} onChange={e => setSelectedKatBagan(e.target.value)}
                className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white text-sm mb-3">
                <option value="">Pilih Kategori</option>
                {kategoriList.map(k => {
                  const jml = pesertaList.filter(p => p.kategori === k).length
                  return <option key={k} value={k}>{k} ({jml} peserta)</option>
                })}
              </select>

              <label className="text-gray-400 text-xs block mb-1">Sistem Juara 3</label>
              <select value={sistemJuara3} onChange={e => setSistemJuara3(e.target.value)}
                className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white text-sm mb-4">
                <option value="dua_juara3">Dua Juara 3 Bersama</option>
                <option value="perebutan">Perebutan Juara 3</option>
              </select>

              <button onClick={acakBagan} disabled={loadingBagan}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-3 rounded-xl font-black transition-all disabled:opacity-50">
                {loadingBagan ? '⏳ Mengacak...' : '🎲 Acak Bagan Sekarang'}
              </button>
            </div>

            {/* Download Peserta */}
            <div className="bg-gray-800 rounded-2xl p-4 mb-6">
              <h2 className="text-base font-bold text-white mb-3">📥 Download Data Peserta</h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => downloadPDFPeserta('')}
                  className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded-xl text-sm font-bold transition-all">
                  📄 PDF Semua Kategori
                </button>
                {kategoriList.map(k => (
                  <button key={k} onClick={() => downloadPDFPeserta(k)}
                    className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-xl text-xs font-bold transition-all">
                    📄 {k}
                  </button>
                ))}
              </div>
            </div>

            {/* Tampilan Bagan per Kategori */}
            {bracketList.length === 0 && (
              <p className="text-gray-600 text-center py-8">Belum ada bagan yang digenerate</p>
            )}

            {bracketList.map(b => {
              const matches = bracketMatches[b.id] || []
              const babakList = [...new Set(matches.map(m => m.babak))].sort((a, b) => a - b)
              
              const maxBabak = Math.max(...babakList.filter(x => x <= 4), 0)
              
              // Generate label babak yang dinamis berdasarkan maxBabak
              const getBabakLabel = (babak) => {
                if (babak > maxBabak) return `Perebutan Juara 3`
                const sisaBabak = maxBabak - babak
                const labels = ['Final', 'Semifinal', 'Perempat Final', '16 Besar', '32 Besar']
                if (sisaBabak < labels.length) return labels[sisaBabak]
                return `Babak ${babak}`
              }
              
              const finalMatch = matches.find(m => m.babak === maxBabak && m.posisi === 1)
              const juara1 = finalMatch?.pemenang
                ? (finalMatch.pemenang === 'merah' ? finalMatch.peserta_merah : finalMatch.peserta_biru)
                : null
              const juara2 = finalMatch?.pemenang
                ? (finalMatch.pemenang === 'merah' ? finalMatch.peserta_biru : finalMatch.peserta_merah)
                : null
              const juara3Match = matches.find(m => m.babak === maxBabak + 1)
              
              // Cek apakah sudah ada pemenang pertama di bracket ini (exclude bye otomatis)
              const sudahAdaPemenang = matches.some(m => !m.is_bye && m.pemenang)

              return (
                <div key={b.id} className="bg-gray-800 rounded-2xl p-4 mb-6 border border-gray-700">
                  {/* Header bagan */}
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-base font-bold text-yellow-400">{b.kategori}</h3>
                      <p className="text-gray-500 text-xs">{b.sistem_juara3 === 'perebutan' ? 'Perebutan Juara 3' : 'Dua Juara 3 Bersama'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => downloadPDFBagan(b.id, b.kategori)}
                        className="bg-purple-700 hover:bg-purple-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                        📄 PDF
                      </button>
                      <button onClick={acakBagan} disabled={sudahAdaPemenang}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          sudahAdaPemenang
                            ? 'bg-gray-500 text-gray-300 cursor-not-allowed opacity-60'
                            : 'bg-yellow-600 hover:bg-yellow-500 text-black'
                        }`}>
                        {sudahAdaPemenang ? '🔒 Sudah Dimulai' : '🎲 Acak Ulang'}
                      </button>
                    </div>
                  </div>

                  {/* Podium Juara */}
                  {juara1 && (
                    <div className="bg-gray-900 rounded-xl p-3 mb-4 border border-yellow-800">
                      <p className="text-xs text-gray-400 mb-2 font-bold tracking-widest">🏆 HASIL</p>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400 font-black text-sm">🥇</span>
                          <span className="text-white text-sm font-bold">{juara1}</span>
                        </div>
                        {juara2 && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-300 font-black text-sm">🥈</span>
                            <span className="text-gray-300 text-sm">{juara2}</span>
                          </div>
                        )}
                        {b.sistem_juara3 === 'dua_juara3' && (
                          <>
                            {matches.filter(m => m.babak === maxBabak - 1).map(sf => {
                              const kalah = sf.pemenang
                                ? (sf.pemenang === 'merah' ? sf.peserta_biru : sf.peserta_merah)
                                : null
                              return kalah ? (
                                <div key={sf.id} className="flex items-center gap-2">
                                  <span className="text-orange-400 font-black text-sm">🥉</span>
                                  <span className="text-orange-300 text-sm">{kalah}</span>
                                </div>
                              ) : null
                            })}
                          </>
                        )}
                        {b.sistem_juara3 === 'perebutan' && juara3Match?.pemenang && (
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400 font-black text-sm">🥉</span>
                            <span className="text-orange-300 text-sm">
                              {juara3Match.pemenang === 'merah' ? juara3Match.peserta_merah : juara3Match.peserta_biru}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bracket matches per babak */}
                  <div className="overflow-x-auto">
                    <div className="flex gap-4 min-w-max pb-2">
                      {babakList.map(babak => (
                        <div key={babak} className="flex flex-col gap-2">
                          <p className="text-center text-yellow-400 text-xs font-bold tracking-widest mb-1">
                            {getBabakLabel(babak)}
                          </p>
                          {matches.filter(m => m.babak === babak).map(match => (
                            <div key={match.id}
                              className="bg-gray-700 border border-gray-600 rounded-xl p-2.5 w-48 text-xs">
                              {match.is_bye ? (
                                <div className="text-center text-gray-500 py-2 text-xs">— BYE —</div>
                              ) : (
                                <>
                                  {/* Peserta Merah */}
                                  <div
                                    onClick={() => !match.pemenang && pilihPemenang(b.id, match, 'merah')}
                                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg mb-1 transition-all
                                      ${match.pemenang === 'merah' ? 'bg-red-700' : 'bg-gray-600'}
                                      ${!match.pemenang && match.peserta_merah ? 'cursor-pointer hover:bg-red-800' : ''}
                                      ${konfirmasiPemenang?.matchId === match.id && konfirmasiPemenang?.peserta === 'merah' ? 'ring-2 ring-yellow-400' : ''}`}>
                                    <span>🔴</span>
                                    <span className={`flex-1 truncate font-bold ${match.pemenang === 'merah' ? 'text-white' : 'text-gray-200'}`}>
                                      {match.peserta_merah || '—'}
                                    </span>
                                    {match.pemenang === 'merah' && <span className="text-yellow-400">🏆</span>}
                                  </div>

                                  {/* Peserta Biru */}
                                  <div
                                    onClick={() => !match.pemenang && pilihPemenang(b.id, match, 'biru')}
                                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all
                                      ${match.pemenang === 'biru' ? 'bg-blue-700' : 'bg-gray-600'}
                                      ${!match.pemenang && match.peserta_biru ? 'cursor-pointer hover:bg-blue-800' : ''}
                                      ${konfirmasiPemenang?.matchId === match.id && konfirmasiPemenang?.peserta === 'biru' ? 'ring-2 ring-yellow-400' : ''}`}>
                                    <span>🔵</span>
                                    <span className={`flex-1 truncate font-bold ${match.pemenang === 'biru' ? 'text-white' : 'text-gray-200'}`}>
                                      {match.peserta_biru || '—'}
                                    </span>
                                    {match.pemenang === 'biru' && <span className="text-yellow-400">🏆</span>}
                                  </div>

                                  {/* Konfirmasi pemenang */}
                                  {konfirmasiPemenang?.matchId === match.id && (
                                    <div className="mt-2 bg-yellow-900 border border-yellow-600 rounded-lg p-2 text-center">
                                      <p className="text-yellow-300 text-xs mb-1.5 font-bold">Konfirmasi pemenang?</p>
                                      <div className="flex gap-1">
                                        <button onClick={() => pilihPemenang(b.id, match, konfirmasiPemenang.peserta)}
                                          className="flex-1 bg-green-600 hover:bg-green-500 py-1 rounded-lg text-xs font-bold text-white">
                                          ✅ Ya
                                        </button>
                                        <button onClick={() => setKonfirmasiPemenang(null)}
                                          className="flex-1 bg-gray-600 hover:bg-gray-500 py-1 rounded-lg text-xs font-bold text-white">
                                          ❌ Batal
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Ubah pemenang */}
                                  {match.pemenang && (
                                    <button onClick={() => ubahPemenang(match)}
                                      className="w-full mt-1.5 text-gray-500 hover:text-gray-300 text-xs text-center">
                                      ✏️ Ubah
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </main>
  )
}