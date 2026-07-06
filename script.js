// ==============================================
// MyBudget - Frontend JS (for Vercel)
// ==============================================

const API_URL = "https://script.google.com/macros/s/AKfycbx7GrPn3k5UL3buJqwim7fh1RsNeMEAb0ymSDhhBsKJXIKSdWGoAhANbp_lZJ657a2t/exec";

// ==============================================
// AUTH STATE
// ==============================================
const AUTH_KEY = 'mybudget_session';
let currentUser = { email: '', isDev: false, token: '' };

// ==============================================
// DATA STATE
// ==============================================
let dataTransaksi = [];
let daftarKategori = { Income: [], Expenses: [], Savings: [] };
let dataBudget = [];
let chartInstances = {};

// ==============================================
// CONSTANTS
// ==============================================
const JENIS_COLOR = {
    Income:   { bg: '#15803d', border: '#16a34a', light: '#dcfce7', text: '#166534' },
    Expenses: { bg: '#991b1b', border: '#dc2626', light: '#fee2e2', text: '#991b1b' },
    Savings:  { bg: '#1e40af', border: '#2563eb', light: '#dbeafe', text: '#1e40af' }
};
const JENIS_ICON = { Income: 'fa-arrow-trend-up', Expenses: 'fa-arrow-trend-down', Savings: 'fa-piggy-bank' };
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const MONTHS_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const INCOME_COLORS  = ['#22c55e','#16a34a','#15803d','#4ade80','#86efac','#bbf7d0'];
const EXP_COLORS     = ['#ef4444','#dc2626','#b91c1c','#f87171','#fca5a5','#f97316','#ea580c','#c2410c'];
const SAV_COLORS     = ['#3b82f6','#2563eb','#1d4ed8','#60a5fa','#93c5fd','#bfdbfe'];

const formatRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(n) || 0);
const formatNum = (n) => new Intl.NumberFormat('id-ID').format(Number(n) || 0);

// ==============================================
// API HELPERS
// ==============================================
async function apiGet(action) {
    const params = new URLSearchParams({ action, email: currentUser.email, token: currentUser.token });
    const r = await fetch(API_URL + '?' + params.toString(), { method: 'GET', redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

async function apiPost(payload) {
    const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...payload, email: currentUser.email, token: currentUser.token }),
        redirect: 'follow'
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

// ==============================================
// UI HELPERS
// ==============================================
function showSaving(text) {
    const el = document.getElementById('savingOverlay');
    if (!el) return;
    document.getElementById('savingText').textContent = text || 'Menyimpan...';
    el.classList.add('show');
}
function hideSaving() {
    const el = document.getElementById('savingOverlay');
    if (el) el.classList.remove('show');
}
function setLoading(show) {
    document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
}
function showToast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isError ? '#991b1b' : '#1e293b';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
}

// ==============================================
// AUTH MODAL (email + password)
// ==============================================
function showAuthModal(mode) {
    const modal = document.getElementById('authModal');
    document.getElementById('authErr').textContent = '';
    document.getElementById('authPw1').value = '';
    document.getElementById('authPw2').value = '';

    // Show email field always
    document.getElementById('emailWrap').style.display = 'block';

    if (mode === 'register') {
        document.getElementById('authSubtitle').textContent = 'Buat akun baru';
        document.getElementById('pw2Wrap').style.display = 'block';
        document.getElementById('authBtnText').textContent = 'Daftar';
        document.getElementById('authNote').textContent = 'Spreadsheet baru akan dibuat di akun developer.';
    } else {
        document.getElementById('authSubtitle').textContent = 'Masuk ke akun kamu';
        document.getElementById('pw2Wrap').style.display = 'none';
        document.getElementById('authBtnText').textContent = 'Masuk';
        document.getElementById('authNote').textContent = 'Dev default password: admin123';
    }
    modal.classList.remove('hidden');
    modal.dataset.mode = mode;
    setTimeout(() => document.getElementById('authEmail').focus(), 100);
}
function hideAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
}

async function doLogout() {
    if (!confirm('Keluar dari MyBudget?')) return;
    try { localStorage.removeItem(AUTH_KEY); } catch(e) {}
    location.reload();
}

function saveSession(email, token, isDev) {
    currentUser = { email, token, isDev: !!isDev };
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser)); } catch(e) {}
}

function loadSession() {
    try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch(e) { return null; }
}

// ==============================================
// INIT AUTH
// ==============================================
async function initAuth() {
    // Cek API online
    try {
        const r = await fetch(API_URL + '?action=authStatus', { redirect: 'follow' });
        const status = await r.json();
        if (!status || status.status !== 'success' && status.status !== 'ok') {
            throw new Error('API tidak merespons dengan benar');
        }
    } catch (err) {
        setLoading(false);
        alert('GAGAL TERHUBUNG KE SERVER!\n\nError: ' + err.message +
              '\n\nCek:\n1. Apps Script sudah di-deploy sebagai Web app\n2. Execute as: ME\n3. Who has access: Anyone\n\nURL: ' + API_URL);
        return false;
    }

    // Cek session tersimpan
    const session = loadSession();
    if (session && session.email && session.token) {
        currentUser = session;
        // Verify token masih valid dengan ambil data
        try {
            const result = await apiGet('getData');
            if (result.status === 'success') {
                return true;
            }
        } catch(e) {
            // Token expired, show login
        }
    }

    // Show login modal
    showAuthModal('login');
    return false;
}

