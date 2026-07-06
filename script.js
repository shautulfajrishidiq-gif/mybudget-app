// ==============================================
// CONFIG
// ==============================================
const API_URL = "https://script.google.com/macros/s/AKfycby58S2FMAJvh2tbl3Emu5eK1-a1iWTjxLJGvbTQ0eaoq9YaG-NHqkAeoXpetIxnk7gx/exec";

// ==============================================
// STATE
// ==============================================
let dataTransaksi = [];
// Kategori per periode: { "M-YYYY": { Income:[], Expenses:[], Savings:[] } }
let kategoriByPeriod = {};
let dataBudget = [];
let chartInstances = {};

// ==============================================
// CONSTANTS
// ==============================================
const JENIS_COLOR = {
    Income:   { bg: '#15803d', grad: 'linear-gradient(135deg,#15803d,#166534)', border: '#16a34a', light: '#dcfce7', text: '#166534' },
    Expenses: { bg: '#991b1b', grad: 'linear-gradient(135deg,#991b1b,#7f1d1d)', border: '#dc2626', light: '#fee2e2', text: '#991b1b' },
    Savings:  { bg: '#1e40af', grad: 'linear-gradient(135deg,#1e40af,#1e3a8a)', border: '#2563eb', light: '#dbeafe', text: '#1e40af' }
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
// KATEGORI PER PERIODE (helper)
// ==============================================
// Ambil {Income, Expenses, Savings} untuk periode tsb. Bila kosong, fallback
// ke periode paling baru (bulan/tahun) yang ≤ periode diminta. Bila tetap
// tidak ada, fallback ke periode "0-0" (default lama), atau kosong.
function getKategoriFor(bulan, tahun, opts) {
    const wantMeta = opts && opts.withMeta;
    const target = tahun * 100 + bulan;
    const keys = Object.keys(kategoriByPeriod);

    // exact match
    const exactKey = bulan + "-" + tahun;
    if (kategoriByPeriod[exactKey] && hasAnyKategori(kategoriByPeriod[exactKey])) {
        return wantMeta ? { ...kategoriByPeriod[exactKey], _source: 'exact', _bulan: bulan, _tahun: tahun } : kategoriByPeriod[exactKey];
    }

    // fallback: latest earlier period
    let best = null; let bestScore = -1;
    keys.forEach(k => {
        const [b, y] = k.split('-').map(Number);
        if (!b || !y) return;
        const score = y * 100 + b;
        if (score <= target && score > bestScore && hasAnyKategori(kategoriByPeriod[k])) {
            best = k; bestScore = score;
        }
    });
    if (best) {
        const [bb, yy] = best.split('-').map(Number);
        return wantMeta ? { ...kategoriByPeriod[best], _source: 'fallback', _bulan: bb, _tahun: yy } : kategoriByPeriod[best];
    }

    // default row
    if (kategoriByPeriod['0-0'] && hasAnyKategori(kategoriByPeriod['0-0'])) {
        return wantMeta ? { ...kategoriByPeriod['0-0'], _source: 'default', _bulan: 0, _tahun: 0 } : kategoriByPeriod['0-0'];
    }

    // any period (latest overall)
    let anyBest = null; let anyScore = -1;
    keys.forEach(k => {
        const [b, y] = k.split('-').map(Number);
        if (!b || !y) return;
        const score = y * 100 + b;
        if (score > anyScore && hasAnyKategori(kategoriByPeriod[k])) {
            anyBest = k; anyScore = score;
        }
    });
    if (anyBest) {
        const [bb, yy] = anyBest.split('-').map(Number);
        return wantMeta ? { ...kategoriByPeriod[anyBest], _source: 'any', _bulan: bb, _tahun: yy } : kategoriByPeriod[anyBest];
    }

    const empty = { Income: [], Expenses: [], Savings: [] };
    return wantMeta ? { ...empty, _source: 'empty', _bulan: 0, _tahun: 0 } : empty;
}
function hasAnyKategori(k) {
    return (k.Income && k.Income.length) || (k.Expenses && k.Expenses.length) || (k.Savings && k.Savings.length);
}

// Union kategori sepanjang tahun (untuk Total Year di dashboard)
function getKategoriUnionYear(tahun) {
    const out = { Income: new Set(), Expenses: new Set(), Savings: new Set() };
    for (let b = 1; b <= 12; b++) {
        const k = getKategoriFor(b, tahun);
        ['Income', 'Expenses', 'Savings'].forEach(j => (k[j] || []).forEach(x => out[j].add(x)));
    }
    return { Income: [...out.Income], Expenses: [...out.Expenses], Savings: [...out.Savings] };
}

function getKategoriForFilter(jenis) {
    const tahun = parseInt(document.getElementById('filterTahun').value);
    const bulan = parseInt(document.getElementById('filterBulan').value);
    if (bulan === 0) return getKategoriUnionYear(tahun)[jenis] || [];
    return (getKategoriFor(bulan, tahun)[jenis]) || [];
}

// ==============================================
// PAGE NAVIGATION
// ==============================================
const PAGE_TITLES = { dashboard: 'Dashboard', setup: 'Setup', budget: 'Budget Planning', tracking: 'Tracking' };

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');

    document.querySelectorAll('.nav-link').forEach(a => {
        a.classList.toggle('active', a.dataset.page === page);
    });
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
        const res = await fetch(API_URL);
        const result = await res.json();
        if (result.status === 'success') {
            dataTransaksi = result.data || [];
            if (result.kategoriByPeriod) kategoriByPeriod = result.kategoriByPeriod;
            else if (result.kategori) {
                // backward compat: satu bucket saja -> pakai sebagai default
                kategoriByPeriod = { '0-0': result.kategori };
            }
            if (result.budget) dataBudget = result.budget;

            populateTahunFilter();
            ensureSetupPeriodOptions();
            renderDashboard();
            renderTabel(dataTransaksi);
            renderSisaAnggaran();
            populateKategoriDropdown(document.getElementById('inputJenis').value || 'Income');
            warnaiJenis(document.getElementById('inputJenis').value || 'Income');
        } else {
            showToast('Gagal memuat: ' + result.message, true);
        }
    } catch (err) {
        showToast('Koneksi error: ' + err.message, true);
    } finally {
        setLoading(false);
    }
}

