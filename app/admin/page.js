'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Admin() {
  const [merah, setMerah] = useState('')
  const [biru, setBiru] = useState('')
  const [kategori, setKategori] = useState('')
  const [pertandingan, setPertandingan] = useState([])

  useEffect(() => {
    fetchPertandingan()
  }, [])

  async function fetchPertandingan() {
    const { data } = await supabase.from('pertandingan').select('*').order('id', { ascending: false })
    setPertandingan(data || [])
  }

  async function tambahPertandingan() {
    if (!merah || !biru || !kategori) return alert('Isi semua field!')
    await supabase.from('pertandingan').insert({ peserta_merah: merah, peserta_biru: biru, kategori })
    setMerah(''); setBiru(''); setKategori('')
    fetchPertandingan()
  }

  async function hapusPertandingan(id) {
    await supabase.from('nilai_tanding').delete().eq('pertandingan_id', id)
    await supabase.from('pertandingan').delete().eq('id', id)
    fetchPertandingan()
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold text-yellow-400 mb-6">🛡️ Admin & Bracket</h1>
      <div className="bg-gray-800 p-4 rounded-xl mb-6">
        <h2 className="text-xl font-semibold mb-4">Tambah Pertandingan</h2>
        <input className="w-full bg-gray-700 p-2 rounded mb-2" placeholder="Nama Peserta Merah" value={merah} onChange={e => setMerah(e.target.value)} />
        <input className="w-full bg-gray-700 p-2 rounded mb-2" placeholder="Nama Peserta Biru" value={biru} onChange={e => setBiru(e.target.value)} />
        <input className="w-full bg-gray-700 p-2 rounded mb-4" placeholder="Kategori (misal: Kelas A U-14 -45kg)" value={kategori} onChange={e => setKategori(e.target.value)} />
        <button onClick={tambahPertandingan} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-6 rounded">
          Tambah
        </button>
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-4">Daftar Pertandingan</h2>
        {pertandingan.map(p => (
          <div key={p.id} className="bg-gray-800 p-4 rounded-xl mb-3 flex justify-between items-center">
            <div>
              <p className="font-bold">{p.kategori}</p>
              <p><span className="text-red-400">{p.peserta_merah}</span> vs <span className="text-blue-400">{p.peserta_biru}</span></p>
              <p className="text-sm text-gray-400">ID: {p.id}</p>
            </div>
            <button onClick={() => hapusPertandingan(p.id)} className="text-red-400 hover:text-red-300">Hapus</button>
          </div>
        ))}
      </div>
    </main>
  )
}