document.getElementById('authForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const mode = document.getElementById('authModal').dataset.mode;
    const email = document.getElementById('authEmail').value.toLowerCase().trim();
    const pw1 = document.getElementById('authPw1').value;
    const pw2 = document.getElementById('authPw2').value;
    const errEl = document.getElementById('authErr');
    const btn = document.getElementById('authBtn');
    errEl.textContent = '';

    if (!email || email.indexOf('@') === -1) { errEl.textContent = 'Email tidak valid.'; return; }
    if (pw1.length < 6) { errEl.textContent = 'Password minimal 6 karakter.'; return; }
    if (mode === 'register' && pw1 !== pw2) { errEl.textContent = 'Konfirmasi password tidak cocok.'; return; }

    btn.disabled = true;
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>' +
        (mode === 'register' ? 'Mendaftar...' : 'Masuk...') + '</span>';
    showSaving(mode === 'register' ? 'Membuat spreadsheet...' : 'Masuk...');

    try {
        const r = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: mode === 'register' ? 'register' : 'login', email, password: pw1 }),
            redirect: 'follow'
        });
        const res = await r.json();
        if (res.status !== 'success') {
            errEl.textContent = res.message || 'Gagal.';
            return;
        }
        saveSession(res.email, res.token, res.isDev);
        hideAuthModal();
        await loadData();
    } catch (err) {
        errEl.textContent = 'Error: ' + err.message;
    } finally {
        hideSaving();
        btn.disabled = false;
        btn.innerHTML = origHTML;
    }
});

// ==============================================
// PAGE NAVIGATION
// ==============================================
const PAGE_TITLES = { dashboard: 'Dashboard', setup: 'Setup', budget: 'Budget Planning', tracking: 'Tracking' };

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    document.querySelectorAll('.mob-btn').forEach(b => {
        const isActive = b.dataset.page === page;
        b.classList.toggle('active', isActive);
        b.style.color = isActive ? '#38bdf8' : '';
    });
    const titleEl = document.getElementById('mobilePageTitle');
    if (titleEl) titleEl.textContent = PAGE_TITLES[page] || page;
    if (page === 'dashboard') renderDashboard();
    if (page === 'setup') renderSetup();
    if (page === 'budget') renderBudgetPlanning();
    if (page === 'tracking') renderSisaAnggaran();
}

// ==============================================
// LOAD DATA
// ==============================================
async function loadData() {
    setLoading(true);
    try {
        const result = await apiGet('getData');
        if (result.status === 'success') {
            dataTransaksi = result.data || [];
            if (result.kategori) daftarKategori = result.kategori;
            if (result.budget) dataBudget = result.budget;
            populateTahunFilter();
            renderDashboard();
            renderTabel(dataTransaksi);
            renderSisaAnggaran();
            populateKategoriDropdown('Income');
            warnaiJenis('Income');
        } else {
            showToast('Gagal memuat: ' + result.message, true);
        }
    } catch (err) {
        showToast('Koneksi error: ' + err.message, true);
    } finally {
        setLoading(false);
    }
}

async function refreshData() {
    const fab = document.getElementById('fabRefresh');
    fab.classList.add('spinning');
    await loadData();
    setTimeout(() => fab.classList.remove('spinning'), 500);
    showToast('\u2713 Data diperbarui!');
}

function populateTahunFilter() {
    const el = document.getElementById('filterTahun');
    const years = new Set([new Date().getFullYear()]);
    dataTransaksi.forEach(i => { if (i.Tanggal) years.add(new Date(i.Tanggal).getFullYear()); });
    const sorted = [...years].sort((a, b) => b - a);
    el.innerHTML = sorted.map(y => `<option value="${y}">${y}</option>`).join('');
    el.value = new Date().getFullYear();
}

// ==============================================
// FILTER HELPERS
// ==============================================
function getFilteredData() {
    const tahun = parseInt(document.getElementById('filterTahun').value);
    const bulan = parseInt(document.getElementById('filterBulan').value);
    return dataTransaksi.filter(item => {
        if (!item.Tanggal) return false;
        const d = new Date(item.Tanggal);
        if (d.getFullYear() !== tahun) return false;
        if (bulan !== 0 && (d.getMonth() + 1) !== bulan) return false;
        return true;
    });
}

function getSelectedBudgetPeriod() {
    const bEl = document.getElementById('budgetBulan');
    const yEl = document.getElementById('budgetTahun');
    const now = new Date();
    const bulan = bEl && bEl.value ? parseInt(bEl.value) : (now.getMonth() + 1);
    const tahun = yEl && yEl.value ? parseInt(yEl.value) : now.getFullYear();
    return { bulan, tahun };
}

function ensureBudgetPeriodOptions() {
    const bEl = document.getElementById('budgetBulan');
    const yEl = document.getElementById('budgetTahun');
    if (!bEl || !yEl) return;
    const now = new Date();
    if (!bEl.options.length) {
        bEl.innerHTML = MONTHS_SHORT.map((m, i) =>
            `<option value="${i + 1}" ${i + 1 === now.getMonth() + 1 ? 'selected' : ''}>${m}</option>`
        ).join('');
    }
    if (!yEl.options.length) {
        const y = now.getFullYear();
        const years = [];
        for (let i = y - 3; i <= y + 3; i++) years.push(i);
        yEl.innerHTML = years.map(v =>
            `<option value="${v}" ${v === y ? 'selected' : ''}>${v}</option>`
        ).join('');
    }
}