// Refresh via floating button
async function refreshData() {
    const fab = document.getElementById('fabRefresh');
    if (fab) fab.classList.add('spinning');
    try {
        await loadData();
        showToast('✓ Data diperbarui');
    } finally {
        if (fab) fab.classList.remove('spinning');
    }
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

function getBudgetMultiplier() { return 1; }

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
    if (yEl.options.length === 0) {
        const y = now.getFullYear();
        const years = [];
        for (let i = y - 3; i <= y + 3; i++) years.push(i);
        yEl.innerHTML = years.map(v =>
            `<option value="${v}" ${v === y ? 'selected' : ''}>${v}</option>`
        ).join('');
    }
    if (!bEl.dataset.init) {
        bEl.value = String(now.getMonth() + 1);
        bEl.dataset.init = '1';
    }
}

function getSelectedSetupPeriod() {
    const bEl = document.getElementById('setupBulan');
    const yEl = document.getElementById('setupTahun');
    const now = new Date();
    const bulan = bEl && bEl.value ? parseInt(bEl.value) : (now.getMonth() + 1);
    const tahun = yEl && yEl.value ? parseInt(yEl.value) : now.getFullYear();
    return { bulan, tahun };
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
    const mult = getBudgetMultiplier();

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

    renderBreakdown('Income', filtered, mult);
    renderBreakdown('Expenses', filtered, mult);
    renderBreakdown('Savings', filtered, mult);
    renderDashboardCharts(filtered, mult);
}

