#!/bin/bash

echo "🔧 Chorono NextJS CSS Cache Temizleme Scripti"
echo "================================================"

# 1. Port 2000'de çalışan process'i kapat
echo "📛 Port 2000'de çalışan process kapatılıyor..."
lsof -ti:2000 | xargs kill -9 2>/dev/null && echo "✅ Process kapatıldı" || echo "ⓘ Port 2000'de aktif process yok"

# 2. Next.js cache'ini temizle
echo "🗑️  Cache ve build dosyaları siliniyor..."
rm -rf .next
rm -rf node_modules/.cache
echo "✅ Cache temizlendi"

# 3. Rebuild
echo "🔨 Rebuild başlıyor..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build başarısız oldu"
  exit 1
fi
echo "✅ Build tamamlandı"

# 4. Dev server'ı başlat
echo "🚀 Dev server başlatılıyor (port 2000)..."
npm run dev
