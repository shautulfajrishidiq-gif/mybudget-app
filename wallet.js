// ==============================================
// DOMPET (WALLET)
// Dimuat SEBELUM script.js. Saldo dompet dihitung di sini dari: saldo awal + transaksi sesudah SaldoTs.
// Fitur ini opsional: sebelum ada dompet, form transaksi & budget tampil seperti biasa.
// ==============================================
var WL = { list: [], cat: {}, catRaw: [], trf: [] };
var WS = null; // state sheet dompet (tambah/ubah, transfer, sesuaikan saldo)

var WL_TYPES = {
    bank:    { t: 'Bank',                  ic: 'fa-building-columns', c: '#2563eb' },
    ewallet: { t: 'E-wallet',              ic: 'fa-mobile-screen',    c: '#0ea5a4' },
    cash:    { t: 'Cash',                  ic: 'fa-wallet',           c: '#e8964a' },
    invest:  { t: 'Savings & investment',  ic: 'fa-chart-line',       c: '#7b6fe8' }
};
// [kunci file logo, nama, warna lingkaran]
var WL_BANKS = [['bca','BCA','#1d4f9e'],['mandiri','Mandiri','#17306b'],['bni','BNI','#0e7c7b'],['bri','BRI','#1a56c4'],['bsi','BSI','#0b9b8a'],['btn','BTN','#1060e8'],['cimb','CIMB Niaga','#7a0e12'],['danamon','Danamon','#e07b1a'],['permata','Permata','#1c2b4a'],['jago','Jago','#e0a020'],['seabank','SeaBank','#e8591a'],['blu','blu','#2cc5c5'],['bnc','Neo Commerce','#333333'],['jenius','Jenius','#0a8fc0'],['ocbc','OCBC NISP','#c8202f'],['maybank','Maybank','#c99a00']];
var WL_EWAL  = [['gopay','GoPay','#0d9aa8'],['dana','DANA','#118eea'],['ovo','OVO','#4c2a86'],['shopeepay','ShopeePay','#ee4d2d'],['linkaja','LinkAja','#d62027'],['isaku','i.saku','#1f5fa8']];
// [kunci, nama, warna, ikon FontAwesome]
var WL_INVS  = [['deposito','Deposito','#8b5cf6','fa-building-columns'],['reksa','Reksa dana','#7b6fe8','fa-chart-line'],['saham','Saham','#2f9e6e','fa-chart-line'],['emas','Emas','#d9a21b','fa-coins'],['kripto','Kripto','#f7931a','fa-bitcoin-sign']];

function wlOn() { return WL.list.length > 0; }
function wlGet(id) { return WL.list.find(w => w.ID === id); }
function wlLogoOk(k) { return !!k && /^[a-z0-9\-]+$/.test(k); }

function wlLoad(r) {
    if (!r) return;
    if (Array.isArray(r.dompet)) WL.list = r.dompet.slice().sort((a, b) => (a.Urut || 0) - (b.Urut || 0));
    if (Array.isArray(r.dompetKategori)) {
        WL.catRaw = r.dompetKategori.slice(); WL.cat = {};
        WL.catRaw.forEach(x => { WL.cat[x.Jenis + '|' + x.Kategori] = x.Dompet; });
    }
    if (Array.isArray(r.transfer)) WL.trf = r.transfer.slice();
}
function wlCatRaw() { return Object.keys(WL.cat).map(k => { const i = k.indexOf('|'); return { Jenis: k.slice(0, i), Kategori: k.slice(i + 1), Dompet: WL.cat[k] }; }); }
function wlRenameCat(jn, old, nw) {
    const a = jn + '|' + old, b = jn + '|' + nw;
    if (WL.cat[a] !== undefined) { if (WL.cat[b] === undefined) WL.cat[b] = WL.cat[a]; delete WL.cat[a]; }
    WL.trf.filter(t => String(t.Catatan || '').indexOf('[B]' + jn + '|' + old + '|') === 0).forEach(t => {
        const ym = t.Catatan.split('|')[2]; wlTrfRemove(t); wlTrfAdd(t.Dari, t.Ke, t.Nominal, wlBTag(jn, nw, ym), t.Tanggal);
    });
}

