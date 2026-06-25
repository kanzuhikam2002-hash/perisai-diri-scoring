'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const USIA_OPTIONS = ['Dini 1', 'Dini 2', 'Pra Remaja', 'Remaja', 'Dewasa']
const KELAS_OPTIONS = ['Under A', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'Eksibisi']

export default function Admin() {
  const [pertandingan, setPertandingan] = useState([])
  const [kontingenList, setKontingenList] = useState([])
  const [form, setForm] = useState({
    usia: '',
    kelas: '',
    kontingen_merah: '',
    kontingen_biru: '',
    peserta_merah: '',
    peserta_biru: '',
  })
  const [showSuggestMerah, setShowSuggestMerah] = useState(false)
  const [showSuggestBiru, setShowSuggestBiru] = useState(false)

  useEffect(() => {
    fetchPertandingan()
  }, [])

  async function fetchPertandingan() {
    const { data } = await supabase.from('pertandingan').select('*').order('id', { ascending: false })
    setPertandingan(data || [])

    // Kumpulkan kontingen unik dari data existing
    const semua = data || []
    const kontingen = new Set()
    semua.forEach(p => {
      if (p.kontingen_merah) kontingen.add(p.kontingen_merah)
      if (p.kontingen_biru) kontingen.add(p.kontingen_biru)
    })
    setKontingenList([...kontingen])
  }

  function getKategori() {
    if (!form.usia || !form.kelas) return ''
    return `${form.usia} - ${form.kelas}`
  }

  async function tambahPertandingan() {
    if (!form.usia || !form.kelas || !form.peserta_merah || !form.peserta_biru) return alert('Lengkapi semua field!')
    await supabase.from('pertandingan').insert({
      kategori: getKategori(),
      kontingen_merah: form.kontingen_merah,
      kontingen_biru: form.kontingen_biru,
      peserta_merah: form.peserta_merah,
      peserta_biru: form.peserta_biru,
      status: 'aktif'
    })
    setForm({ usia: '', kelas: '', kontingen_merah: '', kontingen_biru: '', peserta_merah: '', peserta_biru: '' })
    fetchPertandingan()
  }

  async function hapusPertandingan(id) {
    if (!confirm('Hapus pertandingan ini?')) return
    await supabase.from('pertandingan').delete().eq('id', id)
    fetchPertandingan()
  }

  const filterKontingen = (val) =>
    kontingenList.filter(k => k.toLowerCase().includes(val.toLowerCase()) && val.length > 0)

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold text-purple-400 mb-6">🛠️ Admin</h1>

      {/* Form Tambah */}
      <div className="bg-gray-800 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">Tambah Pertandingan</h2>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-gray-400 text-sm block mb-1">Usia</label>
            <select value={form.usia} onChange={e => setForm({ ...form, usia: e.target.value })}
              className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white">
              <option value="">Pilih Usia</option>
              {USIA_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Kelas</label>
            <select value={form.kelas} onChange={e => setForm({ ...form, kelas: e.target.value })}
              className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white">
              <option value="">Pilih Kelas</option>
              {KELAS_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        {form.usia && form.kelas && (
          <p className="text-yellow-400 text-sm mb-3">Kategori: <strong>{getKategori()}</strong></p>
        )}

        {/* Sudut Merah */}
        <div className="bg-red-950 rounded-xl p-3 mb-3">
          <p className="text-red-300 font-bold text-sm mb-2">🔴 Sudut Merah</p>
          <div className="relative mb-2">
            <label className="text-gray-400 text-xs block mb-1">Kontingen</label>
            <input
              value={form.kontingen_merah}
              onChange={e => { setForm({ ...form, kontingen_merah: e.target.value }); setShowSuggestMerah(true) }}
              onBlur={() => setTimeout(() => setShowSuggestMerah(false), 150)}
              placeholder="Nama kontingen..."
              className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white"
            />
            {showSuggestMerah && filterKontingen(form.kontingen_merah).length > 0 && (
              <div className="absolute z-10 w-full bg-gray-700 rounded-lg mt-1 shadow-lg">
                {filterKontingen(form.kontingen_merah).map(k => (
                  <button key={k} onMouseDown={() => setForm({ ...form, kontingen_merah: k })}
                    className="w-full text-left px-3 py-2 hover:bg-gray-600 text-sm">
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="text-gray-400 text-xs block mb-1">Nama Peserta</label>
          <input
            value={form.peserta_merah}
            onChange={e => setForm({ ...form, peserta_merah: e.target.value })}
            placeholder="Nama peserta merah..."
            className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white"
          />
        </div>

        {/* Sudut Biru */}
        <div className="bg-blue-950 rounded-xl p-3 mb-4">
          <p className="text-blue-300 font-bold text-sm mb-2">🔵 Sudut Biru</p>
          <div className="relative mb-2">
            <label className="text-gray-400 text-xs block mb-1">Kontingen</label>
            <input
              value={form.kontingen_biru}
              onChange={e => { setForm({ ...form, kontingen_biru: e.target.value }); setShowSuggestBiru(true) }}
              onBlur={() => setTimeout(() => setShowSuggestBiru(false), 150)}
              placeholder="Nama kontingen..."
              className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white"
            />
            {showSuggestBiru && filterKontingen(form.kontingen_biru).length > 0 && (
              <div className="absolute z-10 w-full bg-gray-700 rounded-lg mt-1 shadow-lg">
                {filterKontingen(form.kontingen_biru).map(k => (
                  <button key={k} onMouseDown={() => setForm({ ...form, kontingen_biru: k })}
                    className="w-full text-left px-3 py-2 hover:bg-gray-600 text-sm">
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="text-gray-400 text-xs block mb-1">Nama Peserta</label>
          <input
            value={form.peserta_biru}
            onChange={e => setForm({ ...form, peserta_biru: e.target.value })}
            placeholder="Nama peserta biru..."
            className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <button onClick={tambahPertandingan}
          className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-xl font-bold text-lg">
          ➕ Tambah Pertandingan
        </button>
      </div>

      {/* List Pertandingan */}
      <h2 className="text-lg font-bold text-white mb-3">Daftar Pertandingan</h2>
      {pertandingan.map(p => (
        <div key={p.id} className="bg-gray-800 rounded-xl p-4 mb-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-bold text-yellow-400">{p.kategori}</p>
              <p className="text-sm mt-1">
                <span className="font-bold text-white bg-red-700 px-2 py-0.5 rounded mr-1">🔴 {p.peserta_merah}</span>
                <span className="text-gray-400 text-xs">{p.kontingen_merah}</span>
              </p>
              <p className="text-sm mt-1">
                <span className="font-bold text-white bg-blue-700 px-2 py-0.5 rounded mr-1">🔵 {p.peserta_biru}</span>
                <span className="text-gray-400 text-xs">{p.kontingen_biru}</span>
              </p>
            </div>
            <button onClick={() => hapusPertandingan(p.id)} className="text-red-400 hover:text-red-300 text-sm">🗑️</button>
          </div>
        </div>
      ))}
    </main>
  )
}