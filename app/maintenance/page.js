"use client"
import { useState } from 'react'

export default function MaintenancePage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
        credentials: 'same-origin',
      })

      if (res.ok) {
        window.location.href = '/'
      } else {
        const data = await res.json()
        setError(data?.message || 'Password salah')
      }
    } catch (err) {
      setError('Terjadi kesalahan')
    }
  }

  return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#fff'}}>
      <div style={{position:'absolute',top:12,right:12,opacity:0.6,fontSize:12}}>
        server sedang dalam maintenance
      </div>

      <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:8,alignItems:'center'}}>
        <label style={{fontSize:12,opacity:0.8}}>masuk (password)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{padding:6,borderRadius:4,border:'1px solid #ccc'}}
        />
        <button type="submit" style={{padding:'6px 12px',borderRadius:4}}>unlock</button>
        {error && <div style={{color:'red',fontSize:12}}>{error}</div>}
      </form>
    </div>
  )
}