function ensureSetupPeriodOptions() {
    const bEl = document.getElementById('setupBulan');
    const yEl = document.getElementById('setupTahun');
    if (!bEl || !yEl) return;
    const now = new Date();
    if (bEl && !bEl.value) bEl.value = String(now.getMonth() + 1);
    if (!yEl.options.length) {
        const y = now.getFullYear();
        const years = [];
        for (let i = y - 3; i <= y + 3; i++) years.push(i);
        yEl.innerHTML = years.map(v =>
            `<option value="${v}" ${v === y ? 'selected' : ''}>${v}</option>`
        ).join('');
    }
}

function getBudgetOf(jenis, kategori, bulan, tahun) {
    const row = dataBudget.find(b =>
        b.Jenis === jenis && b.Kategori === kategori &&
        Number(b.Bulan) === Number(bulan) && Number(b.Tahun) === Number(tahun)
    );
    return row ? Number(row.Budget) : 0;
}

function getBudgetForFilter(jenis, kategori) {
    const tahun = parseInt(document.getElementById('filterTahun').value);
    const bulan = parseInt(document.getElementById('filterBulan').value);
    if (bulan === 0) {
        return dataBudget
            .filter(b => b.Jenis === jenis && b.Kategori === kategori && Number(b.Tahun) === tahun)
            .reduce((s, b) => s + (Number(b.Budget) || 0), 0);
    }
    return getBudgetOf(jenis, kategori, bulan, tahun);
}

// ==============================================
// DASHBOARD
// ==============================================
function renderDashboard() {
    const filtered = getFilteredData();
    let totIncome = 0, totExp = 0, totSav = 0;
    filtered.forEach(i => {
        const n = Number(i.Nominal);
        if (i.Jenis === 'Income') totIncome += n;
        else if (i.Jenis === 'Expenses') totExp += n;
        else if (i.Jenis === 'Savings') totSav += n;
    });
    document.getElementById('dash-income').textContent = formatRp(totIncome);
    document.getElementById('dash-expenses').textContent = formatRp(totExp);
    document.getElementById('dash-savings').textContent = formatRp(totSav);
    const rate = totIncome > 0 ? Math.round(totSav / totIncome * 100) : 0;
    document.getElementById('dash-rate').textContent = rate + '%';
    renderBreakdown('Income', filtered);
    renderBreakdown('Expenses', filtered);
    renderBreakdown('Savings', filtered);
    renderDashboardCharts(filtered);
}