function renderBreakdown(jenis, filtered, mult) {
    const c = JENIS_COLOR[jenis];
    const categories = getKategoriForFilter(jenis);
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
            <td style="padding:8px 10px; text-align:right; color:${r.sisa === 0 ? '#94a3b8' : '#16a34a'}">${r.budget > 0 ? formatRp(r.sisa) : '<span style="color:#cbd5e1">-</span>'}</td>
            ${showExcess ? `<td style="padding:8px 10px; text-align:right; color:${r.excess > 0 ? '#dc2626' : '#94a3b8'}">${r.excess > 0 ? formatRp(r.excess) : '-'}</td>` : ''}
        </tr>
    `).join('');

    const containerId = 'breakdown-' + jenis.toLowerCase();
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
        <div style="background:white; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0">
            <div style="background:${c.grad}; color:white; padding:12px 16px; display:flex; align-items:center; gap:8px">
                <i class="fa-solid ${JENIS_ICON[jenis]}"></i>
                <span style="font-weight:600; font-size:14px">${jenis}</span>
            </div>
            <div style="overflow-x:auto">
                <table>
                    <thead>
                        <tr style="background:#f8fafc; color:#64748b; text-transform:uppercase; letter-spacing:0.05em">
                            <th style="padding:9px 10px; text-align:left; border-bottom:1px solid #e2e8f0">Kategori</th>
                            <th style="padding:9px 10px; text-align:right; border-bottom:1px solid #e2e8f0">Aktual</th>
                            <th style="padding:9px 10px; text-align:right; border-bottom:1px solid #e2e8f0">Budget</th>
                            <th style="padding:9px 10px; text-align:right; border-bottom:1px solid #e2e8f0">%</th>
                            <th style="padding:9px 10px; text-align:left; border-bottom:1px solid #e2e8f0">Progress</th>
                            <th style="padding:9px 10px; text-align:right; border-bottom:1px solid #e2e8f0">Sisa</th>
                            ${showExcess ? '<th style="padding:9px 10px; text-align:right; border-bottom:1px solid #e2e8f0">Over</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>${rowsHTML || `<tr><td colspan="${showExcess ? 7 : 6}" style="text-align:center; padding:16px; color:#94a3b8; font-size:12px">Tidak ada data.</td></tr>`}</tbody>
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

function renderDashboardCharts(filtered, mult) {
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
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: data.length <= 5 ? colors.slice(0, data.length) : [...colors.slice(0, 5), '#cbd5e1'], borderWidth: 0 }]
        },
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
            data: {
                labels: ['Income', 'Expenses', 'Savings'],
                datasets: [{
                    data: [totals.Income, totals.Expenses, totals.Savings],
                    backgroundColor: ['#22c55e', '#ef4444', '#3b82f6'],
                    borderRadius: 6, borderSkipped: false
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => formatRp(c.raw) }, padding: 8, titleFont: { size: 11 }, bodyFont: { size: 10 } } },
                scales: {
                    y: { ticks: { callback: v => 'Rp' + (v / 1e6).toFixed(0) + 'jt', font: { size: 9 } }, grid: { color: '#f1f5f9' }, beginAtZero: true },
                    x: { ticks: { font: { size: 10 } } }
                }
            }
        });
    } else {
        const monthly = { Income: Array(12).fill(0), Expenses: Array(12).fill(0), Savings: Array(12).fill(0) };
        dataTransaksi
            .filter(i => new Date(i.Tanggal).getFullYear() === tahun)
            .forEach(i => {
                const m = new Date(i.Tanggal).getMonth();
                if (monthly[i.Jenis]) monthly[i.Jenis][m] += Number(i.Nominal);
            });
        chartInstances['chartMonthly'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: MONTHS_SHORT,
                datasets: [
                    { label: 'Income',   data: monthly.Income,   backgroundColor: '#4ade80', borderRadius: 3, borderSkipped: false },
                    { label: 'Expenses', data: monthly.Expenses, backgroundColor: '#f87171', borderRadius: 3, borderSkipped: false },
                    { label: 'Savings',  data: monthly.Savings,  backgroundColor: '#60a5fa', borderRadius: 3, borderSkipped: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 9 }, boxWidth: 8, padding: 6, usePointStyle: true } },
                    tooltip: { callbacks: { label: c => c.dataset.label + ': ' + formatRp(c.raw) }, padding: 8, titleFont: { size: 11 }, bodyFont: { size: 10 } }
                },
                scales: {
                    y: { ticks: { callback: v => 'Rp' + (v / 1e6).toFixed(0) + 'jt', font: { size: 9 } }, grid: { color: '#f1f5f9' }, beginAtZero: true, stacked: false },
                    x: { ticks: { font: { size: 9 } }, stacked: false }
                }
            }
        });
    }
}

// ==============================================
// SETUP (per Bulan-Tahun)
// ==============================================
// Buffer edit untuk periode yang sedang aktif di halaman Setup.
let setupBuffer = null;      // {Income:[], Expenses:[], Savings:[]}
let setupBufferKey = null;   // "M-YYYY"

function loadSetupBuffer() {
    ensureSetupPeriodOptions();
    const { bulan, tahun } = getSelectedSetupPeriod();
    const key = bulan + '-' + tahun;
    if (setupBufferKey === key && setupBuffer) return { bulan, tahun, source: 'buffer' };

    const meta = getKategoriFor(bulan, tahun, { withMeta: true });
    setupBuffer = {
        Income: [...(meta.Income || [])],
        Expenses: [...(meta.Expenses || [])],
        Savings: [...(meta.Savings || [])]
    };
    setupBufferKey = key;
    return { bulan, tahun, source: meta._source, srcBulan: meta._bulan, srcTahun: meta._tahun };
}

function renderSetup() {
    const info = loadSetupBuffer();

    const infoEl = document.getElementById('setupSourceInfo');
    if (infoEl) {
        if (info.source === 'exact') {
            infoEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#16a34a"></i> Periode tersimpan`;
        } else if (info.source === 'fallback' || info.source === 'any') {
            infoEl.innerHTML = `<i class="fa-solid fa-clone" style="color:#d97706"></i> Menggunakan template dari ${MONTHS_SHORT[info.srcBulan - 1]} ${info.srcTahun} (belum disimpan)`;
        } else if (info.source === 'default') {
            infoEl.innerHTML = `<i class="fa-solid fa-clone" style="color:#d97706"></i> Menggunakan kategori default`;
        } else {
            infoEl.innerHTML = `<i class="fa-solid fa-circle-info" style="color:#64748b"></i> Belum ada kategori`;
        }
    }

    ['Income', 'Expenses', 'Savings'].forEach(j => {
        const el = document.getElementById('setup-' + j.toLowerCase());
        el.innerHTML = (setupBuffer[j] || []).map((kat, idx) => `
            <div style="display:flex; align-items:center; gap:6px">
                <input type="text" value="${escapeAttr(kat)}" data-jenis="${j}" data-idx="${idx}"
                    oninput="onSetupInput(this)"
                    style="flex:1; border:1px solid #e2e8f0; padding:6px 10px; border-radius:6px; font-size:13px; outline:none">
                <button onclick="removeKategori('${j}', ${idx})" style="background:#fef2f2; color:#dc2626; border:none; border-radius:6px; width:26px; height:26px; cursor:pointer; font-size:11px">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');
    });
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

function onSetupInput(inp) {
    const j = inp.dataset.jenis;
    const idx = parseInt(inp.dataset.idx);
    if (!setupBuffer[j]) setupBuffer[j] = [];
    setupBuffer[j][idx] = inp.value;
}

function addKategori(j) {
    if (!setupBuffer) loadSetupBuffer();
    (setupBuffer[j] = setupBuffer[j] || []).push('');
    renderSetup();
}
function removeKategori(j, idx) {
    if (!setupBuffer) loadSetupBuffer();
    setupBuffer[j].splice(idx, 1);
    renderSetup();
}

function collectSetup() {
    const out = { Income: [], Expenses: [], Savings: [] };
    ['Income', 'Expenses', 'Savings'].forEach(j => {
        (setupBuffer && setupBuffer[j] ? setupBuffer[j] : []).forEach(v => {
            const s = String(v || '').trim();
            if (s) out[j].push(s);
        });
    });
    return out;
}

async function saveSetup() {
    const { bulan, tahun } = getSelectedSetupPeriod();
    const values = collectSetup();
    try {
        const r = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'updateSetup', Bulan: bulan, Tahun: tahun, ...values })
        });
        const res = await r.json();
        if (res.status === 'success') {
            // Update state lokal
            const key = bulan + '-' + tahun;
            kategoriByPeriod[key] = values;
            setupBuffer = { Income: [...values.Income], Expenses: [...values.Expenses], Savings: [...values.Savings] };
            setupBufferKey = key;
            showToast(`✓ Kategori ${MONTHS_SHORT[bulan - 1]} ${tahun} tersimpan!`);
            renderSetup();
            populateKategoriDropdown(document.getElementById('inputJenis').value);
            renderBudgetPlanning();
            renderSisaAnggaran();
        } else {
            showToast('Gagal: ' + res.message, true);
        }
    } catch (err) { showToast('Error: ' + err.message, true); }
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

    const info = document.getElementById('budgetPeriodInfo');
    if (info) info.textContent = `Periode: ${MONTHS_SHORT[bulan - 1]} ${tahun}`;

    const kat = getKategoriFor(bulan, tahun);

    // === INCOME auto-fill dari aktual tracking bulan tsb (read-only) ===
    const incomeActuals = getActualByCategory('Income', bulan, tahun);
    const incomeCats = [...new Set([...(kat.Income || []), ...Object.keys(incomeActuals)])];
    const totalIncome = incomeCats.reduce((s, k) => s + (incomeActuals[k] || 0), 0);

    const cInc = JENIS_COLOR.Income;
    document.getElementById('budget-income').innerHTML = `
        <div style="background:white; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0">
            <div style="background:${cInc.bg}; color:white; padding:12px 14px; display:flex; align-items:center; justify-content:space-between">
                <span style="font-weight:600; font-size:14px; display:flex; align-items:center; gap:8px">
                    <i class="fa-solid fa-arrow-trend-up"></i> Income (auto)
                </span>
                <span style="font-size:12px; opacity:0.85">${MONTHS_SHORT[bulan - 1]} ${tahun}</span>
            </div>
            <div style="padding:12px 14px">
                ${incomeCats.length === 0
                    ? '<p style="color:#94a3b8; font-size:13px; margin:0">Belum ada data income di bulan ini.</p>'
                    : incomeCats.map(k => `
                        <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #f1f5f9; font-size:13px">
                            <span style="color:#374151">${k}</span>
                            <span style="font-weight:600; color:${cInc.text}">${formatRp(incomeActuals[k] || 0)}</span>
                        </div>`).join('')
                }
                <div style="display:flex; justify-content:space-between; padding-top:10px; margin-top:6px; border-top:2px solid #e2e8f0; font-size:13px; font-weight:700">
                    <span>Total Income</span>
                    <span id="total-income" style="color:${cInc.text}">${formatRp(totalIncome)}</span>
                </div>
            </div>
        </div>
    `;

    // === EXPENSES & SAVINGS: input manual ===
    ['Expenses', 'Savings'].forEach(jenis => {
        const cats = kat[jenis] || [];
        const c = JENIS_COLOR[jenis];
        const el = document.getElementById('budget-' + jenis.toLowerCase());
        el.innerHTML = `
            <div style="background:white; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0">
                <div style="background:${c.bg}; color:white; padding:12px 14px; display:flex; align-items:center; justify-content:space-between">
                    <span style="font-weight:600; font-size:14px; display:flex; align-items:center; gap:8px">
                        <i class="fa-solid ${JENIS_ICON[jenis]}"></i> ${jenis}
                    </span>
                    <span id="total-${jenis.toLowerCase()}" style="font-size:12px; font-weight:600">${formatRp(0)}</span>
                </div>
                <div style="padding:12px 14px; display:grid; gap:8px">
                    ${cats.map(k => {
                        const val = getBudgetOf(jenis, k, bulan, tahun);
                        return `
                        <div>
                            <label style="font-size:11px; font-weight:600; color:#64748b; display:block; margin-bottom:3px">${k}</label>
                            <input type="text" inputmode="numeric"
                                data-jenis="${jenis}" data-kategori="${escapeAttr(k)}"
                                data-raw="${val}"
                                value="${val ? formatNum(val) : ''}"
                                placeholder="0"
                                oninput="onBudgetInput(this)"
                                onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#e2e8f0'"
                                style="width:100%; border:1px solid #e2e8f0; padding:8px 10px; border-radius:8px; font-size:13px; box-sizing:border-box; outline:none; transition:border 0.15s">
                        </div>`;
                    }).join('')}
                    ${cats.length === 0 ? '<p style="color:#94a3b8; font-size:13px; grid-column:1/-1">Belum ada kategori. Tambahkan di halaman Setup.</p>' : ''}
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
    const status = sisa === 0
        ? '✓ Income teralokasi penuh'
        : (sisa < 0 ? `⚠ Over-budget ${formatRp(Math.abs(sisa))}` : `Belum dialokasikan ${formatRp(sisa)}`);
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
        currentPeriod.push({
            Jenis: inp.dataset.jenis, Kategori: inp.dataset.kategori,
            Bulan: bulan, Tahun: tahun, Budget: raw
        });
    });

    const others = dataBudget.filter(b => !(Number(b.Bulan) === bulan && Number(b.Tahun) === tahun));
    const kept = currentPeriod.filter(b => Number(b.Budget) > 0);
    const budgets = [...others, ...kept];
    dataBudget = budgets;

    try {
        const r = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'updateBudget', budgets })
        });
        const res = await r.json();
        if (res.status === 'success') {
            showToast('✓ Budget tersimpan!');
            renderSisaAnggaran();
        } else {
            showToast('Gagal: ' + res.message, true);
        }
    } catch (err) { showToast('Error: ' + err.message, true); }
}