// ---------- saldo ----------
function wlAfter(t, ts) { return !ts || !t.Timestamp || String(t.Timestamp) > ts; }
function wlBal(w, exceptId, exceptTrf) {
    let b = Number(w.Saldo) || 0; const ts = w.SaldoTs || '';
    dataTransaksi.forEach(t => {
        if (!wlAfter(t, ts) || (exceptId && String(t.ID) === String(exceptId))) return;
        const n = Number(t.Nominal) || 0;
        if (t.Jenis === 'Income' && t.Dompet === w.ID) b += n;
        else if (t.Jenis === 'Expenses' && t.Dompet === w.ID) b -= n;
        else if (t.Jenis === 'Savings') { if (t.Dompet === w.ID) b -= n; if (t.KeDompet === w.ID) b += n; }
    });
    WL.trf.forEach(t => {
        if (!wlAfter(t, ts) || (exceptTrf && t.ID === exceptTrf)) return;
        const n = Number(t.Nominal) || 0;
        if (t.Dari === w.ID) b -= n;
        if (t.Ke === w.ID) b += n;
    });
    return b;
}
// transfer otomatis dari budget: Catatan = [B]Jenis|Kategori|YYYY-MM
function wlBTag(jn, kat, ym) { return '[B]' + jn + '|' + kat + '|' + ym; }
function wlBTrf(jn, kat, ym) { const t = wlBTag(jn, kat, ym); return WL.trf.find(x => x.Catatan === t); }
function wlTrfNote(t) { const c = String(t.Catatan || ''); return c.indexOf('[B]') === 0 ? 'Budget ' + c.slice(3).split('|')[1] : (c || 'Transfer'); }
function wlTs() { const p2 = n => String(n).padStart(2, '0'), n = new Date(); return n.getFullYear() + '-' + p2(n.getMonth() + 1) + '-' + p2(n.getDate()) + ' ' + p2(n.getHours()) + ':' + p2(n.getMinutes()) + ':' + p2(n.getSeconds()); }
function wlTrfAdd(dari, ke, nom, catatan, tgl) {
    const row = { ID: newId().replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 40), Tanggal: tgl || wlTs().slice(0, 10), Dari: dari, Ke: ke, Nominal: nom, Catatan: catatan, Timestamp: wlTs() };
    WL.trf.push(row);
    syncEnqueue({ run: retry => apiPost({ action: 'addTransfer', ID: row.ID, Tanggal: row.Tanggal, Dari: row.Dari, Ke: row.Ke, Nominal: row.Nominal, Catatan: row.Catatan, Retry: retry }) });
}
function wlTrfRemove(t) {
    WL.trf = WL.trf.filter(x => x.ID !== t.ID);
    syncEnqueue({ run: () => apiPost({ action: 'deleteTransfer', ID: t.ID }) });
}
function wlSrcLast() { try { return localStorage.getItem('mb_wl_src') || ''; } catch (e) { return ''; } }
function wlSrcDefault(dest) {
    const l = wlSrcLast(); if (l && l !== dest && wlGet(l)) return l;
    const inc = dataTransaksi.filter(t => t.Jenis === 'Income' && t.Dompet && wlGet(t.Dompet) && t.Dompet !== dest).sort((a, b) => String(b.Timestamp).localeCompare(String(a.Timestamp)))[0];
    return inc ? inc.Dompet : '';
}
function wlMY() { const n = new Date(); return [n.getMonth() + 1, n.getFullYear()]; }
function wlBudgetsOf(w) {
    const [m, y] = wlMY();
    return dataBudget.filter(b => (b.Jenis === 'Expenses' || b.Jenis === 'Savings') && Number(b.Bulan) === m && Number(b.Tahun) === y && Number(b.Budget) > 0 && WL.cat[b.Jenis + '|' + b.Kategori] === w.ID);
}
function wlAlloc(w, skipKat) {
    const [m, y] = wlMY(), act = getActualByCategory('Expenses', m, y) || {};
    return wlBudgetsOf(w).filter(b => b.Jenis === 'Expenses' && b.Kategori !== skipKat).reduce((s, b) => s + Math.max(0, Number(b.Budget) - Number(act[b.Kategori] || 0)), 0);
}
function wlSub(w) {
    if (w.Tipe === 'invest') return { t: w.Sub || ('Modal ' + idr(w.Modal || 0)), warn: false };
    const n = wlBudgetsOf(w).length, a = wlAlloc(w), b = wlBal(w);
    if (a > b) return { t: 'Budget kurang ' + idr(a - b), warn: true };
    return { t: n ? n + ' budget · bebas ' + idr(b - a) : 'Belum ada budget', warn: false };
}

// ---------- tampilan kecil ----------
function wlAv(w, size, sq) {
    size = size || 44;
    const meta = WL_TYPES[w.Tipe] || WL_TYPES.bank, letter = esc((w.Nama || '?').charAt(0).toUpperCase());
    const rad = sq ? '12px' : '50%';
    let inner;
    if (wlLogoOk(w.Logo)) {
        const q = Math.round(size * .68);
        inner = `<span class="lg" style="width:${q}px;height:${q}px"><img alt="" src="logos/${w.Logo}.svg" onerror="this.parentNode.outerHTML='<b>${letter}</b>'"></span>`;
    } else if (w.Ikon && /^fa-[a-z\-]+$/.test(w.Ikon)) {
        inner = `<i class="fa-solid ${w.Ikon}" style="font-size:${Math.round(size * .42)}px"></i>`;
    } else if (meta && !w.Logo) {
        inner = `<i class="fa-solid ${meta.ic}" style="font-size:${Math.round(size * .42)}px"></i>`;
    } else inner = `<b>${letter}</b>`;
    return `<span class="wl-av" style="width:${size}px;height:${size}px;border-radius:${rad};background:${/^#[0-9a-fA-F]{6}$/.test(w.Warna) ? w.Warna : meta.c}">${inner}</span>`;
}
function wlTag(i) { // teks kecil di bawah nama transaksi
    const w = i.Dompet ? wlGet(i.Dompet) : null; if (!w) return '';
    const k = i.Jenis === 'Savings' && i.KeDompet ? wlGet(i.KeDompet) : null;
    return ' · ' + esc(w.Nama) + (k ? ' → ' + esc(k.Nama) : '');
}
function wlBudTag(jn, kat) { // chip dompet di kartu budget / top category
    const w = wlGet(WL.cat[jn + '|' + kat]); if (!w) return '';
    return `<div class="wl-tag">${wlAv(w, 18)}<span>${jn === 'Savings' ? 'disimpan di ' : 'dari '}${esc(w.Nama)}</span></div>`;
}