function renderBreakdown(jenis, filtered) {
    const c = JENIS_COLOR[jenis];
    const categories = daftarKategori[jenis] || [];
    const actuals = {};
    filtered.filter(i => i.Jenis === jenis).forEach(i => {
        actuals[i.Kategori] = (actuals[i.Kategori] || 0) + Number(i.Nominal);
    });
    const allCats = [...new Set([...categories, ...Object.keys(actuals)])];
    const rows = allCats.map(kat => {
        const tracked = actuals[kat] || 0;
        const budget = getBudgetForFilter(jenis, kat);
        const pct = budget > 0 ? Math.round(tracked / budget * 100) : 0;
        const sisa = Math.max(budget - tracked, 0);
        const excess = budget > 0 && tracked > budget ? tracked - budget : 0;
        return { kat, tracked, budget, pct, sisa, excess };
    });
    const totTracked = rows.reduce((s, r) => s + r.tracked, 0);
    const totBudget = rows.reduce((s, r) => s + r.budget, 0);
    const totExcess = rows.reduce((s, r) => s + r.excess, 0);
    const totSisa = Math.max(totBudget - totTracked, 0);
    const totPct = totBudget > 0 ? Math.round(totTracked / totBudget * 100) : 0;
    const showExcess = jenis !== 'Savings';
    const rowsHTML = rows.map(r => `
        <tr style="border-bottom:1px solid #f1f5f9; font-size:12px">
            <td style="padding:8px 10px; font-weight:500; color:#374151">${r.kat}</td>
            <td style="padding:8px 10px; text-align:right; color:#0f172a; font-weight:600">${formatRp(r.tracked)}</td>
            <td style="padding:8px 10px; text-align:right; color:#64748b">${r.budget > 0 ? formatRp(r.budget) : '<span style="color:#cbd5e1">-</span>'}</td>
            <td style="padding:8px 10px; text-align:right; font-weight:600; color:${r.pct > 100 ? '#dc2626' : '#374151'}">${r.budget > 0 ? r.pct + '%' : '<span style="color:#cbd5e1">-</span>'}</td>
            <td style="padding:8px 10px; min-width:70px">
                ${r.budget > 0 ? `<div class="pbar"><div class="pbar-fill" style="width:${Math.min(r.pct,100)}%; background:${r.pct > 100 ? '#dc2626' : c.border}"></div></div>` : ''}
            </td>
            <td style="padding:8px 10px; text-align:right; color:${r.sisa === 0 && r.budget > 0 ? '#dc2626' : '#16a34a'}">${r.budget > 0 ? formatRp(r.sisa) : '<span style="color:#cbd5e1">-</span>'}</td>
            ${showExcess ? `<td style="padding:8px 10px; text-align:right; color:#dc2626; font-weight:600">${r.excess > 0 ? formatRp(r.excess) : '<span style="color:#cbd5e1">-</span>'}</td>` : ''}
        </tr>
    `).join('');
    document.getElementById('breakdown-' + jenis.toLowerCase()).innerHTML = `
        <div style="background:white; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0">
            <div style="background:${c.bg}; color:white; padding:10px 14px; display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600">
                <i class="fa-solid ${JENIS_ICON[jenis]}"></i> ${jenis}
            </div>
            <div style="overflow-x:auto">
                <table style="width:100%">
                    <thead>
                        <tr style="background:#f8fafc; color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:0.05em">
                            <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #e2e8f0">${jenis}</th>
                            <th style="padding:8px 10px; text-align:right; border-bottom:1px solid #e2e8f0">Aktual</th>
                            <th style="padding:8px 10px; text-align:right; border-bottom:1px solid #e2e8f0">Budget</th>
                            <th style="padding:8px 10px; text-align:right; border-bottom:1px solid #e2e8f0">%</th>
                            <th style="padding:8px 10px; border-bottom:1px solid #e2e8f0; min-width:70px">Progress</th>
                            <th style="padding:8px 10px; text-align:right; border-bottom:1px solid #e2e8f0">Sisa</th>
                            ${showExcess ? '<th style="padding:8px 10px; text-align:right; border-bottom:1px solid #e2e8f0; color:#dc2626">Excess</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                    <tfoot>
                        <tr style="background:#f8fafc; font-size:12px; font-weight:700; border-top:2px solid #e2e8f0">
                            <td style="padding:9px 10px; color:#0f172a">Total</td>
                            <td style="padding:9px 10px; text-align:right">${formatRp(totTracked)}</td>
                            <td style="padding:9px 10px; text-align:right; color:#64748b">${totBudget > 0 ? formatRp(totBudget) : '-'}</td>
                            <td style="padding:9px 10px; text-align:right; color:${totPct > 100 ? '#dc2626' : '#374151'}">${totBudget > 0 ? totPct + '%' : '-'}</td>
                            <td style="padding:9px 10px">
                                ${totBudget > 0 ? `<div class="pbar"><div class="pbar-fill" style="width:${Math.min(totPct,100)}%; background:${c.border}"></div></div>` : ''}
                            </td>
                            <td style="padding:9px 10px; text-align:right; color:#16a34a">${totBudget > 0 ? formatRp(totSisa) : '-'}</td>
                            ${showExcess ? `<td style="padding:9px 10px; text-align:right; color:#dc2626">${totExcess > 0 ? formatRp(totExcess) : '-'}</td>` : ''}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

function renderDashboardCharts(filtered) {
    const buildMap = (jenis) => {
        const map = {};
        filtered.filter(i => i.Jenis === jenis).forEach(i => {
            map[i.Kategori] = (map[i.Kategori] || 0) + Number(i.Nominal);
        });
        return map;
    };
    makeDoughnut('chartIncome', buildMap('Income'), INCOME_COLORS);
    makeDoughnut('chartExpenses', buildMap('Expenses'), EXP_COLORS);
    makeDoughnut('chartSavings', buildMap('Savings'), SAV_COLORS);
    makeMonthlyBar(filtered);
}

function makeDoughnut(id, map, colors) {
    if (chartInstances[id]) chartInstances[id].destroy();
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
    let labels = sorted.map(([k]) => k);
    let data = sorted.map(([, v]) => v);
    const entries = Object.entries(map);
    if (entries.length > 5) {
        const othersSum = entries.slice(5).reduce((sum, [, v]) => sum + v, 0);
        labels.push('Lainnya');
        data.push(othersSum);
    }
    if (!labels.length) { labels = ['Tidak ada data']; data = [1]; }
    chartInstances[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: data.length <= 5 ? colors.slice(0, data.length) : [...colors.slice(0, 5), '#cbd5e1'], borderWidth: 0 }] },
        options: {
            responsive: true, maintainAspectRatio: true, cutout: '60%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 9 }, boxWidth: 8, padding: 6, usePointStyle: true } },
                tooltip: { callbacks: { label: ctx => ' ' + formatRp(ctx.raw) }, padding: 8, titleFont: { size: 11 }, bodyFont: { size: 10 } }
            }
        }
    });
}

function makeMonthlyBar(filtered) {
    if (chartInstances['chartMonthly']) chartInstances['chartMonthly'].destroy();
    const ctx = document.getElementById('chartMonthly');
    if (!ctx) return;
    const tahun = parseInt(document.getElementById('filterTahun').value);
    const bulan = parseInt(document.getElementById('filterBulan').value);
    if (bulan !== 0) {
        const totals = { Income: 0, Expenses: 0, Savings: 0 };
        filtered.forEach(i => { if (totals[i.Jenis] !== undefined) totals[i.Jenis] += Number(i.Nominal); });
        chartInstances['chartMonthly'] = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Income', 'Expenses', 'Savings'], datasets: [{ data: [totals.Income, totals.Expenses, totals.Savings], backgroundColor: ['#22c55e', '#ef4444', '#3b82f6'], borderRadius: 6, borderSkipped: false }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => formatRp(c.raw) }, padding: 8, titleFont: { size: 11 }, bodyFont: { size: 10 } } },
                scales: { y: { ticks: { callback: v => 'Rp' + (v / 1e6).toFixed(0) + 'jt', font: { size: 9 } }, grid: { color: '#f1f5f9' }, beginAtZero: true }, x: { ticks: { font: { size: 10 } } } }
            }
        });
    } else {
        const monthly = { Income: Array(12).fill(0), Expenses: Array(12).fill(0), Savings: Array(12).fill(0) };
        dataTransaksi.filter(i => new Date(i.Tanggal).getFullYear() === tahun).forEach(i => {
            const m = new Date(i.Tanggal).getMonth();
            if (monthly[i.Jenis]) monthly[i.Jenis][m] += Number(i.Nominal);
        });
        chartInstances['chartMonthly'] = new Chart(ctx, {
            type: 'bar',
            data: { labels: MONTHS_SHORT, datasets: [
                { label: 'Income', data: monthly.Income, backgroundColor: '#4ade80', borderRadius: 3, borderSkipped: false },
                { label: 'Expenses', data: monthly.Expenses, backgroundColor: '#f87171', borderRadius: 3, borderSkipped: false },
                { label: 'Savings', data: monthly.Savings, backgroundColor: '#60a5fa', borderRadius: 3, borderSkipped: false }
            ] },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { position: 'bottom', labels: { font: { size: 9 }, boxWidth: 8, padding: 6, usePointStyle: true } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + formatRp(c.raw) }, padding: 8, titleFont: { size: 11 }, bodyFont: { size: 10 } } },
                scales: { y: { ticks: { callback: v => 'Rp' + (v / 1e6).toFixed(0) + 'jt', font: { size: 9 } }, grid: { color: '#f1f5f9' }, beginAtZero: true, stacked: false }, x: { ticks: { font: { size: 9 } }, stacked: false } }
            }
        });
    }
}

// ==============================================
// SETUP
// ==============================================
function renderSetup() {
    ensureSetupPeriodOptions();
    ['Income', 'Expenses', 'Savings'].forEach(j => {
        const el = document.getElementById('setup-' + j.toLowerCase());
        el.innerHTML = (daftarKategori[j] || []).map((kat, idx) => `
            <div style="display:flex; align-items:center; gap:6px">
                <input type="text" value="${kat}" data-jenis="${j}" data-idx="${idx}"
                    style="flex:1; border:1px solid #e2e8f0; padding:6px 10px; border-radius:6px; font-size:13px; outline:none">
                <button onclick="removeKategori('${j}', ${idx})" style="background:#fef2f2; color:#dc2626; border:none; border-radius:6px; width:26px; height:26px; cursor:pointer; font-size:11px">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');
    });
}
function addKategori(j) { (daftarKategori[j] = daftarKategori[j] || []).push(''); renderSetup(); }
function removeKategori(j, idx) { daftarKategori[j].splice(idx, 1); renderSetup(); }
function collectSetup() {
    const out = { Income: [], Expenses: [], Savings: [] };
    ['Income', 'Expenses', 'Savings'].forEach(j => {
        document.querySelectorAll(`#setup-${j.toLowerCase()} input`).forEach(inp => {
            const v = inp.value.trim();
            if (v) out[j].push(v);
        });
    });
    return out;
}
async function saveSetup() {
    const values = collectSetup();
    daftarKategori = values;
    const bulan = parseInt(document.getElementById('setupBulan').value) || 0;
    const tahun = parseInt(document.getElementById('setupTahun').value) || 0;
    showSaving('Menyimpan kategori...');
    try {
        const res = await apiPost({ action: 'updateSetup', Bulan: bulan, Tahun: tahun, ...values });
        if (res.status === 'success') {
            showToast('\u2713 Kategori tersimpan!');
            populateKategoriDropdown(document.getElementById('inputJenis').value);
            renderBudgetPlanning();
        } else { showToast('Gagal: ' + res.message, true); }
    } catch (err) { showToast('Error: ' + err.message, true); }
    finally { hideSaving(); }
}

