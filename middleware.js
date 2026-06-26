import { NextResponse } from 'next/server'

const maintenanceEnabled = process.env.MAINTENANCE_MODE !== 'off'

export function middleware(req) {
  if (!maintenanceEnabled) {
    return NextResponse.next()
  }

  const { pathname } = req.nextUrl

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/api/unlock') ||
    pathname === '/maintenance' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const cookie = req.cookies.get('maintenance-unlocked')
  if (cookie && cookie.value === '1') {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/maintenance'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
