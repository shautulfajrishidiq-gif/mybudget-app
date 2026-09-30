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
let daftarKategori = { Income: [], Expenses: [], Savings: [] }; // aggregate fallback
let kategoriByPeriod = {}; // { "bulan-tahun": { Income:[], Expenses:[], Savings:[] } }
let setupDraft = { Income: [], Expenses: [], Savings: [] };     // editing buffer for Setup page
let setupEditMode = false; // true = user explicitly unlocked a saved period for editing
let dataBudget = [];
let chartInstances = {};

// ==============================================
// KATEGORI PER-PERIODE HELPERS
// ==============================================
function periodKey(bulan, tahun) { return String(bulan) + '-' + String(tahun); }

function kategoriForPeriod(bulan, tahun) {
    const key = periodKey(bulan, tahun);
    if (kategoriByPeriod[key]) return kategoriByPeriod[key];
    // Fallback: periode tersimpan terdekat (prefer <= periode diminta, jika tidak ada ambil paling baru)
    const keys = Object.keys(kategoriByPeriod);
    if (keys.length) {
        const arr = keys.map(k => {
            const p = k.split('-'); return { k, b: Number(p[0]), y: Number(p[1]) };
        }).sort((a, b) => (b.y - a.y) || (b.b - a.b));
        const target = tahun * 100 + bulan;
        const notFuture = arr.filter(x => (x.y * 100 + x.b) <= target);
        const pick = notFuture[0] || arr[0];
        return kategoriByPeriod[pick.k];
    }
    return daftarKategori;
}

function isPeriodSaved(bulan, tahun) { return !!kategoriByPeriod[periodKey(bulan, tahun)]; }

function findNearestSavedPeriod(bulan, tahun) {
    const keys = Object.keys(kategoriByPeriod);
    if (!keys.length) return null;
    const arr = keys.map(k => {
        const p = k.split('-'); return { k, b: Number(p[0]), y: Number(p[1]) };
    }).sort((a, b) => (b.y - a.y) || (b.b - a.b));
    const target = tahun * 100 + bulan;
    const notFuture = arr.filter(x => (x.y * 100 + x.b) <= target);
    return (notFuture[0] || arr[0]).k;
}

function kategoriForFilter(jenis) {
    const tahun = parseInt(document.getElementById('filterTahun').value);
    const bulan = parseInt(document.getElementById('filterBulan').value);
    if (bulan === 0) {
        // Total Year: gabungkan semua periode di tahun tsb
        const set = [];
        Object.keys(kategoriByPeriod).forEach(k => {
            const p = k.split('-'); if (Number(p[1]) !== tahun) return;
            (kategoriByPeriod[k][jenis] || []).forEach(v => { if (v && set.indexOf(v) === -1) set.push(v); });
        });
        if (!set.length) return daftarKategori[jenis] || [];
        return set;
    }
    return (kategoriForPeriod(bulan, tahun)[jenis]) || [];
}

function aggregateKategori(map) {
    const out = { Income: [], Expenses: [], Savings: [] };
    Object.keys(map).forEach(k => {
        ['Income', 'Expenses', 'Savings'].forEach(j => {
            (map[k][j] || []).forEach(v => { if (v && out[j].indexOf(v) === -1) out[j].push(v); });
        });
    });
    return out;
}

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
const PAGE_TITLES = { dashboard: 'Overview', setup: 'Settings', budget: 'Budgets', tracking: 'History' };

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    document.querySelectorAll('.mob-btn').forEach(b => {
        const isActive = b.dataset.page === page;
        b.classList.toggle('active', isActive);
        b.style.color = isActive ? '#4a8af4' : '';
    });
    const titleEl = document.getElementById('mobilePageTitle');
    if (titleEl) titleEl.textContent = PAGE_TITLES[page] || page;
    if (page === 'dashboard') renderDashboard();
    if (page === 'setup') { sView = 'main'; cSort = false; renderSettings(); }
    const fb = document.getElementById('fabAdd'); if (fb) fb.style.display = page === 'setup' ? 'none' : '';
    if (page === 'budget') renderBudgets();
    if (page === 'tracking') renderHistory();
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
            if (result.kategoriByPeriod) {
                kategoriByPeriod = result.kategoriByPeriod;
                daftarKategori = aggregateKategori(kategoriByPeriod);
            } else if (result.kategori) {
                daftarKategori = result.kategori;
            }
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
    dataTransaksi.forEach(i => { if (i.Tanggal) years.add(parseTanggal(i.Tanggal).getFullYear()); });
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
        const d = parseTanggal(item.Tanggal);
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
    // Rebuild year options to include saved periods
    const y = now.getFullYear();
    const yearSet = new Set([y]);
    for (let i = y - 3; i <= y + 3; i++) yearSet.add(i);
    Object.keys(kategoriByPeriod).forEach(k => {
        const p = k.split('-'); yearSet.add(Number(p[1]));
    });
    const years = [...yearSet].sort((a, b) => b - a);
    const currentVal = yEl.value || String(y);
    yEl.innerHTML = years.map(v =>
        `<option value="${v}" ${v === Number(currentVal) ? 'selected' : ''}>${v}</option>`
    ).join('');
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
    const filtered = getOverviewData();
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
    renderOverview();
}

function renderBreakdown(jenis, filtered) {
    const c = JENIS_COLOR[jenis];
    const categories = kategoriForFilter(jenis);
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
                scales: { y: { ticks: { callback: v => 'Rp' + (v / 1e6).toFixed(0) + 'jt', font: { size: 9 } }, grid: { color: '#2c2c2e' }, beginAtZero: true }, x: { ticks: { font: { size: 10 } } } }
            }
        });
    } else {
        const monthly = { Income: Array(12).fill(0), Expenses: Array(12).fill(0), Savings: Array(12).fill(0) };
        dataTransaksi.filter(i => parseTanggal(i.Tanggal).getFullYear() === tahun).forEach(i => {
            const m = parseTanggal(i.Tanggal).getMonth();
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
                scales: { y: { ticks: { callback: v => 'Rp' + (v / 1e6).toFixed(0) + 'jt', font: { size: 9 } }, grid: { color: '#2c2c2e' }, beginAtZero: true, stacked: false }, x: { ticks: { font: { size: 9 } }, stacked: false } }
            }
        });
    }
}