// ==============================================
// SISA ANGGARAN (TRACKING PAGE) — pakai bulan dari tanggal input
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
    const cats = getKategoriFor(bulan, tahun).Expenses || [];

    const titleEl = document.getElementById('sisaAnggaranTitle');
    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-gauge" style="color:#991b1b; font-size:12px"></i> Sisa Anggaran Expenses (${MONTHS_FULL[bulan - 1]} ${tahun})`;

    const actuals = {};
    dataTransaksi.filter(i => {
        if (i.Jenis !== 'Expenses' || !i.Tanggal) return false;
        const d = new Date(i.Tanggal);
        return d.getFullYear() === tahun && (d.getMonth() + 1) === bulan;
    }).forEach(i => { actuals[i.Kategori] = (actuals[i.Kategori] || 0) + Number(i.Nominal); });

    if (!cats.length) {
        container.innerHTML = '<p style="color:#94a3b8; font-size:13px">Belum ada kategori Expenses untuk periode ini. Atur di halaman Setup.</p>';
        return;
    }

    container.innerHTML = cats.map(kat => {
        const monthBudget = getBudgetOf('Expenses', kat, bulan, tahun);
        const spent = actuals[kat] || 0;
        if (monthBudget === 0) return `
            <div style="display:flex; justify-content:space-between; font-size:12px; color:#64748b">
                <span>${kat}</span><span style="color:#cbd5e1">No budget</span>
            </div>`;
        const sisa = monthBudget - spent;
        const pct = Math.min(Math.round(spent / monthBudget * 100), 100);
        const over = sisa < 0;
        return `
        <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px">
                <span style="font-size:12px; font-weight:600; color:#374151">${kat}</span>
                <span style="font-size:11px; font-weight:700; color:${over ? '#dc2626' : '#16a34a'}">
                    ${over ? '⚠ -' + formatRp(Math.abs(sisa)) : formatRp(sisa)}
                </span>
            </div>
            <div class="pbar">
                <div class="pbar-fill" style="width:${pct}%; background:${over ? '#dc2626' : '#22c55e'}"></div>
            </div>
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
        const op = isInc || isSav ? '+' : '−';
        const badge = isInc ? 'badge-income' : isSav ? 'badge-savings' : 'badge-expenses';
        return `
        <tr style="border-bottom:1px solid #f1f5f9; font-size:12px; transition:background 0.1s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <td style="padding:10px 12px; color:#64748b; white-space:nowrap">${item.Tanggal || '-'}</td>
            <td style="padding:10px 12px">
                <span class="${badge}" style="padding:3px 8px; border-radius:20px; font-size:11px; font-weight:600">${item.Jenis || '-'}</span>
            </td>
            <td style="padding:10px 12px; color:#0f172a; font-weight:500">${item.Kategori || '-'}</td>
            <td style="padding:10px 12px; text-align:right; font-weight:700; color:${color}; white-space:nowrap">${op} ${formatRp(item.Nominal)}</td>
            <td style="padding:10px 12px; color:#64748b; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${item.Deskripsi || '-'}</td>
            <td style="padding:10px 12px; color:#94a3b8; white-space:nowrap; font-size:11px">${item.Timestamp || '-'}</td>
            <td style="padding:10px 12px; text-align:center; white-space:nowrap">
                <button onclick="siapkanEdit('${item.ID}')" style="background:#eff6ff; color:#2563eb; border:none; border-radius:6px; width:28px; height:28px; cursor:pointer; font-size:12px; margin-right:4px" title="Edit">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="hapusTransaksi('${item.ID}')" style="background:#fef2f2; color:#dc2626; border:none; border-radius:6px; width:28px; height:28px; cursor:pointer; font-size:12px" title="Hapus">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ==============================================
// FORM INPUT TRANSAKSI
// ==============================================
function populateKategoriDropdown(jenis, selected) {
    const { bulan, tahun } = getTrackingPeriod();
    const cats = (getKategoriFor(bulan, tahun)[jenis]) || [];
    const sel = document.getElementById('inputKategori');
    sel.innerHTML = '<option value="">-- Pilih Kategori --</option>' +
        cats.map(k => `<option value="${escapeAttr(k)}" ${k === selected ? 'selected' : ''}>${k}</option>`).join('');
}

function warnaiJenis(jenis) {
    const sel = document.getElementById('inputJenis');
    const c = JENIS_COLOR[jenis];
    sel.style.background = c.light;
    sel.style.color = c.text;
    sel.style.borderColor = c.border;
}

document.getElementById('inputJenis').addEventListener('change', function () {
    populateKategoriDropdown(this.value);
    warnaiJenis(this.value);
});

document.getElementById('inputTanggal').addEventListener('change', function () {
    // Bulan berubah -> kategori bisa berbeda -> refresh dropdown & sisa anggaran.
    populateKategoriDropdown(document.getElementById('inputJenis').value);
    renderSisaAnggaran();
});

const inputNominal = document.getElementById('inputNominal');
inputNominal.addEventListener('input', function () {
    const raw = this.value.replace(/\D/g, '');
    this.dataset.raw = raw;
    this.value = raw ? formatNum(raw) : '';
});
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
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    btn.disabled = true;

    const id = document.getElementById('inputId').value;
    const payload = {
        action: id ? 'update' : 'insert',
        ID: id,
        Tanggal: document.getElementById('inputTanggal').value,
        Jenis: document.getElementById('inputJenis').value,
        Kategori: document.getElementById('inputKategori').value,
        Nominal: getNominalRaw(),
        Deskripsi: document.getElementById('inputDeskripsi').value
    };

    if (!payload.Tanggal || !payload.Jenis || !payload.Kategori || !payload.Nominal) {
        showToast('Lengkapi Tanggal, Jenis, Kategori, dan Nominal.', true);
        btn.innerHTML = orig; btn.disabled = false;
        return;
    }

    try {
        const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
        const res = await r.json();
        if (res.status === 'success') {
            resetForm();
            await loadData();
            showToast(id ? '✓ Transaksi diperbarui!' : '✓ Transaksi disimpan!');
        } else { showToast('Gagal: ' + res.message, true); }
    } catch (err) { showToast('Error: ' + err.message, true); }
    finally { btn.innerHTML = orig; btn.disabled = false; }
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
    // Default tanggal hari ini
    const d = new Date();
    document.getElementById('inputTanggal').value =
        d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
    try {
        const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'delete', ID: id }) });
        const res = await r.json();
        if (res.status === 'success') { await loadData(); showToast('✓ Transaksi dihapus!'); }
        else showToast('Gagal hapus: ' + res.message, true);
    } catch (err) { showToast('Error: ' + err.message, true); }
}

// Ketika periode setup berubah, buffer harus di-reset supaya reload dari state.
document.addEventListener('change', function (e) {
    if (e.target && (e.target.id === 'setupBulan' || e.target.id === 'setupTahun')) {
        setupBuffer = null;
        setupBufferKey = null;
    }
});

// ==============================================
// UTILS
// ==============================================
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
// INIT
// ==============================================
warnaiJenis('Income');
(function initTanggal(){
    const el = document.getElementById('inputTanggal');
    if (el && !el.value) {
        const d = new Date();
        el.value = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }
})();
loadData();