// ==============================================
// BUDGET PLANNING
// ==============================================
function getActualByCategory(jenis, bulan, tahun) {
    const map = {};
    dataTransaksi.forEach(i => {
        if (i.Jenis !== jenis || !i.Tanggal) return;
        const d = new Date(i.Tanggal);
        if (d.getFullYear() !== tahun || (d.getMonth() + 1) !== bulan) return;
        map[i.Kategori] = (map[i.Kategori] || 0) + Number(i.Nominal);
    });
    return map;
}

function renderBudgetPlanning() {
    ensureBudgetPeriodOptions();
    const { bulan, tahun } = getSelectedBudgetPeriod();
    const incomeActuals = getActualByCategory('Income', bulan, tahun);
    const incomeCats = [...new Set([...(daftarKategori.Income || []), ...Object.keys(incomeActuals)])];
    const totalIncome = incomeCats.reduce((s, k) => s + (incomeActuals[k] || 0), 0);
    const cInc = JENIS_COLOR.Income;
    document.getElementById('budget-income').innerHTML = `
        <div style="background:white; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0">
            <div style="background:${cInc.bg}; color:white; padding:12px 16px; display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600">
                <i class="fa-solid ${JENIS_ICON.Income}"></i>
                Income <span style="opacity:0.7; font-weight:400; font-size:11px">(otomatis dari Tracking \u00b7 ${MONTHS_SHORT[bulan - 1]} ${tahun})</span>
                <span style="margin-left:auto; font-size:13px; font-weight:700">${formatRp(totalIncome)}</span>
            </div>
            <div style="padding:14px; display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px">
                ${incomeCats.length ? incomeCats.map(kat => {
                    const val = incomeActuals[kat] || 0;
                    return `<div><label style="font-size:11px; font-weight:600; color:#64748b; display:block; margin-bottom:5px">${kat}</label>
                    <input type="text" readonly value="${val > 0 ? formatNum(val) : '0'}" style="width:100%; border:1px solid #e2e8f0; padding:8px 10px; border-radius:8px; font-size:13px; box-sizing:border-box; background:#f1f5f9; color:#0f172a; font-weight:600"></div>`;
                }).join('') : '<p style="color:#94a3b8; font-size:13px; grid-column:1/-1">Belum ada income tercatat di bulan ini.</p>'}
            </div>
        </div>
    `;
    ['Expenses', 'Savings'].forEach(jenis => {
        const c = JENIS_COLOR[jenis];
        const cats = daftarKategori[jenis] || [];
        const label = jenis === 'Savings' ? 'Savings (Tabungan)' : jenis;
        document.getElementById('budget-' + jenis.toLowerCase()).innerHTML = `
            <div style="background:white; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0">
                <div style="background:${c.bg}; color:white; padding:12px 16px; display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600">
                    <i class="fa-solid ${JENIS_ICON[jenis]}"></i> ${label}
                    <span style="opacity:0.7; font-weight:400; font-size:11px; margin-left:4px">(${MONTHS_SHORT[bulan - 1]} ${tahun})</span>
                    <span id="total-${jenis.toLowerCase()}" style="margin-left:auto; font-size:13px; font-weight:700"></span>
                </div>
                <div style="padding:14px; display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px">
                    ${cats.map(kat => {
                        const val = getBudgetOf(jenis, kat, bulan, tahun);
                        return `<div><label style="font-size:11px; font-weight:600; color:#64748b; display:block; margin-bottom:5px">${kat}</label>
                        <input type="text" data-jenis="${jenis}" data-kategori="${kat}" data-bulan="${bulan}" data-tahun="${tahun}"
                            value="${val > 0 ? formatNum(val) : ''}" placeholder="0" oninput="onBudgetInput(this)"
                            onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#e2e8f0'"
                            style="width:100%; border:1px solid #e2e8f0; padding:8px 10px; border-radius:8px; font-size:13px; box-sizing:border-box; outline:none; transition:border 0.15s"></div>`;
                    }).join('')}
                    ${cats.length === 0 ? '<p style="color:#94a3b8; font-size:13px; grid-column:1/-1">Belum ada kategori. Tambahkan di Setup.</p>' : ''}
                </div>
            </div>
        `;
    });
    renderBudgetSummary();
}

