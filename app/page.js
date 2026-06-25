'use client'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold text-yellow-400">⚔️ Perisai Diri Scoring</h1>
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <Link href="/admin" className="bg-blue-600 hover:bg-blue-700 text-white text-center py-4 rounded-xl text-xl font-semibold">
          🛡️ Admin & Bracket
        </Link>
        <Link href="/juri" className="bg-green-600 hover:bg-green-700 text-white text-center py-4 rounded-xl text-xl font-semibold">
          👊 Input Juri
        </Link>
        <Link href="/dewan" className="bg-orange-600 hover:bg-orange-700 text-white text-center py-4 rounded-xl text-xl font-semibold">
          ⚖️ Dewan
        </Link>
        <Link href="/tv" className="bg-red-600 hover:bg-red-700 text-white text-center py-4 rounded-xl text-xl font-semibold">
          📺 Layar TV
        </Link>
      </div>
    </main>
  )
}