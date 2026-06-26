-- RESET sesi_dewan terlebih dahulu
DELETE FROM sesi_dewan;
INSERT INTO sesi_dewan (device_id) VALUES (NULL);

-- Update sesi_aktif: tambah kolom ronde dan status
ALTER TABLE sesi_aktif ADD COLUMN IF NOT EXISTS ronde INTEGER DEFAULT 1;
ALTER TABLE sesi_aktif ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'menunggu';

-- Initialize sesi_aktif dengan row id=1 kalau belum ada
INSERT INTO sesi_aktif (id, ronde, status) VALUES (1, 1, 'menunggu')
ON CONFLICT (id) DO NOTHING;

-- Tabel slot juri (presence-based lock)
CREATE TABLE IF NOT EXISTS sesi_juri (
  id SERIAL PRIMARY KEY,
  pertandingan_id INTEGER REFERENCES pertandingan(id),
  nomor_juri INTEGER, -- 1, 2, 3
  device_id TEXT, -- random UUID dari client
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel lock dewan (1 device)
CREATE TABLE IF NOT EXISTS sesi_dewan (
  id SERIAL PRIMARY KEY,
  device_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel peserta bagan
CREATE TABLE IF NOT EXISTS bracket_peserta (
  id SERIAL PRIMARY KEY,
  kategori TEXT NOT NULL,
  nama TEXT NOT NULL,
  kontingen TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel bagan per kategori
CREATE TABLE IF NOT EXISTS bracket (
  id SERIAL PRIMARY KEY,
  kategori TEXT NOT NULL,
  sistem_juara3 TEXT DEFAULT 'dua_juara3', -- 'dua_juara3' atau 'perebutan'
  sudah_diacak BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel match dalam bagan
CREATE TABLE IF NOT EXISTS bracket_match (
  id SERIAL PRIMARY KEY,
  bracket_id INTEGER REFERENCES bracket(id) ON DELETE CASCADE,
  babak INTEGER, -- 1=R1, 2=QF, 3=SF, 4=Final, 5=Juara3
  posisi INTEGER, -- urutan match dalam babak
  peserta_merah TEXT,
  peserta_biru TEXT,
  kontingen_merah TEXT,
  kontingen_biru TEXT,
  pemenang TEXT, -- 'merah' atau 'biru'
  is_bye BOOLEAN DEFAULT FALSE,
  pertandingan_id INTEGER REFERENCES pertandingan(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE sesi_juri;
ALTER PUBLICATION supabase_realtime ADD TABLE sesi_dewan;
ALTER PUBLICATION supabase_realtime ADD TABLE bracket;
ALTER PUBLICATION supabase_realtime ADD TABLE bracket_match;
ALTER PUBLICATION supabase_realtime ADD TABLE bracket_peserta;