function renderBudgetSummary() {
    const { bulan, tahun } = getSelectedBudgetPeriod();
    const totalIncome = Object.values(getActualByCategory('Income', bulan, tahun)).reduce((s, v) => s + v, 0);
    let totExp = 0, totSav = 0;
    document.querySelectorAll('#page-budget input[data-jenis]').forEach(inp => {
        const raw = parseInt(inp.dataset.raw || inp.value.replace(/\D/g, '')) || 0;
        if (inp.dataset.jenis === 'Expenses') totExp += raw;
        else if (inp.dataset.jenis === 'Savings') totSav += raw;
    });
    const eEl = document.getElementById('total-expenses');
    const sEl = document.getElementById('total-savings');
    if (eEl) eEl.textContent = formatRp(totExp);
    if (sEl) sEl.textContent = formatRp(totSav);
    const sisa = totalIncome - totExp - totSav;
    const box = document.getElementById('budgetSummary');
    if (!box) return;
    const okColor = sisa === 0 ? '#16a34a' : (sisa < 0 ? '#dc2626' : '#d97706');
    const status = sisa === 0 ? '\u2713 Income teralokasi penuh' : (sisa < 0 ? `\u26a0 Over-budget ${formatRp(Math.abs(sisa))}` : `Belum dialokasikan ${formatRp(sisa)}`);
    box.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px">
            <div><div style="font-size:11px; color:#64748b; font-weight:600">INCOME</div><div style="font-size:15px; font-weight:700; color:#16a34a">${formatRp(totalIncome)}</div></div>
            <div><div style="font-size:11px; color:#64748b; font-weight:600">EXPENSES</div><div style="font-size:15px; font-weight:700; color:#dc2626">${formatRp(totExp)}</div></div>
            <div><div style="font-size:11px; color:#64748b; font-weight:600">SAVINGS</div><div style="font-size:15px; font-weight:700; color:#2563eb">${formatRp(totSav)}</div></div>
            <div><div style="font-size:11px; color:#64748b; font-weight:600">SISA (target 0)</div><div style="font-size:15px; font-weight:700; color:${okColor}">${formatRp(sisa)}</div></div>
        </div>
        <div style="margin-top:8px; font-size:12px; font-weight:600; color:${okColor}">${status}</div>
    `;
}

function onBudgetInput(el) {
    const raw = el.value.replace(/\D/g, '');
    el.dataset.raw = raw;
    el.value = raw ? formatNum(raw) : '';
    renderBudgetSummary();
}

async function saveBudget() {
    const { bulan, tahun } = getSelectedBudgetPeriod();
    const currentPeriod = [];
    const incomeActuals = getActualByCategory('Income', bulan, tahun);
    Object.entries(incomeActuals).forEach(([kat, val]) => {
        currentPeriod.push({ Jenis: 'Income', Kategori: kat, Bulan: bulan, Tahun: tahun, Budget: Number(val) || 0 });
    });
    document.querySelectorAll('#page-budget input[data-jenis]').forEach(inp => {
        const raw = parseInt(inp.dataset.raw || inp.value.replace(/\D/g, '')) || 0;
        currentPeriod.push({ Jenis: inp.dataset.jenis, Kategori: inp.dataset.kategori, Bulan: bulan, Tahun: tahun, Budget: raw });
    });
    const others = dataBudget.filter(b => !(Number(b.Bulan) === bulan && Number(b.Tahun) === tahun));
    const kept = currentPeriod.filter(b => Number(b.Budget) > 0);
    const budgets = [...others, ...kept];
    dataBudget = budgets;
    try {
        const res = await apiPost({ action: 'updateBudget', budgets });
        if (res.status === 'success') { showToast('\u2713 Budget tersimpan!'); renderSisaAnggaran(); }
        else { showToast('Gagal: ' + res.message, true); }
    } catch (err) { showToast('Error: ' + err.message, true); }
}

// ==============================================
// SISA ANGGARAN
// ==============================================
function getTrackingPeriod() {
    const dateStr = document.getElementById('inputTanggal')?.value;
    let d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return { bulan: d.getMonth() + 1, tahun: d.getFullYear() };
}

function renderSisaAnggaran() {
    const container = document.getElementById('sisaAnggaran');
    if (!container) return;
    const { bulan, tahun } = getTrackingPeriod();
    const cats = daftarKategori.Expenses || [];
    const titleEl = document.getElementById('sisaAnggaranTitle');
    if (titleEl) titleEl.textContent = `Sisa Anggaran Expenses (${MONTHS_FULL[bulan - 1]} ${tahun})`;
    const actuals = {};
    dataTransaksi.filter(i => {
        if (i.Jenis !== 'Expenses' || !i.Tanggal) return false;
        const d = new Date(i.Tanggal);
        return d.getFullYear() === tahun && (d.getMonth() + 1) === bulan;
    }).forEach(i => { actuals[i.Kategori] = (actuals[i.Kategori] || 0) + Number(i.Nominal); });
    if (!cats.length) { container.innerHTML = '<p style="color:#94a3b8; font-size:13px">Belum ada kategori Expenses di Setup.</p>'; return; }
    container.innerHTML = cats.map(kat => {
        const monthBudget = getBudgetOf('Expenses', kat, bulan, tahun);
        const spent = actuals[kat] || 0;
        if (monthBudget === 0) return `<div style="display:flex; justify-content:space-between; font-size:12px; color:#64748b"><span>${kat}</span><span style="color:#cbd5e1">No budget</span></div>`;
        const sisa = monthBudget - spent;
        const pct = Math.min(Math.round(spent / monthBudget * 100), 100);
        const over = sisa < 0;
        return `<div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px">
                <span style="font-size:12px; font-weight:600; color:#374151">${kat}</span>
                <span style="font-size:11px; font-weight:700; color:${over ? '#dc2626' : '#16a34a'}">${over ? '\u26a0 -' + formatRp(Math.abs(sisa)) : formatRp(sisa)}</span>
            </div>
            <div class="pbar"><div class="pbar-fill" style="width:${pct}%; background:${over ? '#dc2626' : '#22c55e'}"></div></div>
            <div style="font-size:10px; color:#94a3b8; margin-top:3px">${formatRp(spent)} / ${formatRp(monthBudget)}</div>
        </div>`;
    }).join('');
}

// ==============================================
// TABEL TRANSAKSI
// ==============================================
function renderTabel(data) {
    const tbody = document.getElementById('tabelBody');
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:28px; color:#94a3b8; font-size:13px"><i class="fa-solid fa-inbox" style="display:block; font-size:24px; margin-bottom:8px"></i>Belum ada transaksi.</td></tr>';
        return;
    }
    tbody.innerHTML = [...data].reverse().map(item => {
        const isInc = item.Jenis === 'Income', isSav = item.Jenis === 'Savings';
        const color = isInc ? '#16a34a' : isSav ? '#b45309' : '#dc2626';
        const op = isInc || isSav ? '+' : '\u2212';
        const badge = isInc ? 'badge-income' : isSav ? 'badge-savings' : 'badge-expenses';
        return `<tr style="border-bottom:1px solid #f1f5f9; font-size:12px; transition:background 0.1s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:10px 12px; color:#64748b; white-space:nowrap">${item.Tanggal || '-'}</td>
            <td style="padding:10px 12px"><span class="${badge}" style="padding:3px 8px; border-radius:20px; font-size:11px; font-weight:600">${item.Jenis || '-'}</span></td>
            <td style="padding:10px 12px; color:#0f172a; font-weight:500">${item.Kategori || '-'}</td>
            <td style="padding:10px 12px; text-align:right; font-weight:700; color:${color}; white-space:nowrap">${op} ${formatRp(item.Nominal)}</td>
            <td style="padding:10px 12px; color:#64748b; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${item.Deskripsi || '-'}</td>
            <td style="padding:10px 12px; color:#94a3b8; white-space:nowrap; font-size:11px">${item.Timestamp || '-'}</td>
            <td style="padding:10px 12px; text-align:center; white-space:nowrap">
                <button onclick="siapkanEdit('${item.ID}')" style="background:#eff6ff; color:#2563eb; border:none; border-radius:6px; width:28px; height:28px; cursor:pointer; font-size:12px; margin-right:4px" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button onclick="hapusTransaksi('${item.ID}')" style="background:#fef2f2; color:#dc2626; border:none; border-radius:6px; width:28px; height:28px; cursor:pointer; font-size:12px" title="Hapus"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ==============================================
// FORM INPUT
// ==============================================
function populateKategoriDropdown(jenis, selected) {
    const sel = document.getElementById('inputKategori');
    const list = daftarKategori[jenis] || [];
    sel.innerHTML = '<option value="">-- Pilih Kategori --</option>' + list.map(k => `<option value="${k}" ${k === selected ? 'selected' : ''}>${k}</option>`).join('');
}
function warnaiJenis(jenis) {
    const sel = document.getElementById('inputJenis');
    const c = JENIS_COLOR[jenis];
    sel.style.background = c.light; sel.style.color = c.text; sel.style.borderColor = c.border;
}
document.getElementById('inputJenis').addEventListener('change', function () { populateKategoriDropdown(this.value); warnaiJenis(this.value); });
document.getElementById('inputTanggal').addEventListener('change', renderSisaAnggaran);
const inputNominal = document.getElementById('inputNominal');
inputNominal.addEventListener('input', function () { const raw = this.value.replace(/\D/g, ''); this.dataset.raw = raw; this.value = raw ? formatNum(raw) : ''; });
const getNominalRaw = () => inputNominal.dataset.raw || inputNominal.value.replace(/\D/g, '');
document.getElementById('searchKeyword').addEventListener('input', terapkanFilter);
document.getElementById('filterJenis').addEventListener('change', terapkanFilter);
function terapkanFilter() {
    const kw = document.getElementById('searchKeyword').value.toLowerCase();
    const jenis = document.getElementById('filterJenis').value;
    renderTabel(dataTransaksi.filter(i => {
        const matchKw = (i.Deskripsi || '').toLowerCase().includes(kw) || (i.Kategori || '').toLowerCase().includes(kw);
        return matchKw && (!jenis || i.Jenis === jenis);
    }));
}

// ==============================================
// SUBMIT FORM
// ==============================================
document.getElementById('formTransaksi').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');
    const orig = btn.innerHTML;
    btn.disabled = true;
    const id = document.getElementById('inputId').value;
    const payload = {
        action: id ? 'update' : 'insert', ID: id,
        Tanggal: document.getElementById('inputTanggal').value,
        Jenis: document.getElementById('inputJenis').value,
        Kategori: document.getElementById('inputKategori').value,
        Nominal: getNominalRaw(),
        Deskripsi: document.getElementById('inputDeskripsi').value
    };
    if (!payload.Tanggal || !payload.Jenis || !payload.Kategori || !payload.Nominal) {
        showToast('Lengkapi Tanggal, Jenis, Kategori, dan Nominal.', true);
        btn.innerHTML = orig; btn.disabled = false; return;
    }
    showSaving(id ? 'Memperbarui transaksi...' : 'Menyimpan transaksi...');
    try {
        const res = await apiPost(payload);
        if (res.status === 'success') { resetForm(); await loadData(); showToast(id ? '\u2713 Transaksi diperbarui!' : '\u2713 Transaksi disimpan!'); }
        else { showToast('Gagal: ' + res.message, true); }
    } catch (err) { showToast('Error: ' + err.message, true); }
    finally { hideSaving(); btn.innerHTML = orig; btn.disabled = false; }
});

