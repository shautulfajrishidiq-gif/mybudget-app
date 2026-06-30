// GANTI DENGAN URL WEB APP ANDA
const API_URL = "https://script.google.com/macros/s/AKfycbx4X9r_8O-aV7neMaqzuBQsPAF_ciSvqpoq3zfq3ueWc-8Pz6UzfiSDJVuoQGqpk2rzeg/exec";

let dataTransaksi = [];
let chartInstance = null; // Variabel global untuk menampung grafik

const formatRupiah = (angka) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(angka);
};

// ==========================================
// 1. READ: AMBIL DATA
// ==========================================
async function loadData() {
    const tbody = document.getElementById('tabelBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Mengambil data...</td></tr>';
    
    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        
        if (result.status === "success") {
            dataTransaksi = result.data; 
            renderTabel(dataTransaksi); // Panggil render tabel
            updateDashboard(); // Perbarui kartu ringkasan
            renderChart(); // Render grafik
        } else {
            alert("Gagal memuat data: " + result.message);
        }
    } catch (error) {
        console.error("Error:", error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-red-500">Terjadi kesalahan koneksi ke server.</td></tr>';
    }
}

// ==========================================
// 2. RENDER TABEL DENGAN PARAMETER DATA
// ==========================================
function renderTabel(data) {
    const tbody = document.getElementById('tabelBody');
    tbody.innerHTML = ''; 
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-500">Tidak ada data yang cocok.</td></tr>';
        return;
    }
    
    const reversedData = [...data].reverse();
    
    reversedData.forEach(item => {
        const warnaNominal = item.Jenis === 'Pemasukan' ? 'text-green-600' : 'text-red-600';
        const operator = item.Jenis === 'Pemasukan' ? '+' : '-';
        
        const tr = document.createElement('tr');
        tr.className = "border-b hover:bg-gray-50 transition";
        tr.innerHTML = `
            <td class="p-3">${item.Tanggal}</td>
            <td class="p-3"><span class="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs">${item.Kategori}</span></td>
            <td class="p-3">${item.Deskripsi}</td>
            <td class="p-3 font-bold ${warnaNominal}">${operator} ${formatRupiah(item.Nominal)}</td>
            <td class="p-3 text-center">
                <button class="text-blue-500 hover:text-blue-700 mx-1" onclick="siapkanEdit('${item.ID}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="text-red-500 hover:text-red-700 mx-1" onclick="hapusTransaksi('${item.ID}')" title="Hapus"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 3. UPDATE DASHBOARD KARTU
// ==========================================
function updateDashboard() {
    let totalPemasukan = 0;
    let totalPengeluaran = 0;
    
    dataTransaksi.forEach(item => {
        if (item.Jenis === 'Pemasukan') {
            totalPemasukan += Number(item.Nominal);
        } else if (item.Jenis === 'Pengeluaran') {
            totalPengeluaran += Number(item.Nominal);
        }
    });
    
    const totalSaldo = totalPemasukan - totalPengeluaran;
    
    document.getElementById('totalSaldo').innerText = formatRupiah(totalSaldo);
    document.getElementById('totalPemasukan').innerText = formatRupiah(totalPemasukan);
    document.getElementById('totalPengeluaran').innerText = formatRupiah(totalPengeluaran);
}

// ==========================================
// 4. CHART.JS: GRAFIK PENGELUARAN
// ==========================================
function renderChart() {
    const ctx = document.getElementById('chartPengeluaran').getContext('2d');
    
    // Saring hanya data pengeluaran
    const pengeluaran = dataTransaksi.filter(item => item.Jenis === 'Pengeluaran');
    
    // Kelompokkan total nominal berdasarkan kategori
    const kategoriMap = {};
    pengeluaran.forEach(item => {
        if (kategoriMap[item.Kategori]) {
            kategoriMap[item.Kategori] += Number(item.Nominal);
        } else {
            kategoriMap[item.Kategori] = Number(item.Nominal);
        }
    });

    const labels = Object.keys(kategoriMap);
    const data = Object.values(kategoriMap);

    // Hancurkan chart lama agar tidak tumpang tindih saat data diperbarui
    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.length > 0 ? labels : ['Belum ada pengeluaran'],
            datasets: [{
                data: data.length > 0 ? data : [1],
                backgroundColor: data.length > 0 ? [
                    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'
                ] : ['#e5e7eb'], // Warna abu-abu jika kosong
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

// ==========================================
// 5. FITUR PENCARIAN & FILTER
// ==========================================
function terapkanFilter() {
    const keyword = document.getElementById('searchKeyword').value.toLowerCase();
    const jenis = document.getElementById('filterJenis').value;

    const filteredData = dataTransaksi.filter(item => {
        // Cek apakah deskripsi atau kategori mengandung kata kunci pencarian
        const matchKeyword = item.Deskripsi.toLowerCase().includes(keyword) || item.Kategori.toLowerCase().includes(keyword);
        // Cek apakah dropdown jenis sesuai (kosong = semua)
        const matchJenis = jenis === "" || item.Jenis === jenis;
        
        return matchKeyword && matchJenis;
    });

    renderTabel(filteredData);
}

// Tambahkan event listener saat user mengetik atau memilih dropdown
document.getElementById('searchKeyword').addEventListener('input', terapkanFilter);
document.getElementById('filterJenis').addEventListener('change', terapkanFilter);

// ==========================================
// 6. CREATE / UPDATE TRANSAKSI
// ==========================================
document.getElementById('formTransaksi').addEventListener('submit', async function(e) {
    e.preventDefault(); 
    
    const btnSubmit = document.getElementById('btnSubmit');
    const teksAsli = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Menyimpan...';
    btnSubmit.disabled = true;
    
    const idTransaksi = document.getElementById('inputId').value;
    const actionType = idTransaksi ? 'update' : 'insert';
    
    const payload = {
        action: actionType,
        id: idTransaksi, 
        tanggal: document.getElementById('inputTanggal').value,
        jenis: document.getElementById('inputJenis').value,
        kategori: document.getElementById('inputKategori').value,
        nominal: document.getElementById('inputNominal').value,
        deskripsi: document.getElementById('inputDeskripsi').value
    };
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === "success") {
            resetForm(); 
            await loadData(); // Reload data memicu update tabel, card, dan chart
        } else {
            alert("Gagal menyimpan: " + result.message);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Terjadi kesalahan koneksi saat menyimpan data.");
    } finally {
        btnSubmit.innerHTML = teksAsli;
        btnSubmit.disabled = false;
    }
});

// ==========================================
// 7. PERSIAPAN EDIT & DELETE TRANSAKSI
// ==========================================
function siapkanEdit(id) {
    const transaksi = dataTransaksi.find(item => item.ID === id);
    if (!transaksi) return;
    
    document.getElementById('inputId').value = transaksi.ID;
    
    let tanggalForm = transaksi.Tanggal;
    if (tanggalForm.includes('T')) {
        tanggalForm = tanggalForm.split('T')[0];
    }
    
    document.getElementById('inputTanggal').value = tanggalForm;
    document.getElementById('inputJenis').value = transaksi.Jenis;
    document.getElementById('inputKategori').value = transaksi.Kategori;
    document.getElementById('inputNominal').value = transaksi.Nominal;
    document.getElementById('inputDeskripsi').value = transaksi.Deskripsi;
    
    const btnSubmit = document.getElementById('btnSubmit');
    btnSubmit.innerHTML = '<i class="fa-solid fa-pen mr-2"></i>Update Transaksi';
    btnSubmit.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    btnSubmit.classList.add('bg-yellow-500', 'hover:bg-yellow-600'); 
    
    document.getElementById('formTransaksi').scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
    document.getElementById('formTransaksi').reset();
    document.getElementById('inputId').value = '';
    
    const btnSubmit = document.getElementById('btnSubmit');
    btnSubmit.innerHTML = 'Simpan Transaksi';
    btnSubmit.classList.remove('bg-yellow-500', 'hover:bg-yellow-600');
    btnSubmit.classList.add('bg-blue-600', 'hover:bg-blue-700');
}

async function hapusTransaksi(id) {
    const konfirmasi = confirm("Apakah Anda yakin ingin menghapus transaksi ini?");
    if (!konfirmasi) return;
    
    document.getElementById('tabelBody').innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Menghapus data...</td></tr>';
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'delete', id: id })
        });
        
        const result = await response.json();
        
        if (result.status === "success") {
            await loadData(); 
        } else {
            alert("Gagal menghapus: " + result.message);
            renderTabel(dataTransaksi); 
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Terjadi kesalahan koneksi saat menghapus data.");
        renderTabel(dataTransaksi); 
    }
}

// ==========================================
// 8. INISIALISASI SAAT HALAMAN DIMUAT
// ==========================================
loadData();
