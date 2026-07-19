// app.js - Roti Maryam web app (Firebase Auth + Firestore)
// Struktur data sengaja mirip versi Python (produk, stok_log, invoice, kas)
// supaya gampang dipahami / dibandingkan.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDocs,
  query, orderBy, limit, increment, serverTimestamp, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbf = getFirestore(app);

const LOW_STOCK_THRESHOLD = 10;

// ---------- HELPERS ----------

function formatRp(value) {
  const n = Number(value) || 0;
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function $(id) { return document.getElementById(id); }

// ---------- DARK MODE ----------

const ACTIVE_TAB_CLASSES = ["border-coklat", "text-coklat", "dark:text-amber-400", "dark:border-amber-400", "font-semibold"];
const INACTIVE_TAB_CLASSES = ["border-transparent", "text-gray-500", "dark:text-gray-400"];

function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  const icon = isDark ? "☀️" : "🌙";
  if ($("theme-toggle")) $("theme-toggle").textContent = icon;
  if ($("theme-toggle-app")) $("theme-toggle-app").textContent = icon;
}

function initTheme() {
  const saved = localStorage.getItem("rotimariam-theme");
  const isDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(isDark);
}

function toggleTheme() {
  const isDark = !document.documentElement.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem("rotimariam-theme", isDark ? "dark" : "light");
}

initTheme();
if ($("theme-toggle")) $("theme-toggle").addEventListener("click", toggleTheme);
if ($("theme-toggle-app")) $("theme-toggle-app").addEventListener("click", toggleTheme);

// ---------- AUTH ----------

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  $("login-error").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    $("login-error").textContent = "Login gagal: email/password salah.";
  }
});

$("logout-btn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    $("login-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
    $("user-email").textContent = user.email;
    initAppData();
  } else {
    $("app-shell").classList.add("hidden");
    $("login-screen").classList.remove("hidden");
  }
});

// ---------- TAB SWITCHING ----------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove(...ACTIVE_TAB_CLASSES);
      b.classList.add(...INACTIVE_TAB_CLASSES);
    });
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));

    btn.classList.remove(...INACTIVE_TAB_CLASSES);
    btn.classList.add(...ACTIVE_TAB_CLASSES);
    $("tab-" + btn.dataset.tab).classList.remove("hidden");
  });
});

// ---------- STATE ----------

let produkCache = [];   // [{id, nama, satuan, harga, stok}]
let invoiceCache = [];  // [{id, ...}]
let kasCache = [];      // [{id, ...}]
let stokLogCache = [];  // [{id, produk_id, nama_produk, tanggal, jenis, jumlah, keterangan}]
let tempItems = [];     // item invoice yang belum disimpan

async function initAppData() {
  $("inv-tanggal").value = todayStr();
  $("kas-tanggal").value = todayStr();
  await seedProdukJikaKosong();
  await Promise.all([loadProduk(), loadInvoices(), loadKas(), loadStokLog()]);
  tampilkanPeriode("hari");
}

async function seedProdukJikaKosong() {
  const snap = await getDocs(collection(dbf, "produk"));
  if (snap.empty) {
    await addDoc(collection(dbf, "produk"), {
      nama: "Roti Maryam", satuan: "pcs", harga: 5000, stok: 0,
    });
  }
}

// ============================================================
// STOCK
// ============================================================

async function loadProduk() {
  const snap = await getDocs(query(collection(dbf, "produk"), orderBy("nama")));
  produkCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderProdukTable();
  renderProdukSelects();
  checkNotifikasi();
}

function renderProdukTable() {
  $("tabel-produk").innerHTML = produkCache.map((p) => `
    <tr>
      <td>${p.nama}</td>
      <td>${p.satuan}</td>
      <td>${formatRp(p.harga)}</td>
      <td>${p.stok}</td>
      <td><button class="btn-secondary" onclick="window._ubahHarga('${p.id}')">Ubah Harga</button></td>
    </tr>`).join("");
}

function renderProdukSelects() {
  const opts = produkCache.map((p) => `<option value="${p.id}">${p.nama}</option>`).join("");
  $("stok-produk").innerHTML = opts;
  $("inv-produk").innerHTML = opts;
  if (produkCache.length) autofillHargaInvoice();
}