// ==============================================
// SETUP
// ==============================================
function renderSetup() {
    ensureSetupPeriodOptions();
    const bulan = parseInt(document.getElementById('setupBulan').value) || 0;
    const tahun = parseInt(document.getElementById('setupTahun').value) || 0;
    const key = periodKey(bulan, tahun);
    const saved = !!kategoriByPeriod[key];
    const isLocked = saved && !setupEditMode;

    // Only reload setupDraft from saved data when NOT in edit mode
    if (!setupEditMode) {
        const src = saved ? kategoriByPeriod[key] : { Income: [], Expenses: [], Savings: [] };
        setupDraft = {
            Income:   Array.isArray(src.Income)   ? src.Income.slice()   : [],
            Expenses: Array.isArray(src.Expenses) ? src.Expenses.slice() : [],
            Savings:  Array.isArray(src.Savings)  ? src.Savings.slice()  : []
        };
    }

    // Update info text
    const infoEl = document.getElementById('setupSourceInfo');
    if (infoEl) {
        if (saved && isLocked) {
            infoEl.innerHTML = '<span style="color:#16a34a; font-weight:600"><i class="fa-solid fa-lock"></i> Terkunci \u2014 ' + MONTHS_FULL[bulan - 1] + ' ' + tahun + '</span>';
        } else if (saved && !isLocked) {
            infoEl.innerHTML = '<span style="color:#d97706; font-weight:600"><i class="fa-solid fa-lock-open"></i> Sedang diedit \u2014 ' + MONTHS_FULL[bulan - 1] + ' ' + tahun + '</span>';
        } else {
            infoEl.innerHTML = '<span style="color:#d97706; font-weight:600"><i class="fa-solid fa-circle-exclamation"></i> Belum disimpan \u2014 ' + MONTHS_FULL[bulan - 1] + ' ' + tahun + '</span>';
        }
    }

    // Update buttons - just toggle display, NO innerHTML changes
    const saveBtn = document.getElementById('btnSaveSetup');
    const editBtn = document.getElementById('btnEditSetup');
    const lockBtn = document.getElementById('btnLockSetup');
    const copyWrap = document.getElementById('copySetupWrap');

    if (saved) {
        // Saved period: show Edit (if locked) or Kunci+Simpan (if unlocked)
        if (editBtn) editBtn.style.display = isLocked ? 'flex' : 'none';
        if (lockBtn) lockBtn.style.display = isLocked ? 'none' : 'flex';
        if (saveBtn) saveBtn.style.display = isLocked ? 'none' : 'flex';
        if (copyWrap) copyWrap.style.display = 'none';
    } else {
        // Not saved yet: show only Simpan, no lock buttons
        if (editBtn) editBtn.style.display = 'none';
        if (lockBtn) lockBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'flex';
        if (copyWrap) {
            const savedKeys = Object.keys(kategoriByPeriod);
            if (savedKeys.length > 0) {
                copyWrap.style.display = 'flex';
                const sel = copyWrap.querySelector('select');
                if (sel) {
                    sel.innerHTML = '<option value="">Salin dari...</option>' +
                        savedKeys.map(k => {
                            const [b, y] = k.split('-');
                            return '<option value="' + k + '">' + MONTHS_FULL[parseInt(b)-1] + ' ' + y + '</option>';
                        }).join('');
                }
            } else {
                copyWrap.style.display = 'none';
            }
        }
    }

    // Control + (add) button visibility based on lock state
    document.querySelectorAll('#page-setup button[onclick^="addKategori"]').forEach(btn => {
        btn.style.display = isLocked ? 'none' : 'block';
    });

    // Render category inputs - LOCKED = readonly, UNLOCKED = editable with trash
    ['Income', 'Expenses', 'Savings'].forEach(j => {
        const el = document.getElementById('setup-' + j.toLowerCase());
        if (!el) return;
        if (isLocked) {
            // LOCKED: read-only inputs, NO trash buttons
            el.innerHTML = (setupDraft[j] || []).map((kat, idx) => `
                <div style="display:flex; align-items:center; gap:6px">
                    <input type="text" value="${String(kat).replace(/"/g, '&quot;')}" readonly
                        style="flex:1; border:1px solid #e2e8f0; padding:6px 10px; border-radius:6px; font-size:13px; outline:none; background:#f1f5f9; color:#64748b; cursor:not-allowed">
                </div>
            `).join('');
            if (!setupDraft[j] || setupDraft[j].length === 0) {
                el.innerHTML = '<p style="color:#94a3b8; font-size:11px; padding:4px 0">Tidak ada kategori tersimpan.</p>';
            }
        } else {
            // UNLOCKED: editable inputs WITH trash buttons
            el.innerHTML = (setupDraft[j] || []).map((kat, idx) => `
                <div style="display:flex; align-items:center; gap:6px">
                    <input type="text" value="${String(kat).replace(/"/g, '&quot;')}" data-jenis="${j}" data-idx="${idx}" oninput="onSetupInput('${j}', ${idx}, this.value)"
                        style="flex:1; border:1px solid #e2e8f0; padding:6px 10px; border-radius:6px; font-size:13px; outline:none">
                    <button onclick="removeKategori('${j}', ${idx})" style="background:#fef2f2; color:#dc2626; border:none; border-radius:6px; width:26px; height:26px; cursor:pointer; font-size:11px">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `).join('');
            if (!setupDraft[j] || setupDraft[j].length === 0) {
                el.innerHTML = '<p style="color:#94a3b8; font-size:11px; padding:4px 0">Belum ada kategori. Klik + untuk menambah.</p>';
            }
        }
    });
}