// ---------- Overview ----------
function wlRenderOverview() {
    const hd = document.getElementById('ovWalH'), el = document.getElementById('ovWal'); if (!el) return;
    if (!wlOn()) {
        hd.style.display = 'none';
        el.innerHTML = `<div class="wl-cta" onclick="openWallets()"><span class="wl-ic"><i class="fa-solid fa-wallet"></i></span><div><b>Atur dompet</b><em>Catat uangmu ada di BCA, GoPay, tunai, atau investasi.</em></div><i class="fa-solid fa-chevron-right"></i></div>`;
        return;
    }
    hd.style.display = '';
    const tot = WL.list.reduce((s, w) => s + wlBal(w), 0);
    document.getElementById('ovWalTot').textContent = idr(tot);
    el.innerHTML = '<div class="wl-hs">' + WL.list.map(w => {
        const s = wlSub(w);
        return `<button class="wl-card" onclick="openWallets('${w.ID}')">${wlAv(w, 42)}<div><b>${esc(w.Nama)}</b><strong>${idr(wlBal(w))}</strong><em class="${s.warn ? 'warn' : ''}">${esc(s.t)}</em></div></button>`;
    }).join('') + '</div>';
}

// ---------- layar Wallets (di dalam Settings) ----------
function openWallets(id) {
    showPage('setup'); sView = id ? 'wdetail' : 'wallets'; WS = null; window.wlDetailId = id || '';
    renderSettings();
}
function wlRenderList(el) {
    const rb = 'style="background:var(--card)"';
    let h = `<div class="hh" style="margin-top:6px"><button class="sh-r" ${rb} onclick="sView='main';renderSettings()" aria-label="Kembali"><i class="fa-solid fa-chevron-left"></i></button><button class="sh-r" ${rb} onclick="wlOpenWal()" aria-label="Tambah dompet"><i class="fa-solid fa-plus"></i></button></div><h2>Wallets</h2>`;
    if (!wlOn()) {
        el.innerHTML = h + `<div class="wl-empty"><span class="wl-ic big"><i class="fa-solid fa-wallet"></i></span><b>Belum ada dompet</b><p>Dompet menunjukkan di mana uangmu disimpan: bank, e-wallet, tunai, atau investasi. Saldo berkurang otomatis saat ada pengeluaran.</p><button class="wl-btn" onclick="wlOpenWal()">Tambah dompet pertama</button></div><p class="hint">Transaksi lama tidak diubah. Hanya transaksi baru yang memilih dompet.</p>`;
        return;
    }
    const tot = WL.list.reduce((s, w) => s + wlBal(w), 0);
    h += `<div class="wl-tot"><span>Total <b>${idr(tot)}</b></span><button class="wl-pill" onclick="wlOpenTrf()"><i class="fa-solid fa-right-left"></i> Transfer</button></div>`;
    ['bank', 'ewallet', 'cash', 'invest'].forEach(ty => {
        const l = WL.list.filter(w => w.Tipe === ty); if (!l.length) return;
        h += `<div class="wl-g"><span>${WL_TYPES[ty].t}</span><b>${idr(l.reduce((s, w) => s + wlBal(w), 0))}</b></div><div class="rt">` + l.map(w => {
            const s = wlSub(w);
            return `<div class="rr" onclick="openWallets('${w.ID}')">${wlAv(w, 52)}<div class="m"><b>${esc(w.Nama)}</b><em class="${s.warn ? 'warn' : ''}">${esc(s.t)}</em></div><div class="a"><b>${idr(wlBal(w))}</b></div></div>`;
        }).join('') + '</div>';
    });
    el.innerHTML = h;
}
function wlRenderDetail(el) {
    const w = wlGet(window.wlDetailId); if (!w) { sView = 'wallets'; return wlRenderList(el); }
    const rb = 'style="background:var(--card)"', inv = w.Tipe === 'invest', bal = wlBal(w), a = wlAlloc(w);
    let h = `<div class="hh" style="margin-top:6px"><button class="sh-r" ${rb} onclick="sView='wallets';renderSettings()" aria-label="Kembali"><i class="fa-solid fa-chevron-left"></i></button><button class="sh-r" ${rb} onclick="wlOpenWal('${w.ID}')" aria-label="Ubah dompet"><i class="fa-solid fa-pen"></i></button></div>`;
    h += `<div class="wl-hero" style="background:linear-gradient(140deg,${/^#[0-9a-fA-F]{6}$/.test(w.Warna) ? w.Warna : '#2563eb'},#0c1226)"><div class="top">${wlAv(w, 46)}<div><em>${inv ? 'Nilai sekarang' : 'Saldo sekarang'}</em><span>${esc(w.Nama)}</span></div></div><strong>${idr(bal)}</strong>`;
    if (inv) { const g = bal - (Number(w.Modal) || 0); h += `<div class="two"><div><em>Modal</em><b>${idr(w.Modal || 0)}</b></div><div><em>Untung / rugi</em><b>${g >= 0 ? '+' : '-'}${idr(Math.abs(g))}</b></div></div>`; }
    else h += `<div class="two"><div><em>Dialokasikan ke budget</em><b>${idr(Math.min(a, Math.max(0, bal)))}</b></div><div><em>Bebas dipakai</em><b>${idr(bal - a)}</b></div></div>`;
    h += `</div><div class="wl-act"><button class="wl-pill" onclick="wlOpenBal('${w.ID}')">${inv ? 'Update nilai' : 'Sesuaikan saldo'}</button><button class="wl-pill" onclick="wlOpenTrf('${w.ID}')"><i class="fa-solid fa-right-left"></i> Pindahkan saldo</button></div>`;
    const bl = wlBudgetsOf(w);
    h += `<div class="ov-h" style="font-size:18px;margin-top:18px">Budget di dompet ini</div>`;
    if (bl.length) {
        const [m, y] = wlMY(), actE = getActualByCategory('Expenses', m, y) || {}, actS = getActualByCategory('Savings', m, y) || {};
        h += '<div class="rt">' + bl.map(b => { const ac = Number((b.Jenis === 'Savings' ? actS : actE)[b.Kategori] || 0), p = Math.min(100, ac / Number(b.Budget) * 100);
            return `<div class="rr"><div class="e">${emojiFor(b.Kategori, b.Jenis)}</div><div class="m"><b>${esc(b.Kategori)}</b><em>${idr(ac)} / ${idr(b.Budget)}</em><div class="bar" style="margin-top:7px"><i style="width:${p}%;background:#4a8af4"></i></div></div></div>`; }).join('') + '</div>';
    } else h += `<div class="rt emp">Belum ada budget di dompet ini.<br>Pilih dompet saat mengatur budget.</div>`;
    h += `<div class="ov-h" style="font-size:18px;margin-top:18px">Riwayat</div>`;
    const items = [];
    dataTransaksi.forEach(t => { if (t.Dompet === w.ID || t.KeDompet === w.ID) items.push({ k: 'tx', t, d: t.Tanggal, ts: t.Timestamp }); });
    WL.trf.forEach(t => { if (t.Dari === w.ID || t.Ke === w.ID) items.push({ k: 'trf', t, d: t.Tanggal, ts: t.Timestamp }); });
    items.sort((x, y2) => parseTanggal(y2.d) - parseTanggal(x.d) || String(y2.ts).localeCompare(String(x.ts)));
    h += items.length ? '<div class="rt">' + items.slice(0, 40).map(x => {
        if (x.k === 'tx') return rowHtml(x.t);
        const t = x.t, out = t.Dari === w.ID, other = wlGet(out ? t.Ke : t.Dari), dt = parseTanggal(t.Tanggal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `<div class="rr" onclick="wlDelTrf('${t.ID}')"><div class="e">\u{1F501}</div><div class="m"><b>Transfer ${out ? 'ke' : 'dari'} ${esc(other ? other.Nama : '?')}</b><em>${esc(wlTrfNote(t))}</em></div><div class="a"><b style="color:${out ? '#fff' : '#4a8af4'}">${out ? '-' : '+'}${idr(t.Nominal)}</b><em>${dt}</em></div></div>`;
    }).join('') + '</div>' : '<div class="rt emp">Belum ada transaksi di dompet ini.</div>';
    el.innerHTML = h;
}
function wlDelTrf(id) {
    if (!confirm('Hapus transfer ini?')) return;
    WL.trf = WL.trf.filter(t => t.ID !== id); saveCache(); renderAfterWl();
    syncEnqueue({ run: () => apiPost({ action: 'deleteTransfer', ID: id }) });
}
function renderAfterWl() { try { renderSettings(); renderOverview(); refreshViews(); } catch (e) { console.error(e); } }

// ---------- form transaksi: pilih dompet ----------
function wlLast() { try { return JSON.parse(localStorage.getItem('mb_wl_last') || '{}'); } catch (e) { return {}; } }
function wlRemember(jn, id) { const o = wlLast(); o[jn] = id; try { localStorage.setItem('mb_wl_last', JSON.stringify(o)); } catch (e) {} }
function wlOpts(pool, sel, exceptId) {
    return '<option value="">Tanpa dompet</option>' + pool.map(w => `<option value="${w.ID}"${w.ID === sel ? ' selected' : ''}>${esc(w.Nama)} · ${idr(wlBal(w, exceptId))}</option>`).join('');
}
function wlTxSetup(editId) {
    const box = document.getElementById('txWalBox'); if (!box) return;
    const on = wlOn(); box.style.display = on ? 'block' : 'none'; if (!on) return;
    const jn = txJenis, kat = document.getElementById('txCat').value;
    const t = txEditId ? dataTransaksi.find(x => String(x.ID) === String(txEditId)) : null, same = t && t.Jenis === jn;
    const pool = WL.list.filter(w => w.Tipe !== 'invest'), all = WL.list, last = wlLast();
    const mapped = WL.cat[jn + '|' + kat] || '';
    let d, k = '';
    if (same) { d = t.Dompet || ''; k = t.KeDompet || ''; }
    else if (jn === 'Savings') { d = last.SavingsFrom && wlGet(last.SavingsFrom) ? last.SavingsFrom : (pool[0] ? pool[0].ID : ''); k = mapped; }
    else d = mapped || (last[jn] && wlGet(last[jn]) ? last[jn] : (pool[0] ? pool[0].ID : ''));
    document.getElementById('txWalLbl').textContent = jn === 'Income' ? 'Received in' : 'Pay from';
    document.getElementById('txWal').innerHTML = wlOpts(pool, d, same ? t.ID : '');
    const r2 = document.getElementById('txWal2Row'); r2.style.display = jn === 'Savings' ? 'flex' : 'none';
    document.getElementById('txWal2').innerHTML = wlOpts(all, k, same ? t.ID : '');
    wlTxWalChange();
}
function wlTxWalChange() {
    const s1 = document.getElementById('txWal'), s2 = document.getElementById('txWal2'); if (!s1) return;
    const w1 = wlGet(s1.value), w2 = wlGet(s2.value);
    document.getElementById('txWalIc').innerHTML = w1 ? wlAv(w1, 40, true) : '<i class="fa-solid fa-wallet"></i>';
    document.getElementById('txWalIc').style.background = w1 ? 'transparent' : '#e5484d';
    document.getElementById('txWal2Ic').innerHTML = w2 ? wlAv(w2, 40, true) : '<i class="fa-solid fa-piggy-bank"></i>';
    document.getElementById('txWal2Ic').style.background = w2 ? 'transparent' : '#3fb968';
    wlTxWarn();
}
function wlTxWarn() {
    const el = document.getElementById('txWalHint'); if (!el) return;
    const w = wlGet(document.getElementById('txWal').value), amt = Number(document.getElementById('txAmt').value.replace(/\D/g, '')) || 0;
    if (!w || !amt || txJenis === 'Income') { el.style.display = 'none'; el.textContent = ''; return; }
    const b = wlBal(w, txEditId);
    if (amt > b) { el.style.display = 'block'; el.textContent = 'Saldo ' + w.Nama + ' ' + idr(b) + ', kurang ' + idr(amt - b) + '. Pilih dompet lain atau tetap catat (saldo jadi minus).'; }
    else { el.style.display = 'none'; el.textContent = ''; }
}
function wlTxVals() {
    const box = document.getElementById('txWalBox');
    if (!box || box.style.display === 'none') return { d: '', k: '' };
    const d = document.getElementById('txWal').value, k = txJenis === 'Savings' ? document.getElementById('txWal2').value : '';
    if (d && k && d === k) return { err: 'Pilih dompet berbeda untuk Pay from dan Save to.' };
    if (d) wlRemember(txJenis === 'Savings' ? 'SavingsFrom' : txJenis, d);
    return { d, k };
}

// ---------- form budget: pilih dompet ----------
function wlBudSetup() {
    const box = document.getElementById('bWalBox'); if (!box) return;
    const on = wlOn() && budJenis !== 'Income'; box.style.display = on ? 'block' : 'none'; if (!on) return;
    const kat = document.getElementById('bCat').value, sel = WL.cat[budJenis + '|' + kat] || '';
    const pool = budJenis === 'Savings' ? WL.list : WL.list.filter(w => w.Tipe !== 'invest');
    document.getElementById('bWalLbl').textContent = budJenis === 'Savings' ? 'Disimpan di' : 'Dompet';
    document.getElementById('bWal').innerHTML = '<option value="">Belum ditentukan</option>' + pool.map(w => `<option value="${w.ID}"${w.ID === sel ? ' selected' : ''}>${esc(w.Nama)}</option>`).join('');
    // sumber dana (hanya Expenses)
    const ex = budJenis === 'Expenses' && kat ? wlBTrf('Expenses', kat, bMonth) : null;
    const src = ex ? ex.Dari : (budEdit && !sel ? '' : wlSrcDefault(sel));
    document.getElementById('bSrc').innerHTML = '<option value="">Tidak dipindah</option>' + WL.list.filter(w => w.Tipe !== 'invest').map(w => `<option value="${w.ID}"${w.ID === src ? ' selected' : ''}>${esc(w.Nama)} \u00b7 ${idr(wlBal(w, null, ex ? ex.ID : null))}</option>`).join('');
    wlBudHint();
}
function wlBudHint() {
    const el = document.getElementById('bWalHint'), sel = document.getElementById('bWal'); if (!el || !sel) return;
    const w = wlGet(sel.value), ic = document.getElementById('bWalIc'), sr = document.getElementById('bSrcRow'), ss = document.getElementById('bSrc');
    if (ic) { ic.innerHTML = w ? wlAv(w, 40, true) : '<i class="fa-solid fa-wallet"></i>'; ic.style.background = w ? 'transparent' : '#e5484d'; }
    const showSrc = !!w && budJenis === 'Expenses'; sr.style.display = showSrc ? 'flex' : 'none';
    const s = showSrc ? wlGet(ss.value) : null, sic = document.getElementById('bSrcIc');
    if (sic) { sic.innerHTML = s ? wlAv(s, 40, true) : '<i class="fa-solid fa-right-left"></i>'; sic.style.background = s ? 'transparent' : '#636366'; }
    if (!w) { el.textContent = ''; return; }
    if (budJenis === 'Savings') { el.textContent = 'Tabungan kategori ini masuk ke ' + w.Nama + '.'; el.style.color = ''; return; }
    const kat = document.getElementById('bCat').value, amt = Number(document.getElementById('bAmt').value.replace(/\D/g, '')) || 0;
    const ex = kat ? wlBTrf('Expenses', kat, bMonth) : null;
    if (s && s.ID !== w.ID) {
        const after = wlBal(s, null, ex ? ex.ID : null) - amt;
        el.style.color = after < 0 ? '#ffb454' : '';
        el.textContent = (amt ? idr(amt) : 'Dana budget') + ' dipindah dari ' + s.Nama + ' ke ' + w.Nama + '. Saldo ' + s.Nama + (after < 0 ? ' jadi minus ' + idr(-after) + '.' : ' sisa ' + idr(after) + '.');
        return;
    }
    const [y, m] = bMonth.split('-').map(Number);
    const used = Number(((getActualByCategory('Expenses', m, y) || {})[kat]) || 0), mine = Math.max(0, amt - used);
    const free = wlBal(w) - wlAlloc(w, kat) - mine;
    el.style.color = free < 0 ? '#ffb454' : '';
    el.textContent = free >= 0 ? 'Saldo ' + w.Nama + ' ' + idr(wlBal(w)) + '. Setelah dialokasikan, bebas ' + idr(free) + '.' : 'Saldo ' + w.Nama + ' kurang ' + idr(-free) + ' untuk semua budget di dompet ini.';
}
function wlBudSave(jn, kat, amt, ym) {
    const box = document.getElementById('bWalBox'); if (!box || box.style.display === 'none') return;
    const val = document.getElementById('bWal').value, key = jn + '|' + kat;
    if ((WL.cat[key] || '') !== val) {
        if (val) WL.cat[key] = val; else delete WL.cat[key];
        syncEnqueue({ run: () => apiPost({ action: 'setCatWallet', Jenis: jn, Kategori: kat, Dompet: val }) });
    }
    if (jn === 'Expenses') {
        const src = document.getElementById('bSrc').value;
        const want = (src && val && src !== val && wlGet(src) && wlGet(val)) ? amt : 0, ex = wlBTrf(jn, kat, ym);
        const same = ex && want && ex.Dari === src && ex.Ke === val && Number(ex.Nominal) === want;
        if (!same) {
            if (ex) wlTrfRemove(ex);
            if (want) wlTrfAdd(src, val, want, wlBTag(jn, kat, ym));
        }
        if (src && want) { try { localStorage.setItem('mb_wl_src', src); } catch (e) {} }
    }
    saveCache();
}
function wlBudDel(jn, kat, ym) { const ex = wlBTrf(jn, kat, ym); if (ex) { wlTrfRemove(ex); saveCache(); } }

// ---------- sheet dompet ----------
function wlShSet(html) { const sh = document.getElementById('wSheet'); document.getElementById('wBody').innerHTML = html; sh.classList.add('open'); }
function wlCloseSheet() { WS = null; document.getElementById('wSheet').classList.remove('open'); }
function wlTop(title, go) { return `<div class="sh-top"><button class="sh-r x" onclick="wlCloseSheet()" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button><div class="ti">${title}</div><button class="sh-r go" onclick="${go}" aria-label="Simpan"><i class="fa-solid fa-arrow-up"></i></button></div>`; }
function wlFmt(inp) { const r = inp.value.replace(/\D/g, ''); inp.value = r ? Number(r).toLocaleString('id-ID') : ''; return r; }

function wlOpenWal(id) {
    const w = id ? wlGet(id) : null;
    WS = w ? { k: 'wal', id: w.ID, type: w.Tipe, pick: w.Logo || '', name: w.Nama, bal: '', cost: w.Modal ? String(w.Modal) : '', sub: w.Sub || '', icon: w.Ikon || '', color: w.Warna }
           : { k: 'wal', id: '', type: 'bank', pick: '', name: '', bal: '', cost: '', sub: '', icon: '', color: '' };
    wlRenderWal();
}
function wlRenderWal() {
    const s = WS, edit = !!s.id;
    const seg = edit ? '' : `<div class="seg">${['bank', 'ewallet', 'cash', 'invest'].map(t => `<button class="${s.type === t ? 'on' : ''}" onclick="wlWalType('${t}')">${t === 'ewallet' ? 'E-wallet' : t === 'invest' ? 'Invest' : WL_TYPES[t].t}</button>`).join('')}</div>`;
    let grid = '';
    if (s.type === 'bank' || s.type === 'ewallet') {
        const L = s.type === 'bank' ? WL_BANKS : WL_EWAL;
        grid = `<div class="sh-l" style="font-size:13px;font-weight:700;color:#8e8e93;margin:14px 6px 8px">Pilih logo</div><div class="wl-grid">${L.map(x => `<button data-k="${x[0]}" class="${s.pick === x[0] ? 'on' : ''}" onclick="wlWalPick('${x[0]}')" aria-label="${esc(x[1])}"><span><img alt="" src="logos/${x[0]}.svg"></span></button>`).join('')}<button data-k="" class="${!s.pick ? 'on' : ''}" onclick="wlWalPick('')"><em>Lainnya</em></button></div>`;
    } else if (s.type === 'invest') {
        grid = `<div class="sh-l" style="font-size:13px;font-weight:700;color:#8e8e93;margin:14px 6px 8px">Jenis</div><div class="wl-grid">${WL_INVS.map(x => `<button data-k="${x[0]}" class="${s.pick === x[0] ? 'on' : ''}" onclick="wlWalPick('${x[0]}')"><span class="ico" style="background:${x[2]}"><i class="fa-solid ${x[3]}"></i></span><em>${x[1]}</em></button>`).join('')}</div>`;
    }
    const fields = `<div class="sh-c" style="margin-top:14px"><label class="sh-row"><b>Nama</b><input id="wlName" maxlength="40" placeholder="mis. BCA Utama" autocomplete="off" value="${esc(s.name)}" oninput="WS.name=this.value"></label>
        ${!edit ? `<label class="sh-row"><b>${s.type === 'invest' ? 'Nilai sekarang' : 'Saldo awal'}</b><input id="wlBal" inputmode="numeric" placeholder="0" autocomplete="off" value="${s.bal}" oninput="WS.bal=wlFmt(this)"></label>` : ''}
        ${s.type === 'invest' ? `<label class="sh-row"><b>Modal</b><input id="wlCost" inputmode="numeric" placeholder="0" autocomplete="off" value="${s.cost ? Number(s.cost).toLocaleString('id-ID') : ''}" oninput="WS.cost=wlFmt(this)"></label><label class="sh-row"><b>Keterangan</b><input id="wlSub" maxlength="40" placeholder="mis. Jatuh tempo Mar 2027" autocomplete="off" value="${esc(s.sub)}" oninput="WS.sub=this.value"></label>` : ''}</div>`;
    wlShSet(`${wlTop(edit ? 'Edit Wallet' : 'New Wallet', 'wlSaveWal()')}${seg}${grid}${fields}
        <p class="hint">${s.type === 'invest' ? 'Nilai investasi diperbarui manual lewat tombol Update nilai di detail dompet.' : edit ? 'Untuk mengoreksi saldo, pakai Sesuaikan saldo di detail dompet.' : 'Saldo awal adalah uang yang sudah ada di dompet ini sekarang.'}</p>
        ${edit ? `<button class="txdel" style="display:block" onclick="wlDelWal()">Delete Wallet</button>` : ''}`);
}
function wlWalType(t) { WS.type = t; WS.pick = ''; WS.name = ''; wlRenderWal(); }
function wlWalPick(k) {
    WS.pick = k;
    const L = (WS.type === 'bank' ? WL_BANKS : WS.type === 'ewallet' ? WL_EWAL : WL_INVS).find(x => x[0] === k);
    if (L) { WS.name = L[1]; WS.color = L[2]; if (WS.type === 'invest') { WS.icon = L[3]; WS.sub = WS.sub || L[1]; } } else if (!k) { WS.color = ''; }
    // perbarui di tempat (tanpa render ulang) supaya logo tidak berkedip dan posisi scroll tetap
    document.querySelectorAll('#wBody .wl-grid button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    const n = document.getElementById('wlName'); if (n) n.value = WS.name;
    const sb = document.getElementById('wlSub'); if (sb && WS.sub) sb.value = WS.sub;
}
function wlSaveWal() {
    const s = WS, name = (s.name || '').trim();
    if (!name) { flagField('wlName'); showToast('Isi nama dompet.', true); return; }
    if (!s.id && WL.list.length >= 40) { showToast('Maksimal 40 dompet.', true); return; }
    let o;
    const L = (s.type === 'bank' ? WL_BANKS : s.type === 'ewallet' ? WL_EWAL : WL_INVS).find(x => x[0] === s.pick);
    const color = L ? L[2] : (s.type === 'cash' ? '#e8964a' : s.type === 'invest' ? '#7b6fe8' : '#636366');
    const icon = s.type === 'invest' ? (L ? L[3] : 'fa-chart-line') : s.type === 'cash' ? 'fa-wallet' : (L ? '' : (s.type === 'bank' ? 'fa-building-columns' : 'fa-mobile-screen'));
    const logo = (s.type === 'bank' || s.type === 'ewallet') && L ? L[0] : '';
    if (s.id) {
        o = wlGet(s.id); Object.assign(o, { Nama: name, Tipe: s.type, Logo: logo, Warna: color, Ikon: icon, Sub: s.type === 'invest' ? (s.sub || '') : '' });
        if (s.type === 'invest') o.Modal = Number(s.cost) || 0;
    } else {
        o = { ID: newId().replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 40), Nama: name, Tipe: s.type, Logo: logo, Warna: color, Ikon: icon, Sub: s.type === 'invest' ? (s.sub || '') : '', Saldo: Number(s.bal) || 0, SaldoTs: '', Modal: s.type === 'invest' ? (Number(s.cost) || Number(s.bal) || 0) : 0, Urut: WL.list.length };
        WL.list.push(o);
    }
    saveCache(); wlCloseSheet(); renderAfterWl(); showToast('✓ Dompet tersimpan!');
    const p = { action: 'saveWallet', ID: o.ID, Nama: o.Nama, Tipe: o.Tipe, Logo: o.Logo, Warna: o.Warna, Ikon: (o.Ikon || '').replace(/[^a-z\-]/g, ''), Sub: o.Sub, Saldo: o.Saldo, Modal: o.Modal };
    syncEnqueue({ run: () => apiPost(p) });
}
function wlDelWal() {
    const s = WS, w = wlGet(s.id); if (!w) return;
    if (dataTransaksi.some(t => t.Dompet === w.ID || t.KeDompet === w.ID) || WL.trf.some(t => t.Dari === w.ID || t.Ke === w.ID)) { showToast('Dompet ini masih dipakai transaksi. Hapus atau ubah transaksinya dulu.', true); return; }
    if (!confirm('Hapus dompet "' + w.Nama + '"?')) return;
    WL.list = WL.list.filter(x => x.ID !== w.ID);
    Object.keys(WL.cat).forEach(k => { if (WL.cat[k] === w.ID) delete WL.cat[k]; });
    saveCache(); wlCloseSheet(); sView = 'wallets'; renderAfterWl(); showToast('✓ Dompet dihapus!');
    syncEnqueue({ run: () => apiPost({ action: 'deleteWallet', ID: w.ID }) });
}

function wlOpenBal(id) {
    const w = wlGet(id); if (!w) return;
    WS = { k: 'bal', id, val: String(Math.round(wlBal(w))), cost: String(w.Modal || 0) };
    wlRenderBal();
}
function wlRenderBal() {
    const w = wlGet(WS.id), inv = w.Tipe === 'invest';
    wlShSet(`${wlTop(inv ? 'Update nilai' : 'Sesuaikan saldo', 'wlSaveBal()')}<div class="wl-big"><em>${esc(w.Nama)}</em><div><span>IDR</span><input id="wlVal" inputmode="numeric" placeholder="0" autocomplete="off" value="${Number(WS.val) ? Number(WS.val).toLocaleString('id-ID') : ''}" oninput="WS.val=wlFmt(this)"></div></div>
        ${inv ? `<div class="sh-c"><label class="sh-row"><b>Modal</b><input id="wlCost" inputmode="numeric" autocomplete="off" value="${Number(WS.cost) ? Number(WS.cost).toLocaleString('id-ID') : ''}" oninput="WS.cost=wlFmt(this)"></label></div>` : ''}
        <p class="hint">${inv ? 'Isi nilai terbaru dari aplikasi investasimu. Untung atau rugi dihitung dari selisih dengan modal.' : 'Dipakai kalau saldo di sini berbeda dengan saldo asli (misalnya ada biaya admin). Transaksi sebelumnya tidak berubah.'}</p>`);
}
function wlSaveBal() {
    const w = wlGet(WS.id), v = Number(WS.val) || 0, p2 = n => String(n).padStart(2, '0'), n = new Date();
    w.Saldo = v; w.SaldoTs = n.getFullYear() + '-' + p2(n.getMonth() + 1) + '-' + p2(n.getDate()) + ' ' + p2(n.getHours()) + ':' + p2(n.getMinutes()) + ':' + p2(n.getSeconds());
    if (w.Tipe === 'invest') w.Modal = Number(WS.cost) || 0;
    const payload = { action: 'setWalletBalance', ID: w.ID, Saldo: v }; if (w.Tipe === 'invest') payload.Modal = w.Modal;
    saveCache(); wlCloseSheet(); renderAfterWl(); showToast('✓ Saldo diperbarui!');
    syncEnqueue({ run: () => apiPost(payload) });
}

function wlOpenTrf(from) {
    if (WL.list.length < 2) { showToast('Tambah minimal 2 dompet untuk transfer.', true); return; }
    const f = from || WL.list[0].ID, t = WL.list.find(w => w.ID !== f);
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    WS = { k: 'trf', from: f, to: t.ID, amt: '', note: '', date: d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) };
    wlRenderTrf();
}
function wlRenderTrf() {
    const s = WS, opts = sel => WL.list.map(w => `<option value="${w.ID}"${w.ID === sel ? ' selected' : ''}>${esc(w.Nama)} · ${idr(wlBal(w))}</option>`).join('');
    const a = wlGet(s.from), b = wlGet(s.to);
    wlShSet(`${wlTop('Transfer', 'wlSaveTrf()')}<div class="wl-big"><em>Jumlah</em><div><span>IDR</span><input id="wlAmt" inputmode="numeric" placeholder="0" autocomplete="off" value="${s.amt ? Number(s.amt).toLocaleString('id-ID') : ''}" oninput="WS.amt=wlFmt(this);wlTrfWarn()"></div></div>
        <div class="sh-c"><label class="sh-row"><span class="ic" style="background:transparent">${wlAv(a, 40, true)}</span><b>Dari</b><select onchange="WS.from=this.value;wlRenderTrf()">${opts(s.from)}</select></label>
        <label class="sh-row"><span class="ic" style="background:transparent">${wlAv(b, 40, true)}</span><b>Ke</b><select onchange="WS.to=this.value;wlRenderTrf()">${opts(s.to)}</select></label></div>
        <div class="sh-c" style="margin-top:8px"><label class="sh-row"><span class="ic" style="background:#5b8def"><i class="fa-solid fa-calendar"></i></span><b>Date</b><input type="date" value="${s.date}" onchange="WS.date=this.value"></label>
        <label class="sh-row"><b>Catatan</b><input placeholder="Opsional" maxlength="120" value="${esc(s.note)}" oninput="WS.note=this.value"></label></div>
        <p class="hint" id="wlTrfHint" style="display:none;color:#ffb454"></p>`);
    wlTrfWarn();
}
function wlTrfWarn() {
    const el = document.getElementById('wlTrfHint'); if (!el) return;
    const f = wlGet(WS.from), amt = Number(WS.amt) || 0;
    if (f && amt > wlBal(f)) { el.style.display = 'block'; el.textContent = 'Saldo ' + f.Nama + ' hanya ' + idr(wlBal(f)) + '.'; } else el.style.display = 'none';
}
function wlSaveTrf() {
    const s = WS, amt = Number(s.amt) || 0;
    if (!amt) { flagField('wlAmt'); showToast('Isi jumlah transfer.', true); return; }
    if (s.from === s.to) { showToast('Pilih dua dompet yang berbeda.', true); return; }
    if (!s.date) { showToast('Isi tanggal.', true); return; }
    const p2 = n => String(n).padStart(2, '0'), n = new Date();
    const row = { ID: newId().replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 40), Tanggal: s.date, Dari: s.from, Ke: s.to, Nominal: amt, Catatan: s.note || '',
        Timestamp: n.getFullYear() + '-' + p2(n.getMonth() + 1) + '-' + p2(n.getDate()) + ' ' + p2(n.getHours()) + ':' + p2(n.getMinutes()) + ':' + p2(n.getSeconds()) };
    WL.trf.push(row); saveCache(); wlCloseSheet(); renderAfterWl(); showToast('✓ Transfer dicatat!');
    syncEnqueue({ run: retry => apiPost({ action: 'addTransfer', ID: row.ID, Tanggal: row.Tanggal, Dari: row.Dari, Ke: row.Ke, Nominal: row.Nominal, Catatan: row.Catatan, Retry: retry }) });
}

// kategori diganti di form transaksi baru: ikuti dompet yang terhubung ke kategori itu
function wlTxCat() {
    if (!wlOn() || txEditId) return;
    const m = WL.cat[txJenis + '|' + document.getElementById('txCat').value]; if (!m || !wlGet(m)) return;
    const el = document.getElementById(txJenis === 'Savings' ? 'txWal2' : 'txWal');
    if ([...el.options].some(o => o.value === m)) { el.value = m; wlTxWalChange(); }
}
document.getElementById('txAmt').addEventListener('input', wlTxWarn);
document.getElementById('bAmt').addEventListener('input', wlBudHint);