window._ubahHarga = async function (produkId) {
  const p = produkCache.find((x) => x.id === produkId);
  if (!p) return;
  const baru = prompt(`Harga baru untuk ${p.nama}:`, p.harga);
  if (baru === null) return;
  const harga = Number(baru);
  if (Number.isNaN(harga) || harga < 0) { alert("Harga tidak valid."); return; }
  await updateDoc(doc(dbf, "produk", produkId), { harga });
  await loadProduk();
};

$("btn-produk-baru").addEventListener("click", async () => {
  const nama = prompt("Nama produk:");
  if (!nama) return;
  const satuan = prompt("Satuan (mis. pcs):", "pcs") || "pcs";
  const harga = Number(prompt("Harga jual:", "0")) || 0;
  await addDoc(collection(dbf, "produk"), { nama, satuan, harga, stok: 0 });
  await loadProduk();
});

$("form-stok").addEventListener("submit", async (e) => {
  e.preventDefault();
  const produkId = $("stok-produk").value;
  const jenis = $("stok-jenis").value;
  const jumlah = Number($("stok-jumlah").value);
  const keterangan = $("stok-keterangan").value;
  if (!produkId || !jumlah || jumlah <= 0) { alert("Pilih produk & isi jumlah yang valid."); return; }

  const p = produkCache.find((x) => x.id === produkId);
  const delta = jenis === "masuk" ? jumlah : -jumlah;

  await updateDoc(doc(dbf, "produk", produkId), { stok: increment(delta) });
  await addDoc(collection(dbf, "stok_log"), {
    produk_id: produkId, nama_produk: p ? p.nama : "-",
    tanggal: todayStr(), jenis, jumlah, keterangan, createdAt: serverTimestamp(),
  });

  $("stok-jumlah").value = "";
  $("stok-keterangan").value = "";
  await loadProduk();
  await loadStokLog();
});

async function loadStokLog() {
  const snap = await getDocs(query(collection(dbf, "stok_log"), orderBy("createdAt", "desc"), limit(50)));
  stokLogCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  $("tabel-stok-log").innerHTML = stokLogCache.map((r) => `
    <tr>
      <td>${r.tanggal}</td><td>${r.nama_produk}</td><td>${r.jenis}</td>
      <td>${r.jumlah}</td><td>${r.keterangan || ""}</td>
      <td><button class="btn-secondary" onclick="window._hapusStokLog('${r.id}')">Hapus</button></td>
    </tr>`).join("");
}

window._hapusStokLog = async function (logId) {
  const log = stokLogCache.find((x) => x.id === logId);
  if (!log) return;
  if (!confirm(`Hapus riwayat "${log.jenis} ${log.jumlah} ${log.nama_produk}"? Stok akan otomatis dikembalikan.`)) return;

  // Balikkan efeknya ke stok produk (kebalikan dari jenis semula)
  const delta = log.jenis === "masuk" ? -log.jumlah : log.jumlah;
  if (log.produk_id) {
    await updateDoc(doc(dbf, "produk", log.produk_id), { stok: increment(delta) });
  }
  await deleteDoc(doc(dbf, "stok_log", logId));

  await Promise.all([loadProduk(), loadStokLog()]);
};

