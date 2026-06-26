import { NextResponse } from 'next/server'

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}))

  const EXPECTED = process.env.MAINTENANCE_PASSWORD || 'secret123'

  if (password === EXPECTED) {
    const res = NextResponse.json({ ok: true })
    res.headers.set('Set-Cookie', 'maintenance-unlocked=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400')
    return res
  }

  return NextResponse.json({ ok: false, message: 'Password salah' }, { status: 401 })
}
