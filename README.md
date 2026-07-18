# Roti Maryam - Web App (Firebase)

Versi web dari aplikasi Roti Maryam: Login, Stock, Invoice (harga + diskon bebas),
Kas (pemasukan/pengeluaran), dan Laporan harian/mingguan/bulanan. Jalan di browser,
data tersimpan di Firestore (cloud), auth pakai Firebase Authentication.

Struktur file:
```
rotimariam_web/
├─ public/
│  ├─ index.html
│  ├─ css/style.css
│  └─ js/
│     ├─ firebase-config.js   <- isi dengan config project Anda
│     └─ app.js
├─ firebase.json
├─ .firebaserc                <- isi dengan Project ID Anda
├─ firestore.rules
└─ firestore.indexes.json
```

## Langkah Setup dari Nol

### 1. Buat Project Firebase
1. Buka https://console.firebase.google.com, login pakai akun Google.
2. Klik **Add project** (Tambah project), beri nama misalnya `rotimariam`.
3. Ikuti wizard sampai selesai (Google Analytics boleh dimatikan, tidak wajib).

### 2. Aktifkan Authentication
1. Di sidebar kiri, buka **Build > Authentication**.
2. Klik **Get started**.
3. Pilih provider **Email/Password**, aktifkan (toggle Enable), Save.
4. Buka tab **Users**, klik **Add user**. Isi email & password untuk login ke aplikasi
   (ini akun yang nanti dipakai login di web). Bisa tambah lebih dari satu user
   kalau ada beberapa orang yang perlu akses.

### 3. Aktifkan Firestore Database
1. Di sidebar kiri, buka **Build > Firestore Database**.
2. Klik **Create database**.
3. Pilih lokasi server (mis. `asia-southeast2 (Jakarta)` biar dekat & cepat).
4. Pilih mode **Production** (aturan keamanan sudah disediakan di `firestore.rules`).

### 4. Ambil Config Web App
1. Di halaman utama project, klik ikon **</>  (Web)** untuk mendaftarkan web app.
2. Beri nickname (mis. `rotimariam-web`), klik **Register app**.
3. Firebase akan menampilkan blok `firebaseConfig = {...}`. Salin semua isinya.
4. Buka file `public/js/firebase-config.js` di project ini, ganti seluruh isi
   `firebaseConfig` dengan yang baru saja disalin.
5. Buka file `.firebaserc`, ganti `GANTI-DENGAN-PROJECT-ID-ANDA` dengan
   **Project ID** Anda (terlihat di Project Settings, bukan nama project).

### 5. Install Firebase CLI & Deploy
Di komputer Anda (butuh Node.js terinstall):
```bash
npm install -g firebase-tools
firebase login
cd rotimariam_web
firebase deploy
```
Setelah selesai, CLI akan menampilkan **Hosting URL** (bentuknya
`https://rotimariam-xxxxx.web.app`) — itu alamat website Anda. Bisa juga
dihubungkan ke domain sendiri lewat **Hosting > Add custom domain** di console.

### 6. Login Pertama Kali
Buka Hosting URL di browser, login pakai email/password yang dibuat di langkah 2.
Produk "Roti Maryam" default akan otomatis dibuat saat pertama kali login.

## Catatan

- **Tidak ada pendaftaran akun publik** — semua akun login dibuat manual lewat
  Firebase Console (Authentication > Users), supaya orang luar tidak bisa
  daftar sendiri ke aplikasi kasir/invoice ini.
- **Update kode**: setelah edit file di `public/`, jalankan `firebase deploy` lagi
  untuk publish perubahan.
- **Notifikasi stok menipis**: ambang batasnya bisa diubah lewat variabel
  `LOW_STOCK_THRESHOLD` di `public/js/app.js`.
- **Export PDF/Excel** langsung diproses di browser (tidak perlu server tambahan).
- Biaya: untuk skala UMKM, penggunaan Firestore/Hosting/Auth biasanya masih
  masuk **free tier (Spark plan)** Firebase.