function onSetupInput(j, idx, val) { if (!setupDraft[j]) setupDraft[j] = []; setupDraft[j][idx] = val; }
function addKategori(j) {
    // Only allow adding when NOT locked
    const bulan = parseInt(document.getElementById('setupBulan').value) || 0;
    const tahun = parseInt(document.getElementById('setupTahun').value) || 0;
    if (kategoriByPeriod[periodKey(bulan, tahun)] && !setupEditMode) {
        showToast('Klik Edit dulu untuk mengubah kategori yang terkunci.', true);
        return;
    }
    setupEditMode = true; // Preserve draft on re-render (critical for unsaved periods)
    (setupDraft[j] = setupDraft[j] || []).push('');
    renderSetup();
}
function removeKategori(j, idx) {
    // Only allow removing when NOT locked
    const bulan = parseInt(document.getElementById('setupBulan').value) || 0;
    const tahun = parseInt(document.getElementById('setupTahun').value) || 0;
    if (kategoriByPeriod[periodKey(bulan, tahun)] && !setupEditMode) {
        showToast('Klik Edit dulu untuk mengubah kategori yang terkunci.', true);
        return;
    }
    setupEditMode = true; // Preserve draft on re-render (critical for unsaved periods)
    setupDraft[j].splice(idx, 1);
    renderSetup();
}
function toggleLockSetup() {
    const bulan = parseInt(document.getElementById('setupBulan').value) || 0;
    const tahun = parseInt(document.getElementById('setupTahun').value) || 0;
    if (!kategoriByPeriod[periodKey(bulan, tahun)]) return; // can't toggle if not saved
    setupEditMode = !setupEditMode;
    renderSetup();
}
function copySetupFrom() {
    const sel = document.querySelector('#copySetupWrap select');
    if (!sel || !sel.value) return;
    const key = sel.value;
    const src = kategoriByPeriod[key];
    if (!src) return;
    setupDraft = {
        Income:   (src.Income || []).slice(),
        Expenses: (src.Expenses || []).slice(),
        Savings:  (src.Savings || []).slice()
    };
    setupEditMode = true; // Enter edit mode so draft is preserved
    renderSetup();
    showToast('\\u2713 Kategori disalin dari ' + key.replace('-', '/'));
}

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
    const bulan = parseInt(document.getElementById('setupBulan').value) || 0;
    const tahun = parseInt(document.getElementById('setupTahun').value) || 0;
    if (!bulan || !tahun) { showToast('Pilih Bulan & Tahun dulu.', true); return; }
    showSaving('Menyimpan kategori untuk ' + MONTHS_FULL[bulan - 1] + ' ' + tahun + '...');
    try {
        const res = await apiPost({ action: 'updateSetup', Bulan: bulan, Tahun: tahun, ...values });
        if (res.status === 'success') {
            // Tandai periode ini sebagai tersimpan supaya tidak balik ke default.
            kategoriByPeriod[periodKey(bulan, tahun)] = {
                Income: values.Income.slice(),
                Expenses: values.Expenses.slice(),
                Savings: values.Savings.slice()
            };
            daftarKategori = aggregateKategori(kategoriByPeriod);
            setupEditMode = false; // Lock after save
            showToast('\u2713 Kategori tersimpan & terkunci untuk ' + MONTHS_FULL[bulan - 1] + ' ' + tahun);
            renderSetup();
            populateKategoriDropdown(document.getElementById('inputJenis').value);
            renderBudgetPlanning();
            renderDashboard();
            renderSisaAnggaran();
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
        const d = parseTanggal(i.Tanggal);
        if (d.getFullYear() !== tahun || (d.getMonth() + 1) !== bulan) return;
        map[i.Kategori] = (map[i.Kategori] || 0) + Number(i.Nominal);
    });
    return map;
}