function checkNotifikasi() {
  const menipis = produkCache.filter((p) => p.stok <= LOW_STOCK_THRESHOLD);
  const banner = $("notif-banner");
  if (menipis.length) {
    banner.textContent = "⚠ Stok menipis: " + menipis.map((p) => `${p.nama} (${p.stok})`).join(", ");
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

// ============================================================
// INVOICE
// ============================================================

function autofillHargaInvoice() {
  const p = produkCache.find((x) => x.id === $("inv-produk").value);
  if (p) $("inv-harga").value = p.harga;
}
$("inv-produk").addEventListener("change", autofillHargaInvoice);

$("form-invoice-item").addEventListener("submit", (e) => {
  e.preventDefault();
  const produkId = $("inv-produk").value;
  const p = produkCache.find((x) => x.id === produkId);
  const qty = Number($("inv-qty").value);
  const harga = Number($("inv-harga").value);
  if (!p || !qty || qty <= 0 || harga < 0) { alert("Qty/Harga tidak valid."); return; }

  if (qty > p.stok) {
    if (!confirm(`Stok ${p.nama} tinggal ${p.stok}. Tetap lanjut?`)) return;
  }

  tempItems.push({ produk_id: p.id, nama_produk: p.nama, qty, harga_satuan: harga, subtotal: qty * harga });
  renderTempItems();
});

function renderTempItems() {
  $("tabel-item-invoice").innerHTML = tempItems.map((it, idx) => `
    <tr>
      <td>${it.nama_produk}</td><td>${it.qty}</td><td>${formatRp(it.harga_satuan)}</td>
      <td>${formatRp(it.subtotal)}</td>
      <td><button class="btn-secondary" onclick="window._hapusItem(${idx})">Hapus</button></td>
    </tr>`).join("");
  updateTotalPreview();
}

window._hapusItem = function (idx) {
  tempItems.splice(idx, 1);
  renderTempItems();
};

function hitungTotal() {
  const subtotal = tempItems.reduce((s, it) => s + it.subtotal, 0);
  const diskonPersen = Number($("inv-diskon-persen").value) || 0;
  const diskonNominal = Number($("inv-diskon-nominal").value) || 0;
  const ongkir = Number($("inv-ongkir").value) || 0;
  const total = Math.max(subtotal - diskonNominal - (subtotal * diskonPersen / 100), 0) + ongkir;
  return { subtotal, diskonPersen, diskonNominal, ongkir, total };
}

function updateTotalPreview() {
  const { subtotal, ongkir, total } = hitungTotal();
  const ongkirText = ongkir ? ` + Ongkir ${formatRp(ongkir)}` : "";
  $("inv-total").textContent = `Total: ${formatRp(total)}  (Subtotal ${formatRp(subtotal)}${ongkirText})`;
}
["inv-diskon-persen", "inv-diskon-nominal", "inv-ongkir"].forEach((id) => $(id).addEventListener("input", updateTotalPreview));

async function generateNomorInvoice(tanggal) {
  const snap = await getDocs(query(collection(dbf, "invoice"), where("tanggal", "==", tanggal)));
  const kode = tanggal.replaceAll("-", "");
  return `INV-${kode}-${String(snap.size + 1).padStart(3, "0")}`;
}

$("btn-simpan-invoice").addEventListener("click", async () => {
  if (!tempItems.length) { alert("Tambahkan minimal 1 item."); return; }
  const tanggal = $("inv-tanggal").value || todayStr();
  const { subtotal, diskonPersen, diskonNominal, ongkir, total } = hitungTotal();
  const status = $("inv-status").value;
  const nomor = await generateNomorInvoice(tanggal);

  const invoiceRef = await addDoc(collection(dbf, "invoice"), {
    nomor, tanggal, nama_pelanggan: $("inv-pelanggan").value || "",
    subtotal, diskon_persen: diskonPersen, diskon_nominal: diskonNominal,
    ongkir, total, status, items: tempItems, createdAt: serverTimestamp(),
  });

  for (const it of tempItems) {
    await updateDoc(doc(dbf, "produk", it.produk_id), { stok: increment(-it.qty) });
    await addDoc(collection(dbf, "stok_log"), {
      produk_id: it.produk_id, nama_produk: it.nama_produk, tanggal,
      jenis: "keluar", jumlah: it.qty, keterangan: `Terjual - ${nomor}`, createdAt: serverTimestamp(),
    });
  }

  if (status === "lunas") {
    await addDoc(collection(dbf, "kas"), {
      tanggal, jenis: "pemasukan", kategori: "Penjualan", jumlah: total,
      keterangan: `Invoice ${nomor}`, ref_invoice_id: invoiceRef.id, createdAt: serverTimestamp(),
    });
  }

  alert(`Invoice ${nomor} disimpan.`);
  tempItems = [];
  renderTempItems();
  $("inv-pelanggan").value = "";
  $("inv-diskon-persen").value = 0;
  $("inv-diskon-nominal").value = 0;
  $("inv-ongkir").value = 0;

  await Promise.all([loadProduk(), loadInvoices(), loadKas(), loadStokLog()]);
});

async function loadInvoices() {
  const snap = await getDocs(query(collection(dbf, "invoice"), orderBy("createdAt", "desc"), limit(200)));
  invoiceCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderInvoiceTable();
}

function renderInvoiceTable() {
  $("tabel-invoice").innerHTML = invoiceCache.map((inv) => `
    <tr>
      <td>${inv.nomor}</td><td>${inv.tanggal}</td><td>${inv.nama_pelanggan || "-"}</td>
      <td>${formatRp(inv.total)}</td><td>${inv.status}</td>
      <td>
        <button class="btn-secondary" onclick="window._exportPdf('${inv.id}')">PDF</button>
        <button class="btn-secondary" onclick="window._exportPng('${inv.id}')">PNG</button>
        ${inv.status !== "lunas" ? `<button class="btn-secondary" onclick="window._tandaiLunas('${inv.id}')">Lunas</button>` : ""}
        <button class="btn-secondary" onclick="window._hapusInvoice('${inv.id}')">Hapus</button>
      </td>
    </tr>`).join("");
}

window._hapusInvoice = async function (invoiceId) {
  const inv = invoiceCache.find((x) => x.id === invoiceId);
  if (!inv) return;
  if (!confirm(`Hapus invoice ${inv.nomor}? Stok yang terjual akan dikembalikan, dan catatan kas terkait akan ikut dihapus.`)) return;

  // Kembalikan stok tiap item
  for (const it of inv.items || []) {
    if (!it.produk_id) continue;
    await updateDoc(doc(dbf, "produk", it.produk_id), { stok: increment(it.qty) });
    await addDoc(collection(dbf, "stok_log"), {
      produk_id: it.produk_id, nama_produk: it.nama_produk, tanggal: todayStr(),
      jenis: "masuk", jumlah: it.qty, keterangan: `Batal - ${inv.nomor}`, createdAt: serverTimestamp(),
    });
  }

  // Hapus catatan kas yang terkait invoice ini
  const kasSnap = await getDocs(query(collection(dbf, "kas"), where("ref_invoice_id", "==", invoiceId)));
  for (const kasDoc of kasSnap.docs) {
    await deleteDoc(doc(dbf, "kas", kasDoc.id));
  }

  await deleteDoc(doc(dbf, "invoice", invoiceId));

  await Promise.all([loadProduk(), loadInvoices(), loadKas(), loadStokLog()]);
};

window._tandaiLunas = async function (invoiceId) {
  const inv = invoiceCache.find((x) => x.id === invoiceId);
  if (!inv || inv.status === "lunas") return;
  await updateDoc(doc(dbf, "invoice", invoiceId), { status: "lunas" });
  await addDoc(collection(dbf, "kas"), {
    tanggal: todayStr(), jenis: "pemasukan", kategori: "Penjualan",
    jumlah: inv.total, keterangan: `Invoice ${inv.nomor}`, ref_invoice_id: invoiceId,
    createdAt: serverTimestamp(),
  });
  await Promise.all([loadInvoices(), loadKas()]);
};

window._exportPdf = function (invoiceId) {
  const inv = invoiceCache.find((x) => x.id === invoiceId);
  if (!inv) return;
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({ format: "a5" });

  docPdf.setFontSize(16);
  docPdf.text("Roti Maryam", 12, 15);
  docPdf.setFontSize(12);
  docPdf.text("INVOICE", 12, 22);

  docPdf.setFontSize(10);
  docPdf.text(`No. Invoice : ${inv.nomor}`, 12, 32);
  docPdf.text(`Tanggal     : ${inv.tanggal}`, 12, 38);
  docPdf.text(`Pelanggan   : ${inv.nama_pelanggan || "-"}`, 12, 44);
  docPdf.text(`Status      : ${inv.status.toUpperCase()}`, 12, 50);

  let y = 60;
  docPdf.setFont(undefined, "bold");
  docPdf.text("Produk", 12, y);
  docPdf.text("Qty", 75, y);
  docPdf.text("Harga", 95, y);
  docPdf.text("Subtotal", 120, y);
  docPdf.setFont(undefined, "normal");
  y += 6;
  inv.items.forEach((it) => {
    docPdf.text(String(it.nama_produk), 12, y);
    docPdf.text(String(it.qty), 75, y);
    docPdf.text(formatRp(it.harga_satuan), 95, y);
    docPdf.text(formatRp(it.subtotal), 120, y);
    y += 6;
  });

  y += 4;
  docPdf.text(`Subtotal: ${formatRp(inv.subtotal)}`, 95, y); y += 6;
  if (inv.diskon_persen) { docPdf.text(`Diskon: ${inv.diskon_persen}%`, 95, y); y += 6; }
  if (inv.diskon_nominal) { docPdf.text(`Diskon: -${formatRp(inv.diskon_nominal)}`, 95, y); y += 6; }
  if (inv.ongkir) { docPdf.text(`Ongkir: ${formatRp(inv.ongkir)}`, 95, y); y += 6; }
  docPdf.setFont(undefined, "bold");
  docPdf.text(`TOTAL: ${formatRp(inv.total)}`, 95, y);

  docPdf.save(`${inv.nomor}.pdf`);
};

function buildInvoiceHtml(inv) {
  const itemRows = inv.items.map((it) => `
    <tr>
      <td style="padding:4px;border-bottom:1px solid #e5e7eb;">${it.nama_produk}</td>
      <td style="padding:4px;border-bottom:1px solid #e5e7eb;text-align:right;">${it.qty}</td>
      <td style="padding:4px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatRp(it.harga_satuan)}</td>
      <td style="padding:4px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatRp(it.subtotal)}</td>
    </tr>`).join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;width:380px;padding:24px;background:#fff;color:#111;">
      <h2 style="margin:0 0 2px;color:#4a3222;">Roti Maryam</h2>
      <h3 style="margin:0 0 16px;font-size:13px;letter-spacing:1px;color:#555;">INVOICE</h3>
      <table style="width:100%;font-size:12px;margin-bottom:14px;">
        <tr><td style="color:#666;padding:2px 0;">No. Invoice</td><td>${inv.nomor}</td></tr>
        <tr><td style="color:#666;padding:2px 0;">Tanggal</td><td>${inv.tanggal}</td></tr>
        <tr><td style="color:#666;padding:2px 0;">Pelanggan</td><td>${inv.nama_pelanggan || "-"}</td></tr>
        <tr><td style="color:#666;padding:2px 0;">Status</td><td>${inv.status.toUpperCase()}</td></tr>
      </table>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead>
          <tr style="background:#4a3222;color:#fff;">
            <th style="padding:5px;text-align:left;">Produk</th>
            <th style="padding:5px;text-align:right;">Qty</th>
            <th style="padding:5px;text-align:right;">Harga</th>
            <th style="padding:5px;text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="margin-top:12px;font-size:12px;text-align:right;">
        <div>Subtotal: ${formatRp(inv.subtotal)}</div>
        ${inv.diskon_persen ? `<div>Diskon: ${inv.diskon_persen}%</div>` : ""}
        ${inv.diskon_nominal ? `<div>Diskon: -${formatRp(inv.diskon_nominal)}</div>` : ""}
        ${inv.ongkir ? `<div>Ongkir: ${formatRp(inv.ongkir)}</div>` : ""}
        <div style="font-weight:bold;font-size:14px;margin-top:6px;color:#4a3222;">TOTAL: ${formatRp(inv.total)}</div>
      </div>
      <p style="margin-top:20px;font-size:11px;color:#888;">Terima kasih atas pembeliannya!</p>
    </div>`;
}

window._exportPng = async function (invoiceId) {
  const inv = invoiceCache.find((x) => x.id === invoiceId);
  if (!inv) return;
  const holder = $("invoice-render");
  holder.innerHTML = buildInvoiceHtml(inv);
  const canvas = await html2canvas(holder, { scale: 2, backgroundColor: "#ffffff" });
  const link = document.createElement("a");
  link.download = `${inv.nomor}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  holder.innerHTML = "";
};

$("btn-export-invoice-excel").addEventListener("click", () => {
  if (!invoiceCache.length) { alert("Belum ada invoice untuk di-export."); return; }
  const rows = invoiceCache.map((inv) => ({
    "No. Invoice": inv.nomor, Tanggal: inv.tanggal, Pelanggan: inv.nama_pelanggan || "-",
    Subtotal: inv.subtotal, "Diskon %": inv.diskon_persen, "Diskon Rp": inv.diskon_nominal,
    Ongkir: inv.ongkir || 0, Total: inv.total, Status: inv.status,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoice");
  XLSX.writeFile(wb, `invoice_${Date.now()}.xlsx`);
});

// ============================================================
// KAS
// ============================================================

$("form-kas").addEventListener("submit", async (e) => {
  e.preventDefault();
  const jumlah = Number($("kas-jumlah").value);
  if (!jumlah || jumlah <= 0) { alert("Jumlah harus angka lebih dari 0."); return; }

  await addDoc(collection(dbf, "kas"), {
    tanggal: $("kas-tanggal").value || todayStr(),
    jenis: $("kas-jenis").value,
    kategori: $("kas-kategori").value,
    jumlah,
    keterangan: $("kas-keterangan").value,
    ref_invoice_id: null,
    createdAt: serverTimestamp(),
  });

  $("kas-jumlah").value = "";
  $("kas-kategori").value = "";
  $("kas-keterangan").value = "";
  await loadKas();
});

async function loadKas() {
  const snap = await getDocs(query(collection(dbf, "kas"), orderBy("createdAt", "desc"), limit(300)));
  kasCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderKasTable();
  renderKasSummary();
}

function renderKasTable() {
  $("tabel-kas").innerHTML = kasCache.map((k) => `
    <tr>
      <td>${k.tanggal}</td><td>${k.jenis}</td><td>${k.kategori || "-"}</td>
      <td>${formatRp(k.jumlah)}</td><td>${k.keterangan || ""}</td>
      <td><button class="btn-secondary" onclick="window._hapusKas('${k.id}')">Hapus</button></td>
    </tr>`).join("");
}

window._hapusKas = async function (kasId) {
  const k = kasCache.find((x) => x.id === kasId);
  if (!k) return;
  if (!confirm(`Hapus transaksi kas "${k.jenis} ${formatRp(k.jumlah)}"?`)) return;
  await deleteDoc(doc(dbf, "kas", kasId));
  await loadKas();
};

function renderKasSummary() {
  const pemasukan = kasCache.filter((k) => k.jenis === "pemasukan").reduce((s, k) => s + k.jumlah, 0);
  const pengeluaran = kasCache.filter((k) => k.jenis === "pengeluaran").reduce((s, k) => s + k.jumlah, 0);
  $("kas-pemasukan").textContent = formatRp(pemasukan);
  $("kas-pengeluaran").textContent = formatRp(pengeluaran);
  $("kas-saldo").textContent = formatRp(pemasukan - pengeluaran);
}

$("btn-export-kas-excel").addEventListener("click", () => {
  if (!kasCache.length) { alert("Belum ada transaksi kas untuk di-export."); return; }
  const rows = kasCache.map((k) => ({
    Tanggal: k.tanggal, Jenis: k.jenis, Kategori: k.kategori || "-",
    Jumlah: k.jumlah, Keterangan: k.keterangan || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Kas");
  XLSX.writeFile(wb, `kas_${Date.now()}.xlsx`);
});

// ============================================================
// LAPORAN (HARIAN / MINGGUAN / BULANAN)
// ============================================================

let laporanState = { label: "", rows: [], pemasukan: 0, pengeluaran: 0, saldo: 0, qtyTerjual: 0 };

document.querySelectorAll("[data-periode]").forEach((btn) => {
  btn.addEventListener("click", () => tampilkanPeriode(btn.dataset.periode));
});
$("btn-lap-custom").addEventListener("click", () => {
  const dari = $("lap-dari").value, sampai = $("lap-sampai").value;
  if (!dari || !sampai) { alert("Isi tanggal 'Dari' dan 'Sampai'."); return; }
  renderLaporan(dari, sampai, `Laporan ${dari} s/d ${sampai}`);
});

function tampilkanPeriode(mode) {
  const today = new Date();
  let mulai = new Date(today), akhir = new Date(today), label = "";

  if (mode === "hari") {
    label = `Laporan Hari Ini (${today.toLocaleDateString("id-ID")})`;
  } else if (mode === "minggu") {
    const day = (today.getDay() + 6) % 7; // Senin = 0
    mulai.setDate(today.getDate() - day);
    label = `Laporan Minggu Ini (${mulai.toLocaleDateString("id-ID")} s/d ${akhir.toLocaleDateString("id-ID")})`;
  } else {
    mulai = new Date(today.getFullYear(), today.getMonth(), 1);
    label = `Laporan Bulan Ini (${mulai.toLocaleDateString("id-ID", { month: "long", year: "numeric" })})`;
  }

  const mulaiStr = mulai.toISOString().slice(0, 10);
  const akhirStr = akhir.toISOString().slice(0, 10);
  $("lap-dari").value = mulaiStr;
  $("lap-sampai").value = akhirStr;
  renderLaporan(mulaiStr, akhirStr, label);
}

function renderLaporan(mulaiStr, akhirStr, label) {
  const rows = kasCache.filter((k) => k.tanggal >= mulaiStr && k.tanggal <= akhirStr);
  const pemasukan = rows.filter((k) => k.jenis === "pemasukan").reduce((s, k) => s + k.jumlah, 0);
  const pengeluaran = rows.filter((k) => k.jenis === "pengeluaran").reduce((s, k) => s + k.jumlah, 0);

  // qty roti terjual: cari dari stok_log (perlu fetch terpisah karena tidak selalu ter-cache)
  getDocs(query(collection(dbf, "stok_log"), where("jenis", "==", "keluar"))).then((snap) => {
    const qty = snap.docs
      .map((d) => d.data())
      .filter((r) => (r.keterangan || "").startsWith("Terjual") && r.tanggal >= mulaiStr && r.tanggal <= akhirStr)
      .reduce((s, r) => s + r.jumlah, 0);

    laporanState = { label, rows, pemasukan, pengeluaran, saldo: pemasukan - pengeluaran, qtyTerjual: qty };

    $("lap-periode-label").textContent = label;
    $("lap-pemasukan").textContent = formatRp(pemasukan);
    $("lap-pengeluaran").textContent = formatRp(pengeluaran);
    $("lap-saldo").textContent = formatRp(pemasukan - pengeluaran);
    $("lap-qty").textContent = `${qty} pcs`;
    $("tabel-laporan").innerHTML = rows.map((k) => `
      <tr>
        <td>${k.tanggal}</td><td>${k.jenis}</td><td>${k.kategori || "-"}</td>
        <td>${formatRp(k.jumlah)}</td><td>${k.keterangan || ""}</td>
      </tr>`).join("");
  });
}

$("btn-export-laporan-excel").addEventListener("click", () => {
  if (!laporanState.rows.length && !laporanState.label) { alert("Tampilkan laporan dulu sebelum export."); return; }
  const wb = XLSX.utils.book_new();
  const summaryRows = [
    ["Laporan Roti Maryam", laporanState.label],
    [],
    ["Total Pemasukan", laporanState.pemasukan],
    ["Total Pengeluaran", laporanState.pengeluaran],
    ["Saldo", laporanState.saldo],
    ["Roti Terjual (pcs)", laporanState.qtyTerjual],
    [],
    ["Tanggal", "Jenis", "Kategori", "Jumlah", "Keterangan"],
    ...laporanState.rows.map((k) => [k.tanggal, k.jenis, k.kategori || "-", k.jumlah, k.keterangan || ""]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, ws, "Ringkasan");
  XLSX.writeFile(wb, `laporan_${Date.now()}.xlsx`);
});