// ==============================================
// EDIT & DELETE
// ==============================================
function siapkanEdit(id) {
    const t = dataTransaksi.find(i => i.ID === id);
    if (!t) return;
    showPage('tracking');
    document.getElementById('inputId').value = t.ID;
    document.getElementById('inputTanggal').value = (t.Tanggal || '').split('T')[0];
    document.getElementById('inputJenis').value = t.Jenis;
    warnaiJenis(t.Jenis);
    populateKategoriDropdown(t.Jenis, t.Kategori);
    inputNominal.value = formatNum(t.Nominal);
    inputNominal.dataset.raw = String(t.Nominal);
    document.getElementById('inputDeskripsi').value = t.Deskripsi || '';
    renderSisaAnggaran();
    const btn = document.getElementById('btnSubmit');
    btn.innerHTML = '<i class="fa-solid fa-pen"></i> Update Transaksi';
    btn.style.background = '#d97706';
    document.getElementById('btnCancel').style.display = 'block';
    document.getElementById('formTransaksi').scrollIntoView({ behavior: 'smooth' });
}
function resetForm() {
    document.getElementById('formTransaksi').reset();
    document.getElementById('inputId').value = '';
    inputNominal.dataset.raw = '';
    populateKategoriDropdown(document.getElementById('inputJenis').value);
    warnaiJenis(document.getElementById('inputJenis').value);
    const btn = document.getElementById('btnSubmit');
    btn.innerHTML = 'Simpan Transaksi';
    btn.style.background = '#2563eb';
    document.getElementById('btnCancel').style.display = 'none';
    renderSisaAnggaran();
}
async function hapusTransaksi(id) {
    if (!confirm('Hapus transaksi ini?')) return;
    showSaving('Menghapus transaksi...');
    try {
        const res = await apiPost({ action: 'delete', ID: id });
        if (res.status === 'success') { await loadData(); showToast('\u2713 Transaksi dihapus!'); }
        else showToast('Gagal hapus: ' + res.message, true);
    } catch (err) { showToast('Error: ' + err.message, true); }
    finally { hideSaving(); }
}

// ==============================================
// INIT & STARTUP
// ==============================================
warnaiJenis('Income');
(function initTanggal(){
    const el = document.getElementById('inputTanggal');
    if (el && !el.value) {
        const d = new Date();
        const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        el.value = iso;
    }
})();

(async function startup() {
    setTimeout(() => {
        const el = document.getElementById('loadingOverlay');
        if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
    }, 15000);
    try {
        const ok = await initAuth();
        if (ok) await loadData();
    } catch (err) {
        setLoading(false);
        showToast('Error startup: ' + err.message, true);
    }
})();