function renderBudgetPlanning() {
    ensureBudgetPeriodOptions();
    const { bulan, tahun } = getSelectedBudgetPeriod();
    const incomeActuals = getActualByCategory('Income', bulan, tahun);
    const periodCats = kategoriForPeriod(bulan, tahun) || { Income: [], Expenses: [], Savings: [] };
    const incomeCats = [...new Set([...(periodCats.Income || []), ...Object.keys(incomeActuals)])];
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
        const cats = periodCats[jenis] || [];
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
    const cats = kategoriForPeriod(bulan, tahun).Expenses || [];
    const titleEl = document.getElementById('sisaAnggaranTitle');
    if (titleEl) titleEl.textContent = `Sisa Anggaran Expenses (${MONTHS_FULL[bulan - 1]} ${tahun})`;
    const actuals = {};
    dataTransaksi.filter(i => {
        if (i.Jenis !== 'Expenses' || !i.Tanggal) return false;
        const d = parseTanggal(i.Tanggal);
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
// Format any date string to DD/MM/YYYY
function formatTanggal(tgl) {
    if (!tgl) return '-';
    var s = String(tgl).trim();
    // Already DD/MM/YYYY (like "18/01/2026")
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return s.substring(0, 10);
    // YYYY-MM-DD format (like "2026-01-18" or "2026-01-18T00:00:00")
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        var parts = s.substring(0, 10).split('-');
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    // "Sat Jan 18 2026 00:00:00 GMT+0700" or similar - parse directly
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var m = s.match(/(\w{3})\s+(\d{1,2})\s+(\d{4})/);
    if (m) {
        var mi = monthNames.indexOf(m[1]);
        if (mi >= 0) {
            return String(m[2]).padStart(2, '0') + '/' + String(mi + 1).padStart(2, '0') + '/' + m[3];
        }
    }
    // Fallback: return first 10 chars
    return s.substring(0, 10);
}

// Parse DD/MM/YYYY or YYYY-MM-DD to Date object (fixes JS treating DD/MM as US format)
function parseTanggal(tgl) {
    if (!tgl) return new Date(NaN);
    var s = String(tgl).trim();
    var parts = s.split('/');
    if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    parts = s.split('-');
    if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(s);
}

function renderTabel(data) {
    const tbody = document.getElementById('tabelBody');
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:28px; color:#94a3b8; font-size:13px"><i class="fa-solid fa-inbox" style="display:block; font-size:24px; margin-bottom:8px"></i>Belum ada transaksi.</td></tr>';
        return;
    }
    tbody.innerHTML = [...data].reverse().map(item => {
        const isInc = item.Jenis === 'Income', isSav = item.Jenis === 'Savings';
        const color = isInc ? '#16a34a' : isSav ? '#b45309' : '#dc2626';
        const op = isInc || isSav ? '+' : '\u2212';
        const badge = isInc ? 'badge-income' : isSav ? 'badge-savings' : 'badge-expenses';
        return `<tr style="border-bottom:1px solid #f1f5f9; font-size:12px; transition:background 0.1s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:10px 12px; color:#64748b; white-space:nowrap">${formatTanggal(item.Tanggal)}</td>
            <td style="padding:10px 12px"><span class="${badge}" style="padding:3px 8px; border-radius:20px; font-size:11px; font-weight:600">${item.Jenis || '-'}</span></td>
            <td style="padding:10px 12px; color:#0f172a; font-weight:500">${item.Kategori || '-'}</td>
            <td style="padding:10px 12px; text-align:right; font-weight:700; color:${color}; white-space:nowrap">${op} ${formatRp(item.Nominal)}</td>
            <td style="padding:10px 12px; color:#64748b; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${item.Deskripsi || '-'}</td>
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
    // Ambil kategori sesuai periode Tanggal transaksi (kalau belum tersimpan -> fallback ke periode terdekat)
    const { bulan, tahun } = getTrackingPeriod();
    const list = (kategoriForPeriod(bulan, tahun)[jenis]) || [];
    sel.innerHTML = '<option value="">-- Pilih Kategori --</option>' + list.map(k => `<option value="${k}" ${k === selected ? 'selected' : ''}>${k}</option>`).join('');
}
function warnaiJenis(jenis) {
    const sel = document.getElementById('inputJenis');
    const c = JENIS_COLOR[jenis];
    sel.style.background = c.light; sel.style.color = c.text; sel.style.borderColor = c.border;
}
document.getElementById('inputJenis').addEventListener('change', function () { populateKategoriDropdown(this.value); warnaiJenis(this.value); });
document.getElementById('inputTanggal').addEventListener('change', function () {
    // Ganti tanggal -> ganti periode -> kategori mungkin berbeda
    populateKategoriDropdown(document.getElementById('inputJenis').value, document.getElementById('inputKategori').value);
    renderSisaAnggaran();
});
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
    // Convert DD/MM/YYYY to YYYY-MM-DD for date input
    var tglParts = (t.Tanggal || '').split('/');
    var tglInput = tglParts.length === 3 ? tglParts[2] + '-' + tglParts[1] + '-' + tglParts[0] : (t.Tanggal || '').split('T')[0];
    document.getElementById('inputTanggal').value = tglInput;
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

// ==============================================
// TAHAP 1: OVERVIEW, FILTER PERIODE, SHEET TRANSAKSI
// ==============================================
let txEditId = '', ovPeriod = 'month', ovFrom = '', ovTo = '', txJenis = 'Expenses';
const EMO = { Income: '\u{1F4BC}', Expenses: '\u{1F6D2}', Savings: '\u{1F3E6}' };
const EMOJIS = ['\u{1F6D2}','\u2615','\u{1F37D}\uFE0F','\u{1F6F5}','\u{1F697}','\u{1F687}','\u26FD','\u{1F3E0}','\u{1F4A1}','\u{1F4F1}','\u{1F3AC}','\u{1F381}','\u{1F48A}','\u{1F4DA}','\u2708\uFE0F','\u{1F455}','\u{1F4BC}','\u{1F3E6}','\u{1F4B0}','\u{1F437}'];
const PERIODS = [['today','Today'],['week','This Week'],['month','This Month'],['all','All Time'],['custom','Custom']];
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function idr(n) { return 'IDR ' + Math.round(n).toLocaleString('id-ID'); }
function emojiMap() { try { return JSON.parse(localStorage.getItem('mb_emoji') || '{}'); } catch (e) { return {}; } }
function emojiFor(k, jn) { return emojiMap()[k] || EMO[jn] || '\u{1F4B0}'; }
function ovRange() {
    const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    if (ovPeriod === 'today') return [t, t];
    if (ovPeriod === 'week') { const s = new Date(t); s.setDate(t.getDate() - (t.getDay() + 6) % 7); const e = new Date(s); e.setDate(s.getDate() + 6); return [s, e]; }
    if (ovPeriod === 'month') return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
    if (ovPeriod === 'custom' && ovFrom && ovTo) return [parseTanggal(ovFrom), parseTanggal(ovTo)];
    return null;
}
function getOverviewData() {
    const r = ovRange();
    return dataTransaksi.filter(i => { if (!i.Tanggal) return false; if (!r) return true; const d = parseTanggal(i.Tanggal); return d >= r[0] && d <= r[1]; });
}
function renderPeriodMenu() {
    document.getElementById('periodMenu').innerHTML = PERIODS.map(p => `<div class="pm-i" onclick="setPeriod('${p[0]}')"><span class="ck">${ovPeriod === p[0] ? '\u2713' : ''}</span>${p[1]}</div>`).join('') +
        `<div class="pm-c" id="pmCustom" style="display:${ovPeriod === 'custom' ? 'flex' : 'none'}"><input type="date" id="pmFrom" value="${ovFrom}"><input type="date" id="pmTo" value="${ovTo}"><button onclick="applyCustom()">Terapkan</button></div>`;
    document.getElementById('periodLbl').textContent = (PERIODS.find(p => p[0] === ovPeriod) || PERIODS[2])[1];
}
function togglePeriodMenu(e) { e.stopPropagation(); renderPeriodMenu(); document.getElementById('periodMenu').classList.toggle('open'); }
function setPeriod(p) { ovPeriod = p; renderPeriodMenu(); if (p !== 'custom') { document.getElementById('periodMenu').classList.remove('open'); renderDashboard(); } }
function applyCustom() { ovFrom = document.getElementById('pmFrom').value; ovTo = document.getElementById('pmTo').value; if (!ovFrom || !ovTo) { showToast('Isi tanggal awal dan akhir.', true); return; } document.getElementById('periodMenu').classList.remove('open'); renderPeriodMenu(); renderDashboard(); }
document.addEventListener('click', e => { const m = document.getElementById('periodMenu'); if (m && !m.contains(e.target)) m.classList.remove('open'); });

function renderOverview() {
    const sum = (a, k) => a.filter(i => i.Jenis === k).reduce((s, i) => s + Number(i.Nominal), 0);
    const bal = sum(dataTransaksi, 'Income') - sum(dataTransaksi, 'Expenses') - sum(dataTransaksi, 'Savings');
    const per = getOverviewData(), spent = sum(per, 'Expenses');
    const n = new Date(), m = n.getMonth() + 1, y = n.getFullYear();
    const bud = dataBudget.filter(b => b.Jenis === 'Expenses' && Number(b.Bulan) === m && Number(b.Tahun) === y);
    const tb = bud.reduce((s, b) => s + Number(b.Budget), 0);
    const dim = new Date(y, m, 0).getDate(), left = dim - n.getDate();
    const pct = tb > 0 ? Math.min(100, spent / tb * 100) : 0;
    document.getElementById('ovBal').innerHTML = `<div class="bal"><div class="t">Total Balance</div>
        <div class="v">${idr(bal)} ${tb > 0 ? `<small>of ${idr(tb)} budget</small>` : ''}</div><div class="dsh"></div>
        <div class="two"><div><p>Spent <b>${idr(spent)}</b></p><div class="bar"><i style="width:${pct}%;background:${pct >= 100 ? '#e5484d' : '#4a8af4'}"></i></div></div>
        <div><p>End month <b>${left} days</b></p><div class="bar"><i style="width:${Math.max(4, left / dim * 100)}%;background:#e5484d"></i></div></div></div></div>`;
    const g = {}; per.filter(i => i.Jenis === 'Expenses').forEach(i => g[i.Kategori] = (g[i.Kategori] || 0) + Number(i.Nominal));
    const top = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 2);
    document.getElementById('ovTop').innerHTML = top.length ? '<div class="tcg">' + top.map(([k, v]) => {
        const b = bud.find(x => x.Kategori === k), bv = b ? Number(b.Budget) : 0;
        return `<div class="tc"><div class="n"><span>${emojiFor(k, 'Expenses')}</span><div><em>${esc(k)}</em><b>${idr(v)}</b></div></div><div class="bar"><i style="width:${bv ? Math.min(100, v / bv * 100) : 0}%;background:#4a8af4"></i></div><small>${bv ? 'of ' + idr(bv) + ' budget' : 'No budget set'}</small></div>`;
    }).join('') + '</div>' : '<div class="tc emp">No expenses this period</div>';
    const rec = per.slice().sort((a, b) => parseTanggal(b.Tanggal) - parseTanggal(a.Tanggal) || String(b.Timestamp).localeCompare(String(a.Timestamp))).slice(0, 5);
    document.getElementById('ovRec').innerHTML = rec.length ? '<div class="rt">' + rec.map(i => {
        const inc = i.Jenis === 'Income', dt = parseTanggal(i.Tanggal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `<div class="rr"><div class="e">${emojiFor(i.Kategori, i.Jenis)}</div><div class="m"><b>${esc(i.Deskripsi || i.Kategori)}</b><em>${esc(i.Kategori)}</em></div><div class="a"><b style="color:${inc ? '#4a8af4' : '#fff'}">${inc ? '+' : '-'}${idr(i.Nominal)}</b><em>${dt}</em></div></div>`;
    }).join('') + '</div>' : '<div class="rt emp">Belum ada transaksi di periode ini</div>';
}

function openTxBase() {
    const d = new Date(), p = v => String(v).padStart(2, '0');
    document.getElementById('txDate').value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    document.getElementById('txAmt').value = ''; document.getElementById('txNote').value = '';
    document.getElementById('emojiPick').innerHTML = EMOJIS.map(e => `<span onclick="pickEmoji('${e}')">${e}</span>`).join('');
    document.getElementById('emojiPick').classList.remove('open');
    setTxJenis('Expenses');
    document.getElementById('txSheet').classList.add('open');
}
function closeTx() { document.getElementById('txSheet').classList.remove('open'); }
function pickEmoji(e) { document.getElementById('txEmoji').textContent = e; document.getElementById('emojiPick').classList.remove('open'); }
function setTxJenis(jn) {
    txJenis = jn;
    document.querySelectorAll('#txSeg button').forEach(b => b.classList.toggle('on', b.dataset.j === jn));
    document.getElementById('txEmoji').textContent = EMO[jn];
    fillTxCat();
}
function fillTxCat() {
    const dv = document.getElementById('txDate').value; if (!dv) return;
    const d = parseTanggal(dv), list = (kategoriForPeriod(d.getMonth() + 1, d.getFullYear())[txJenis]) || [];
    document.getElementById('txCat').innerHTML = list.length ? '<option value="">Choose</option>' + list.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('') : '<option value="">Belum ada kategori</option>';
}
document.getElementById('txAmt').addEventListener('input', function () { const r = this.value.replace(/\D/g, ''); this.value = r ? Number(r).toLocaleString('id-ID') : ''; });
async function submitTx() {
    const nominal = document.getElementById('txAmt').value.replace(/\D/g, ''), kat = document.getElementById('txCat').value, tgl = document.getElementById('txDate').value;
    if (!nominal || !kat || !tgl) { showToast('Lengkapi nominal, kategori, dan tanggal.', true); return; }
    const btn = document.getElementById('txGo'); btn.disabled = true; showSaving('Menyimpan transaksi...');
    try {
        const res = await apiPost({ action: txEditId ? 'update' : 'insert', ID: txEditId || '', Tanggal: tgl, Jenis: txJenis, Kategori: kat, Nominal: nominal, Deskripsi: document.getElementById('txNote').value });
        if (res.status === 'success') {
            const em = emojiMap(); em[kat] = document.getElementById('txEmoji').textContent;
            try { localStorage.setItem('mb_emoji', JSON.stringify(em)); } catch (e) {}
            closeTx(); await loadData(); showToast('\u2713 Transaksi disimpan!');
        } else showToast('Gagal: ' + res.message, true);
    } catch (err) { showToast('Error: ' + err.message, true); }
    finally { hideSaving(); btn.disabled = false; }
}


// ==============================================
// TAHAP 2: HISTORY, BUDGETS, FORM BUDGET
// ==============================================
let hSearch = '', hJenis = 'all', hSearchOn = false;
let bMonth = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'), bJenisTab = 'Expenses', budJenis = 'Expenses', budEdit = '';
const _ld = loadData;
loadData = async function () { await _ld.apply(this, arguments); refreshViews(); };
function refreshViews() { try { renderHistory(); renderBudgets(); } catch (e) { console.error(e); } }
function fabAction() { const p = document.querySelector('.page.active'); if (p && p.id === 'page-budget') openBud(); else openTx(); }
function ymd(t) { const d = parseTanggal(t), p = v => String(v).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function rowHtml(i) {
    const inc = i.Jenis === 'Income', dt = parseTanggal(i.Tanggal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<div class="rr" onclick="openTx('${i.ID}')"><div class="e">${emojiFor(i.Kategori, i.Jenis)}</div><div class="m"><b>${esc(i.Deskripsi || i.Kategori)}</b><em>${esc(i.Kategori)}</em></div><div class="a"><b style="color:${inc ? '#4a8af4' : '#fff'}">${inc ? '+' : '-'}${idr(i.Nominal)}</b><em>${dt}</em></div></div>`;
}
function renderHistory() {
    const el = document.getElementById('hist'); if (!el) return;
    const q = hSearch.trim().toLowerCase();
    const d = dataTransaksi.filter(i => i.Tanggal && (hJenis === 'all' || i.Jenis === hJenis) && (!q || (i.Kategori + ' ' + i.Deskripsi).toLowerCase().includes(q)))
        .sort((a, b) => parseTanggal(b.Tanggal) - parseTanggal(a.Tanggal) || String(b.Timestamp).localeCompare(String(a.Timestamp)));
    const s = k => d.filter(i => i.Jenis === k).reduce((t, i) => t + Number(i.Nominal), 0);
    const groups = {}; d.forEach(i => { const k = parseTanggal(i.Tanggal).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); (groups[k] = groups[k] || []).push(i); });
    const fo = [['all', 'All'], ['Expenses', 'Expenses'], ['Income', 'Income'], ['Savings', 'Savings']];
    el.innerHTML = `<div class="hh"><h2>History</h2><div class="hp"><button onclick="hSearchOn=!hSearchOn;renderHistory()"><i class="fa-solid fa-magnifying-glass"></i></button><button onclick="event.stopPropagation();document.getElementById('fMenu').classList.toggle('open')"><i class="fa-solid fa-bars-staggered"></i></button></div>
        <div class="fm" id="fMenu">${fo.map(f => `<div class="pm-i" onclick="hJenis='${f[0]}';renderHistory()"><span class="ck">${hJenis === f[0] ? '\u2713' : ''}</span>${f[1]}</div>`).join('')}</div></div>
        ${hSearchOn ? `<input class="srch" id="hQ" placeholder="Search" value="${esc(hSearch)}" oninput="hSearch=this.value;renderHistory();var e=document.getElementById('hQ');e.focus();e.setSelectionRange(9999,9999)">` : ''}
        <div class="g2" style="margin-top:8px"><div class="stat-card b"><div class="stat-label"><i class="fa-solid fa-plus"></i><span>Income</span></div><div class="stat-value">${idr(s('Income'))}</div></div>
        <div class="stat-card"><div class="stat-label"><i class="fa-solid fa-minus"></i><span>Expenses</span></div><div class="stat-value">${idr(s('Expenses'))}</div></div>
        <div class="stat-card g" style="grid-column:1 / -1"><div class="stat-label"><i class="fa-solid fa-piggy-bank"></i><span>Savings</span></div><div class="stat-value">${idr(s('Savings'))}</div></div></div>
        ${Object.keys(groups).length ? Object.entries(groups).map(([k, v]) => `<div class="mh">${k}</div><div class="rt">${v.map(rowHtml).join('')}</div>`).join('') : '<div class="emp">Belum ada transaksi</div>'}`;
}
document.addEventListener('click', () => { const f = document.getElementById('fMenu'); if (f) f.classList.remove('open'); });

function renderBudgets() {
    const el = document.getElementById('bud'); if (!el) return;
    const [y, m] = bMonth.split('-').map(Number);
    const items = dataBudget.filter(b => b.Jenis === bJenisTab && Number(b.Bulan) === m && Number(b.Tahun) === y && Number(b.Budget) > 0);
    const act = getActualByCategory(bJenisTab, m, y) || {};
    const planned = items.reduce((t, b) => t + Number(b.Budget), 0), used = items.reduce((t, b) => t + Number(act[b.Kategori] || 0), 0);
    const lbl = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    el.innerHTML = `<div class="hh"><h2>Budgets</h2><label class="mp">${lbl}<input type="month" value="${bMonth}" onchange="bMonth=this.value||bMonth;renderBudgets()"></label></div>
        <div class="tabs"><button class="${bJenisTab === 'Expenses' ? 'on' : ''}" onclick="bJenisTab='Expenses';renderBudgets()">Expenses</button><button class="${bJenisTab === 'Savings' ? 'on' : ''}" onclick="bJenisTab='Savings';renderBudgets()">Savings</button></div>
        <div class="g2"><div class="stat-card b"><div class="stat-label"><i class="fa-solid fa-equals"></i><span>Planned</span></div><div class="stat-value">${idr(planned)}</div></div>
        <div class="stat-card g"><div class="stat-label"><i class="fa-solid fa-check"></i><span>Remaining</span></div><div class="stat-value">${idr(planned - used)}</div></div></div>
        <div class="g2" style="margin-top:10px">${items.map(b => { const a = Number(act[b.Kategori] || 0), bv = Number(b.Budget), p = Math.min(100, a / bv * 100);
            return `<div class="tc bc" onclick="openBud('${esc(b.Kategori).replace(/'/g, "\\'")}')"><div class="n"><span>${emojiFor(b.Kategori, b.Jenis)}</span><div><em>${esc(b.Kategori)}</em><b>${idr(a)}</b></div></div><div class="bar"><i style="width:${p}%;background:${a > bv ? '#e5484d' : '#4a8af4'}"></i></div><small>of ${idr(bv)} budget</small></div>`; }).join('')}</div>
        ${items.length ? '' : '<div class="emp">Belum ada budget bulan ini.<br>Tekan + untuk membuat.</div>'}`;
}

function openTx(id) {
    openTxBase(); txEditId = id || '';
    document.getElementById('txTitle').textContent = id ? 'Edit Transaction' : 'New Transaction';
    document.getElementById('txDel').style.display = id ? 'block' : 'none';
    if (!id) return;
    const t = dataTransaksi.find(x => String(x.ID) === String(id)); if (!t) return;
    document.getElementById('txDate').value = ymd(t.Tanggal);
    setTxJenis(t.Jenis);
    const c = document.getElementById('txCat');
    if (![...c.options].some(o => o.value === t.Kategori)) c.insertAdjacentHTML('beforeend', `<option value="${esc(t.Kategori)}">${esc(t.Kategori)}</option>`);
    c.value = t.Kategori;
    document.getElementById('txAmt').value = Number(t.Nominal).toLocaleString('id-ID');
    document.getElementById('txNote').value = t.Deskripsi || '';
    document.getElementById('txEmoji').textContent = emojiFor(t.Kategori, t.Jenis);
}
function delTx() { const id = txEditId; closeTx(); hapusTransaksi(id); }

function setBudJenis(jn) {
    budJenis = jn;
    document.querySelectorAll('#bSeg button').forEach(b => b.classList.toggle('on', b.dataset.j === jn));
    const [y, m] = bMonth.split('-').map(Number), list = (kategoriForPeriod(m, y)[jn]) || [];
    document.getElementById('bCat').innerHTML = list.length ? '<option value="">Choose</option>' + list.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('') : '<option value="">Belum ada kategori</option>';
    document.getElementById('bEmoji').textContent = EMO[jn];
}
function openBud(kat) {
    budEdit = kat || '';
    document.getElementById('bTitle').textContent = kat ? 'Edit Budget' : 'New Budget';
    document.getElementById('bDel').style.display = kat ? 'block' : 'none';
    document.getElementById('bInterval').style.display = kat ? 'none' : 'block';
    document.getElementById('bAmt').value = ''; document.getElementById('bEndOn').checked = false; document.getElementById('bEndRow').style.display = 'none'; document.getElementById('bRep').value = 'm';
    setBudJenis(bJenisTab);
    if (kat) {
        const [y, m] = bMonth.split('-').map(Number), b = dataBudget.find(x => x.Jenis === bJenisTab && x.Kategori === kat && Number(x.Bulan) === m && Number(x.Tahun) === y);
        const c = document.getElementById('bCat');
        if (![...c.options].some(o => o.value === kat)) c.insertAdjacentHTML('beforeend', `<option value="${esc(kat)}">${esc(kat)}</option>`);
        c.value = kat; document.getElementById('bEmoji').textContent = emojiFor(kat, bJenisTab);
        document.getElementById('bAmt').value = b ? Number(b.Budget).toLocaleString('id-ID') : '';
    }
    document.getElementById('bSheet').classList.add('open');
}
function closeBud() { document.getElementById('bSheet').classList.remove('open'); }
document.getElementById('bAmt').addEventListener('input', function () { const r = this.value.replace(/\D/g, ''); this.value = r ? Number(r).toLocaleString('id-ID') : ''; });
async function saveBudgets(list, msg) {
    showSaving('Menyimpan budget...');
    try {
        const res = await apiPost({ action: 'updateBudget', budgets: list });
        if (res.status === 'success') { dataBudget = list; closeBud(); renderBudgets(); renderOverview(); showToast(msg); }
        else showToast('Gagal: ' + res.message, true);
    } catch (err) { showToast('Error: ' + err.message, true); }
    finally { hideSaving(); }
}
function submitBud() {
    const amt = parseInt(document.getElementById('bAmt').value.replace(/\D/g, '')) || 0, kat = document.getElementById('bCat').value;
    if (!amt || !kat) { showToast('Lengkapi nominal dan kategori.', true); return; }
    const [y, m] = bMonth.split('-').map(Number); let ey = y, em = m;
    if (!budEdit && document.getElementById('bRep').value === 'm') {
        const ed = document.getElementById('bEnd').value;
        if (document.getElementById('bEndOn').checked && ed) { const d = parseTanggal(ed); ey = d.getFullYear(); em = d.getMonth() + 1; if (ey * 12 + em < y * 12 + m) { showToast('End Date sebelum bulan awal.', true); return; } }
        else { ey = y; em = 12; }
    }
    const keys = new Set(), add = [];
    for (let yy = y, mm = m; yy * 12 + mm <= ey * 12 + em && add.length < 60; mm++) { if (mm > 12) { mm = 1; yy++; } keys.add(yy + '-' + mm); add.push({ Jenis: budJenis, Kategori: kat, Bulan: mm, Tahun: yy, Budget: amt }); }
    const kept = dataBudget.filter(b => !(b.Jenis === budJenis && b.Kategori === kat && keys.has(Number(b.Tahun) + '-' + Number(b.Bulan))));
    saveBudgets([...kept, ...add], add.length > 1 ? '\u2713 Budget tersimpan untuk ' + add.length + ' bulan!' : '\u2713 Budget tersimpan!');
}
function delBud() {
    if (!confirm('Hapus budget ini untuk bulan ini?')) return;
    const [y, m] = bMonth.split('-').map(Number);
    saveBudgets(dataBudget.filter(b => !(b.Jenis === budJenis && b.Kategori === budEdit && Number(b.Bulan) === m && Number(b.Tahun) === y)), '\u2713 Budget dihapus!');
}


// ==============================================
// TAHAP 3: SETTINGS & CATEGORIES
// ==============================================
let sView = 'main', cTab = 'Expenses', cSort = false, cDraft = [], cIdx = -1;
let cMonth = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
const CT = [['Expenses', 'Expenses'], ['Income', 'Incomes'], ['Savings', 'Savings']];
function curCats() {
    const [y, m] = cMonth.split('-').map(Number), s = kategoriForPeriod(m, y) || {};
    return { Income: (s.Income || []).slice(), Expenses: (s.Expenses || []).slice(), Savings: (s.Savings || []).slice() };
}
function renderSettings() {
    const el = document.getElementById('set'); if (!el) return;
    if (sView === 'cats') return renderCats(el);
    const em = (currentUser && currentUser.email) || '', ini = (em.slice(0, 2) || 'MB').toUpperCase();
    const row = (bg, ic, t, v, on, red) => `<div class="sh-row" onclick="${on}"><span class="ic" style="background:${bg}"><i class="fa-solid ${ic}"></i></span><b style="${red ? 'color:#ff5a5f' : ''}">${t}</b>${v ? `<span class="sv">${v}</span>` : ''}${on && !red ? '<i class="fa-solid fa-chevron-right" style="color:#636366;font-size:13px"></i>' : ''}</div>`;
    el.innerHTML = `<h2 style="margin-top:16px">Settings</h2>
        <div class="sh-c"><div class="sh-row" style="cursor:default"><div class="av">${esc(ini)}</div><b style="font-size:15px;word-break:break-all">${esc(em || 'MyBudget')}<br><span class="sv" style="font-size:13px;font-weight:600">Personal account</span></b></div></div>
        <div class="sh-c" style="margin-top:14px">${row('#5b8def', 'fa-building-columns', 'Account Balance', 'Soon', '')}${row('#7b6fe8', 'fa-dollar-sign', 'Currency', 'IDR', '')}${row('#3fb99a', 'fa-tag', 'Categories', '', "sView='cats';renderSettings()")}</div>
        <div class="sh-c" style="margin-top:14px">${row('#4a8af4', 'fa-arrows-rotate', 'Refresh Data', '', 'refreshData()')}${row('#e5484d', 'fa-right-from-bracket', 'Logout', '', 'doLogout()', true)}</div>`;
}
function renderCats(el) {
    const list = cSort ? cDraft : curCats()[cTab], [y, m] = cMonth.split('-').map(Number);
    const lbl = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const rb = 'style="background:var(--card)"';
    el.innerHTML = `<div class="hh" style="margin-top:6px"><button class="sh-r" ${rb} onclick="sView='main';cSort=false;renderSettings()"><i class="fa-solid fa-chevron-left"></i></button>
        ${cSort ? '<button class="mp" style="border:none" onclick="doneSort()">Done</button>' : `<button class="sh-r" ${rb} onclick="event.stopPropagation();document.getElementById('cMenu').classList.toggle('open')"><i class="fa-solid fa-ellipsis"></i></button>`}
        <div class="fm" id="cMenu"><div class="pm-i" onclick="openCat()"><span class="ck"><i class="fa-solid fa-plus"></i></span>New Category</div><div class="pm-i" onclick="startSort()"><span class="ck"><i class="fa-solid fa-arrow-up-arrow-down"></i></span>Sort Categories</div></div></div>
        <h2>Categories</h2>
        <label class="mp" style="display:inline-block">${lbl}<input type="month" value="${cMonth}" onchange="cMonth=this.value||cMonth;renderSettings()"></label>
        <div class="tabs">${CT.map(t => `<button class="${cTab === t[0] ? 'on' : ''}" onclick="cTab='${t[0]}';cSort=false;renderSettings()">${t[1]}</button>`).join('')}</div>
        ${list.length ? `<div class="rt">${list.map((k, i) => `<div class="rr" onclick="${cSort ? '' : 'openCat(' + i + ')'}"><div class="e">${emojiFor(k, cTab)}</div><div class="m"><b>${esc(k)}</b></div>${cSort ? `<button class="sb" onclick="moveCat(${i},-1)"><i class="fa-solid fa-chevron-up"></i></button><button class="sb" onclick="moveCat(${i},1)"><i class="fa-solid fa-chevron-down"></i></button>` : '<i class="fa-solid fa-chevron-right" style="color:#636366"></i>'}</div>`).join('')}</div>` : '<div class="emp">Belum ada kategori.<br>Buka menu \u22EF lalu pilih New Category.</div>'}
        <p class="hint">Kategori berlaku per bulan. Bulan yang belum diatur otomatis memakai bulan sebelumnya.</p>`;
}
document.addEventListener('click', () => { const c = document.getElementById('cMenu'); if (c) c.classList.remove('open'); });
function startSort() { cDraft = curCats()[cTab]; cSort = true; renderSettings(); }
function moveCat(i, d) { const t = i + d; if (t < 0 || t >= cDraft.length) return; [cDraft[i], cDraft[t]] = [cDraft[t], cDraft[i]]; renderSettings(); }
function doneSort() { const arr = cDraft.slice(); cSort = false; saveCats(cTab, arr, '\u2713 Urutan disimpan!'); }
async function saveCats(jn, arr, msg) {
    const [y, m] = cMonth.split('-').map(Number), v = curCats(); v[jn] = arr;
    showSaving('Menyimpan kategori...');
    try {
        const res = await apiPost({ action: 'updateSetup', Bulan: m, Tahun: y, Income: v.Income, Expenses: v.Expenses, Savings: v.Savings });
        if (res.status === 'success') {
            kategoriByPeriod[periodKey(m, y)] = { Income: v.Income.slice(), Expenses: v.Expenses.slice(), Savings: v.Savings.slice() };
            daftarKategori = aggregateKategori(kategoriByPeriod);
            closeCat(); renderSettings(); refreshViews(); renderOverview(); showToast(msg);
        } else showToast('Gagal: ' + res.message, true);
    } catch (err) { showToast('Error: ' + err.message, true); }
    finally { hideSaving(); }
}
function openCat(i) {
    cIdx = (i === undefined) ? -1 : i;
    const name = cIdx >= 0 ? curCats()[cTab][cIdx] : '', inp = document.getElementById('cName');
    document.getElementById('cTitle').textContent = cIdx >= 0 ? 'Edit Category' : 'New Category';
    inp.value = name || ''; inp.readOnly = cIdx >= 0;
    document.getElementById('cHint').textContent = cIdx >= 0 ? 'Nama tidak bisa diubah agar transaksi dan budget lama tetap terhubung. Anda bisa mengganti ikon atau menghapusnya.' : '';
    document.getElementById('cDel').style.display = cIdx >= 0 ? 'block' : 'none';
    document.getElementById('cEmoji').textContent = cIdx >= 0 ? emojiFor(name, cTab) : EMO[cTab];
    document.getElementById('cPick').innerHTML = EMOJIS.map(e => `<span onclick="document.getElementById('cEmoji').textContent='${e}';document.getElementById('cPick').classList.remove('open')">${e}</span>`).join('');
    document.getElementById('cPick').classList.remove('open');
    document.getElementById('cSheet').classList.add('open');
}
function closeCat() { document.getElementById('cSheet').classList.remove('open'); }
function submitCat() {
    const name = document.getElementById('cName').value.trim(), list = curCats()[cTab];
    if (!name) { showToast('Isi nama kategori.', true); return; }
    const em = emojiMap(); em[name] = document.getElementById('cEmoji').textContent;
    if (cIdx >= 0) {
        try { localStorage.setItem('mb_emoji', JSON.stringify(em)); } catch (e) {}
        closeCat(); renderSettings(); refreshViews(); renderOverview(); return;
    }
    if (list.some(k => k.toLowerCase() === name.toLowerCase())) { showToast('Kategori sudah ada.', true); return; }
    try { localStorage.setItem('mb_emoji', JSON.stringify(em)); } catch (e) {}
    list.push(name); saveCats(cTab, list, '\u2713 Kategori ditambahkan!');
}
function delCat() {
    const list = curCats()[cTab], name = list[cIdx];
    if (!confirm('Hapus kategori "' + name + '" dari bulan ini? Transaksi lama tetap tersimpan.')) return;
    list.splice(cIdx, 1); saveCats(cTab, list, '\u2713 Kategori dihapus!');
}
