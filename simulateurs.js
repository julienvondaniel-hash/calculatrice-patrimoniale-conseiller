/* ============================================================
   SIMULATEURS PATRIMONIAUX — module additionnel
   Retraite (Monte Carlo), Capitalisation par classe d'actifs,
   Immobilier locatif (TRI multi-régimes), SCI à l'IS vs IR,
   Acheter vs Louer, Dutreil, Apport-cession 150-0 B ter.
   S'appuie sur les helpers de app.js (el, hero, field, actions,
   moneyInput, pctInput, selectField, num, Screens, Router…).
   ============================================================ */
(function () {
  'use strict';

  /* ---------- formatage ---------- */
  const e0 = n => isFinite(n) ? Math.round(n).toLocaleString('fr-FR') + ' €' : '—';
  const eMo = n => e0(n) + '/mois';
  const p2 = x => isFinite(x) ? x.toFixed(2).replace('.', ',') + ' %' : '—';
  const gv = id => num($('#' + id).value);
  const gvSel = id => $('#' + id).value;

  /* ---------- stockage des simulations (Supabase ou local) ---------- */
  const Store = {
    key() { return 'pat_sims_' + ((State.user && State.user.email) || 'demo'); },
    async save(label, payload) {
      if (SUPA_ON && supa) {
        const { data: { user } } = await supa.auth.getUser();
        const { error } = await supa.from('simulations').insert({ user_id: user.id, screen: payload.screen, label, payload });
        if (error) throw error;
      } else {
        const arr = JSON.parse(localStorage.getItem(this.key()) || '[]');
        arr.unshift({ id: 'loc_' + Date.now(), screen: payload.screen, label, payload, created_at: new Date().toISOString() });
        localStorage.setItem(this.key(), JSON.stringify(arr));
      }
    },
    async list() {
      if (SUPA_ON && supa) {
        const { data, error } = await supa.from('simulations').select('*').order('created_at', { ascending: false });
        if (error) throw error; return data || [];
      }
      return JSON.parse(localStorage.getItem(this.key()) || '[]');
    },
    async remove(id) {
      if (SUPA_ON && supa) { const { error } = await supa.from('simulations').delete().eq('id', id); if (error) throw error; }
      else { const arr = JSON.parse(localStorage.getItem(this.key()) || '[]').filter(x => x.id !== id); localStorage.setItem(this.key(), JSON.stringify(arr)); }
    }
  };
  function loadSaved(p) {
    Router.reset('sim'); Router.go(p.screen);
    setTimeout(() => {
      Object.entries(p.inputs || {}).forEach(([id, val]) => { const e = document.getElementById(id); if (e) { e.value = val; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); } });
      const btn = $('#view .sheet .btn-primary'); if (btn) btn.click();
    }, 60);
  }
  function addSaveButton(sheet, res) {
    const screen = Router.stack[Router.stack.length - 1];
    const heroTitle = ($('#view .hero h1') || {}).textContent || 'Simulation';
    const btn = el('button', { class: 'btn-ghost sim-save', type: 'button', style: 'margin-top:12px' }, '💾 Enregistrer cette simulation');
    btn.onclick = async () => {
      const def = heroTitle + ' — ' + new Date().toLocaleDateString('fr-FR');
      const label = prompt('Nom de la simulation :', def);
      if (label === null) return;
      const inputs = {}; $$('#view input[id], #view select[id]').forEach(e => inputs[e.id] = e.value);
      const payload = { screen, title: res.title || 'Résultat', rows: res.rows, total: res.total || null, note: res.note || null, inputs };
      btn.disabled = true; btn.textContent = 'Enregistrement…';
      try { await Store.save(label.trim() || def, payload); toast('Simulation enregistrée'); }
      catch (e) { toast('Erreur : ' + (e.message || e)); }
      btn.disabled = false; btn.textContent = '💾 Enregistrer cette simulation';
    };
    sheet.append(btn);
  }

  /* ---------- profil conseiller (logo + coordonnées) ---------- */
  const Profile = {
    KEY: 'mkp_profile',
    get() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { return {}; } },
    set(p) { localStorage.setItem(this.KEY, JSON.stringify(p)); }
  };
  function textInput(id, val, ph) { const w = el('div', { class: 'input-wrap' }); w.append(el('input', { id, class: 'inp', value: val || '', placeholder: ph || '' })); return w; }
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function brandSVGdark() {
    return '<svg viewBox="0 0 250 56" xmlns="http://www.w3.org/2000/svg" style="height:46px"><rect x="2" y="8" width="40" height="40" rx="11" fill="#12B981"/><rect x="11" y="29" width="6" height="11" rx="2" fill="#fff"/><rect x="20" y="23" width="6" height="17" rx="2" fill="#fff"/><rect x="29" y="16" width="6" height="24" rx="2" fill="#fff"/><path d="M12 24 L22 19 L33 13" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="33" cy="13" r="2.4" fill="#fff"/><text x="52" y="37" font-family="Inter,Arial,sans-serif" font-size="27" font-weight="800" fill="#1B2559">Mon Kap <tspan fill="#12B981">Pro</tspan></text></svg>';
  }

  /* ---------- export PDF (impression) & Excel (.xls) ---------- */
  const Export = {
    pdf(title, rows, total) {
      const p = Profile.get();
      const contact = [
        p.cabinet ? '<b>' + esc(p.cabinet) + '</b>' : '',
        p.conseiller ? esc(p.conseiller) : '',
        p.tel ? 'Tél : ' + esc(p.tel) : '',
        p.email ? esc(p.email) : '',
        p.adresse ? esc(p.adresse) : ''
      ].filter(Boolean).join('<br>');
      const logo = p.logo ? '<img src="' + p.logo + '">' : brandSVGdark();
      const body = rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('')
        + (total ? '<tr class="tot"><td>' + esc(total[0]) + '</td><td>' + esc(total[1]) + '</td></tr>' : '');
      document.getElementById('print-root').innerHTML =
        '<div class="pr-head"><div class="pr-logo">' + logo + '</div><div class="pr-contact">' + contact + '</div></div>'
        + '<div class="pr-title">' + esc(title) + '</div>'
        + '<div class="pr-date">Édité le ' + new Date().toLocaleDateString('fr-FR') + '</div>'
        + '<table class="pr-tbl"><tbody>' + body + '</tbody></table>'
        + '<div class="pr-note">Simulation indicative établie à partir des hypothèses saisies — ne constitue pas un conseil en investissement ni un conseil fiscal personnalisé.</div>'
        + '<div class="pr-foot"><span>' + (p.cabinet ? esc(p.cabinet) : 'Mon Kap Pro') + '</span><span>Généré avec Mon Kap Pro</span></div>';
      setTimeout(() => window.print(), 60);
    },
    excel(title, rows, total) {
      const p = Profile.get();
      let h = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">';
      [['Cabinet', p.cabinet], ['Conseiller', p.conseiller], ['Téléphone', p.tel], ['E-mail', p.email], ['Adresse', p.adresse]]
        .filter(r => r[1]).forEach(r => h += '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>');
      h += '<tr><td></td><td></td></tr><tr><td><b>' + esc(title) + '</b></td><td>' + new Date().toLocaleDateString('fr-FR') + '</td></tr>';
      h += '<tr><td><b>Indicateur</b></td><td><b>Valeur</b></td></tr>';
      rows.forEach(r => h += '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>');
      if (total) h += '<tr><td><b>' + esc(total[0]) + '</b></td><td><b>' + esc(total[1]) + '</b></td></tr>';
      h += '</table></body></html>';
      const blob = new Blob(['﻿' + h], { type: 'application/vnd.ms-excel' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = (title.replace(/[^\wÀ-ÿ]+/g, '_').replace(/^_|_$/g, '') || 'simulation') + '.xls';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast('Fichier Excel téléchargé');
    }
  };
  function addExportButtons(sheet, res) {
    const title = (($('#view .hero h1') || {}).textContent || 'Simulation') + ' — ' + (res.title || 'Résultat');
    const wrap = el('div', { class: 'sim-export', style: 'display:flex;gap:10px;margin-top:10px' });
    const mk = (txt, fn) => { const b = el('button', { class: 'btn-ghost', type: 'button', style: 'margin:0;flex:1;padding:16px' }, txt); b.onclick = () => { try { fn(); } catch (e) { toast('Erreur export'); } }; return b; };
    wrap.append(mk('📄 PDF', () => Export.pdf(title, res.rows, res.total)));
    wrap.append(mk('📊 Excel', () => Export.excel(title, res.rows, res.total)));
    sheet.append(wrap);
  }

  /* ---------- moteurs partagés (validés au centime) ---------- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function makeNormal(rng) { let sp = null; return function () { if (sp !== null) { const s = sp; sp = null; return s; } let u, v, s; do { u = rng() * 2 - 1; v = rng() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0); const m = Math.sqrt(-2 * Math.log(s) / s); sp = v * m; return u * m; }; }
  function quantile(a, q) { if (!a.length) return 0; const pos = (a.length - 1) * q, b = Math.floor(pos), r = pos - b; return a[b + 1] !== undefined ? a[b] + r * (a[b + 1] - a[b]) : a[b]; }
  function irr(cf) {
    const npv = r => cf.reduce((acc, c, t) => acc + c / Math.pow(1 + r, t), 0);
    let lo = null, hi = null, pr = -0.95, pf = npv(-0.95);
    for (let x = -0.90; x <= 2.0; x += 0.01) { const f = npv(x); if (pf * f <= 0) { lo = pr; hi = x; break; } pr = x; pf = f; }
    if (lo === null) return null;
    let flo = npv(lo);
    for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2, fm = npv(mid); if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; } }
    return (lo + hi) / 2;
  }
  function abIR(n) { let a = 0; for (let y = 6; y <= Math.min(n, 22); y++) a += y <= 21 ? 0.06 : 0.04; return Math.min(a, 1); }
  function abPS(n) { let a = 0; for (let y = 6; y <= Math.min(n, 30); y++) a += y <= 21 ? 0.0165 : (y === 22 ? 0.016 : 0.09); return Math.min(a, 1); }

  /* ---------- rendu : carte graphique + bloc résultat ---------- */
  function simRender(sheet, res) {
    $$('.result', sheet).forEach(r => r.remove());
    $$('.sim-chart', sheet).forEach(r => r.remove());
    $$('.sim-save', sheet).forEach(r => r.remove());
    $$('.sim-export', sheet).forEach(r => r.remove());
    if (res.charts) res.charts.forEach(fn => {
      const card = el('div', { class: 'card sim-chart' });
      if (fn.title) card.append(el('div', { class: 'sub-title', style: 'font-size:16px;margin-bottom:10px' }, fn.title));
      const cv = el('canvas', {}); cv.style.width = '100%'; cv.style.display = 'block';
      card.append(cv);
      if (fn.legend) card.append(el('div', { class: 'hint', style: 'margin:10px 2px 0', html: fn.legend }));
      sheet.append(card);
      requestAnimationFrame(() => fn.draw(cv));
    });
    const box = el('div', { class: 'result' });
    box.append(el('h3', {}, res.title || 'Résultat'));
    res.rows.forEach(([k, v]) => box.append(el('div', { class: 'row' }, [el('span', { class: 'k' }, k), el('span', { class: 'v' }, v)])));
    if (res.total) box.append(el('div', { class: 'row total' }, [el('span', { class: 'k' }, res.total[0]), el('span', { class: 'v' }, res.total[1])]));
    if (res.note) box.append(el('div', { class: 'note' }, res.note));
    sheet.append(box);
    addExportButtons(sheet, res);
    addSaveButton(sheet, res);
    safeScroll(box);
  }

  /* ---------- graphiques canvas ---------- */
  function setupCv(cv, h) {
    const ratio = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 420;
    cv.width = W * ratio; cv.height = h * ratio; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'); ctx.scale(ratio, ratio);
    return { ctx, W, H: h };
  }
  function fanChart(cv, d) {
    const { ctx, W, H } = setupCv(cv, 200);
    const padL = 46, padR = 10, padT = 12, padB = 24, pw = W - padL - padR, ph = H - padT - padB;
    const n = d.P50.length - 1;
    const maxV = Math.max(...d.P90, ...(d.ref || [0])) * 1.05 || 1;
    const x = i => padL + (n === 0 ? 0 : i / n * pw), y = v => padT + ph - v / maxV * ph;
    ctx.font = '10px Inter, sans-serif'; ctx.textBaseline = 'middle';
    for (let t = 0; t <= 4; t++) { const v = maxV * t / 4, yy = y(v); ctx.strokeStyle = '#EDEEF4'; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); ctx.fillStyle = '#8B8FA8'; ctx.textAlign = 'right'; ctx.fillText(Math.round(v / 1000) + 'k', padL - 5, yy); }
    ctx.beginPath(); ctx.moveTo(x(0), y(d.P90[0])); for (let i = 1; i <= n; i++) ctx.lineTo(x(i), y(d.P90[i])); for (let i = n; i >= 0; i--) ctx.lineTo(x(i), y(d.P10[i])); ctx.closePath(); ctx.fillStyle = 'rgba(38,42,65,.13)'; ctx.fill();
    const line = (arr, col, w, dash) => { ctx.beginPath(); for (let i = 0; i <= n; i++) { const px = x(i), py = y(arr[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); };
    if (d.ref) line(d.ref, '#C9A24B', 1.5, [5, 4]);
    line(d.P50, '#262A41', 2.4);
  }
  function lineChart(cv, o) {
    const { ctx, W, H } = setupCv(cv, 200);
    const padL = 46, padR = 10, padT = 12, padB = 24, pw = W - padL - padR, ph = H - padT - padB;
    const n = o.n - 1, all = o.series.flatMap(s => s.data);
    let maxV = Math.max(...all, o.zero ? 0 : -1e18), minV = Math.min(...all, o.zero ? 0 : 1e18);
    if (maxV === minV) { maxV += 1; minV -= 1; } const pad = (maxV - minV) * 0.08; maxV += pad; minV -= pad;
    const x = i => padL + (n <= 0 ? 0 : i / n * pw), y = v => padT + ph - (v - minV) / (maxV - minV) * ph;
    ctx.font = '10px Inter, sans-serif'; ctx.textBaseline = 'middle';
    for (let t = 0; t <= 4; t++) { const v = minV + (maxV - minV) * t / 4, yy = y(v); ctx.strokeStyle = '#EDEEF4'; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); ctx.fillStyle = '#8B8FA8'; ctx.textAlign = 'right'; ctx.fillText(o.euro ? Math.round(v / 1000) + 'k' : v.toFixed(0), padL - 5, yy); }
    if (o.zero && minV < 0 && maxV > 0) { ctx.strokeStyle = '#B8C4C4'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(padL, y(0)); ctx.lineTo(W - padR, y(0)); ctx.stroke(); ctx.setLineDash([]); }
    if (o.marker != null) { const ix = o.marker - (o.x0 || 0); if (ix >= 0 && ix <= n) { ctx.strokeStyle = '#E5484D'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x(ix), padT); ctx.lineTo(x(ix), padT + ph); ctx.stroke(); ctx.setLineDash([]); } }
    o.series.forEach(s => { ctx.beginPath(); s.data.forEach((v, i) => { const px = x(i), py = y(v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.strokeStyle = s.color; ctx.lineWidth = 2.4; ctx.stroke(); });
  }

  const SW = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M4 16l4-5 4 3 5-7"/><path d="M16 7h3v3"/></svg>';
  const TMI_OPTS = [['0', '0 %'], ['11', '11 %'], ['30', '30 %'], ['41', '41 %'], ['45', '45 %']];

  /* ============================================================
     SCREENS
     ============================================================ */
  Object.assign(Screens, {

    /* -------- Menu Simulateurs -------- */
    sim() {
      const v = el('div', {});
      v.append(hero('CALCULATRICE', 'Simulateurs'));
      const sheet = el('div', { class: 'sheet' });
      [
        ['Épargne-retraite (Monte Carlo)', 'sim_retraite'],
        ['Capital par classe d\'actifs', 'sim_capital'],
        ['Immobilier locatif — TRI', 'sim_immo'],
        ['SCI à l\'IS vs SCI à l\'IR', 'sim_sci'],
        ['Acheter vs Louer', 'sim_achat'],
        ['Transmission — Pacte Dutreil', 'sim_dutreil'],
        ['Apport-cession 150-0 B ter', 'sim_apport'],
        ['★ Mes simulations enregistrées', 'sim_saved'],
      ].forEach(([t, key]) => {
        const ok = (typeof Billing === 'undefined') || Billing.allows(key);
        const right = ok ? el('div', { class: 'ma' }) : el('div', { style: 'background:#12B981;color:#08362a;font-weight:800;font-size:11px;padding:5px 9px;border-radius:20px' }, '9,99 €');
        sheet.append(el('div', { class: 'menu-item', onclick: () => ok ? Router.go(key) : Router.go('upgrade') }, [el('div', { class: 'mt' }, t), right]));
      });
      v.append(sheet); return v;
    },

    /* -------- Mes simulations enregistrées -------- */
    sim_saved() {
      const v = el('div', {}); v.append(hero('SIMULATEUR', 'Mes simulations', SW));
      const sheet = el('div', { class: 'sheet' });
      sheet.append(el('div', { class: 'card', id: 'sv-load' }, [el('div', { class: 'hint', style: 'margin:0' }, 'Chargement…')]));
      v.append(sheet);
      Store.list().then(items => {
        sheet.innerHTML = '';
        if (!items.length) { sheet.append(el('div', { class: 'card' }, [el('div', { class: 'hint', style: 'margin:0' }, 'Aucune simulation enregistrée. Lancez un simulateur puis « 💾 Enregistrer cette simulation ».')])); return; }
        const src = (SUPA_ON && supa) ? 'serveur sécurisé' : 'cet appareil (mode démo)';
        sheet.append(el('div', { class: 'group-label' }, items.length + ' simulation' + (items.length > 1 ? 's' : '') + ' · ' + src));
        items.forEach(it => {
          const card = el('div', { class: 'menu-item', style: 'gap:12px' });
          const left = el('div', { style: 'flex:1;min-width:0', onclick: () => loadSaved(it.payload) }, [
            el('div', { class: 'mt', style: 'font-size:18px' }, it.label),
            el('div', { class: 'hint', style: 'margin:6px 0 0' }, new Date(it.created_at).toLocaleString('fr-FR'))
          ]);
          const del = el('button', { class: 'btn-back', type: 'button', style: 'background:#FDECEC;color:#C0282D;flex:none' }, 'Suppr.');
          del.onclick = (e) => { e.stopPropagation(); del.disabled = true; Store.remove(it.id).then(() => Router.go('sim_saved', false)).catch(() => { toast('Erreur de suppression'); del.disabled = false; }); };
          card.append(left, del);
          sheet.append(card);
        });
      }).catch(e => { sheet.innerHTML = ''; sheet.append(el('div', { class: 'card' }, [el('div', { class: 'hint', style: 'margin:0' }, 'Erreur de chargement : ' + (e.message || e))])); });
      return v;
    },

    /* -------- Retraite -------- */
    sim_retraite() {
      const v = el('div', {}); v.append(hero('SIMULATEUR', 'Épargne-retraite', SW));
      const sheet = el('div', { class: 'sheet' });
      sheet.append(field('Âge actuel', stepper('r-age', 36, 0, 110)));
      sheet.append(field('Âge de départ à la retraite', stepper('r-ret', 65, 0, 110)));
      sheet.append(field('Espérance de vie', stepper('r-esp', 90, 0, 120)));
      sheet.append(field('Capital de départ', moneyInput('r-cap', '50000')));
      sheet.append(field('Versement mensuel', moneyInput('r-vers', '300')));
      sheet.append(field('Rendement annuel moyen', pctInput('r-rdt', '6,5')));
      sheet.append(field('Volatilité annuelle', pctInput('r-vol', '15')));
      sheet.append(field('Rendement du capital en retraite', pctInput('r-rdtRet', '4')));
      sheet.append(actions(() => {
        const age = gv('r-age'), ret = gv('r-ret'), esp = gv('r-esp');
        const c0 = gv('r-cap'), vers = gv('r-vers'), rdt = gv('r-rdt') / 100, vol = gv('r-vol') / 100, rdtRet = gv('r-rdtRet') / 100;
        const mEp = Math.max(0, ret - age) * 12, mRe = Math.max(0, esp - ret) * 12, r = rdt / 12;
        const cap = r === 0 ? c0 + vers * mEp : c0 * Math.pow(1 + r, mEp) + vers * ((Math.pow(1 + r, mEp) - 1) / r);
        const rIntacte = cap * rdtRet / 12, rr = rdtRet / 12;
        const rConso = mRe === 0 ? 0 : (rr === 0 ? cap / mRe : cap * rr / (1 - Math.pow(1 + rr, -mRe)));
        // Monte Carlo
        const annees = Math.round(mEp / 12), volM = vol / Math.sqrt(12), muM = Math.log(1 + rdt / 12) - 0.5 * volM * volM;
        const nbSim = 1500, rng = mulberry32(42), norm = makeNormal(rng);
        const yearly = []; for (let yk = 0; yk <= annees; yk++) yearly.push(new Float64Array(nbSim));
        const fin = new Float64Array(nbSim);
        for (let s = 0; s < nbSim; s++) { let c = c0; yearly[0][s] = c; let yi = 1; for (let m = 1; m <= mEp; m++) { c *= (1 + (Math.exp(muM + volM * norm()) - 1)); c += vers; if (m % 12 === 0 && yi <= annees) { yearly[yi][s] = c; yi++; } } fin[s] = c; }
        const P10 = [], P50 = [], P90 = [], ref = [];
        for (let yk = 0; yk <= annees; yk++) { const a = Array.from(yearly[yk]).sort((x, y2) => x - y2); P10.push(quantile(a, .1)); P50.push(quantile(a, .5)); P90.push(quantile(a, .9)); ref.push(c0 + vers * yk * 12); }
        const f = Array.from(fin).sort((a, b) => a - b);
        simRender(sheet, {
          title: 'Résultats',
          charts: [{ title: 'Capital projeté (Monte Carlo)', draw: cv => fanChart(cv, { P10, P50, P90, ref }), legend: '— médiane · zone P10–P90 · - - total versé' }],
          rows: [
            ['Capital à la retraite (moyen)', e0(cap)],
            ['Monte Carlo — pessimiste (P10)', e0(quantile(f, .1))],
            ['Monte Carlo — médian (P50)', e0(quantile(f, .5))],
            ['Monte Carlo — optimiste (P90)', e0(quantile(f, .9))],
            ['Rente sans toucher au capital', eMo(rIntacte)],
            ['Rente en consommant le capital', eMo(rConso)],
          ],
          note: 'Capitalisation mensuelle ; Monte Carlo log-normal (1 500 tirages). Indicatif.'
        });
      }));
      v.append(sheet); return v;
    },

    /* -------- Capitalisation par classe d'actifs -------- */
    sim_capital() {
      const v = el('div', {}); v.append(hero('SIMULATEUR', 'Capitalisation', SW));
      const sheet = el('div', { class: 'sheet' });
      const presets = { actions: [7, 15], obligations: [2.5, 5.5], immobilier: [4.5, 9], diversifie: [5.5, 10] };
      const cAsset = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Classe d\'actifs')]);
      const assetSel = selectField('k-asset', [['actions', 'Actions (~7 % / vol 15 %)'], ['obligations', 'Obligations (~2,5 % / vol 5,5 %)'], ['immobilier', 'Fonds immobiliers (~4,5 % / vol 9 %)'], ['diversifie', 'Mondial diversifié (~5,5 % / vol 10 %)']], 'actions');
      cAsset.append(assetSel);
      sheet.append(cAsset);
      sheet.append(field('Capital de départ', moneyInput('k-cap', '10000')));
      sheet.append(field('Versement mensuel', moneyInput('k-vers', '200')));
      sheet.append(field('Durée de capitalisation', stepper('k-duree', 20, 1, 60)));
      sheet.append(field('Rendement annuel moyen', pctInput('k-rdt', '7')));
      sheet.append(field('Volatilité annuelle', pctInput('k-vol', '15')));
      // listener attaché au nœud (l'écran n'est pas encore dans le DOM ici)
      assetSel.querySelector('select').addEventListener('change', () => { const p = presets[gvSel('k-asset')]; $('#k-rdt').value = String(p[0]).replace('.', ','); $('#k-vol').value = String(p[1]).replace('.', ','); });
      sheet.append(actions(() => {
        const c0 = gv('k-cap'), vers = gv('k-vers'), dureeY = Math.max(1, Math.round(gv('k-duree'))), rdt = gv('k-rdt') / 100, vol = gv('k-vol') / 100;
        const months = dureeY * 12, volM = vol / Math.sqrt(12), muM = Math.log(1 + rdt / 12) - 0.5 * volM * volM, nbSim = 2000;
        const rng = mulberry32(42), norm = makeNormal(rng);
        const yearly = []; for (let yk = 0; yk <= dureeY; yk++) yearly.push(new Float64Array(nbSim));
        const fin = new Float64Array(nbSim);
        for (let s = 0; s < nbSim; s++) { let c = c0; yearly[0][s] = c; let yi = 1; for (let m = 1; m <= months; m++) { c *= (1 + (Math.exp(muM + volM * norm()) - 1)); c += vers; if (m % 12 === 0 && yi <= dureeY) { yearly[yi][s] = c; yi++; } } fin[s] = c; }
        const P10 = [], P50 = [], P90 = [], ref = [];
        for (let yk = 0; yk <= dureeY; yk++) { const a = Array.from(yearly[yk]).sort((x, y2) => x - y2); P10.push(quantile(a, .1)); P50.push(quantile(a, .5)); P90.push(quantile(a, .9)); ref.push(c0 + vers * yk * 12); }
        const f = Array.from(fin).sort((a, b) => a - b), verse = c0 + vers * months, med = quantile(f, .5);
        simRender(sheet, {
          title: 'Résultats',
          charts: [{ title: 'Capital projeté', draw: cv => fanChart(cv, { P10, P50, P90, ref }), legend: '— médiane · zone P10–P90 · - - total versé' }],
          rows: [
            ['Total versé', e0(verse)],
            ['Pessimiste (P10)', e0(quantile(f, .1))],
            ['Médian (P50)', e0(med)],
            ['Optimiste (P90)', e0(quantile(f, .9))],
            ['Plus-value médiane', e0(med - verse)],
          ],
          note: 'Volatilités historiques indicatives. Les performances passées ne préjugent pas du futur.'
        });
      }));
      v.append(sheet); return v;
    },

    /* -------- Immobilier locatif — TRI -------- */
    sim_immo() { return immoScreen(false); },
    sim_sci() { return immoScreen(true); },

    /* -------- Acheter vs Louer -------- */
    sim_achat() {
      const v = el('div', {}); v.append(hero('SIMULATEUR', 'Acheter vs Louer', SW));
      const sheet = el('div', { class: 'sheet' });
      sheet.append(field('Prix du bien', moneyInput('a-prix', '300000')));
      sheet.append(field('Frais de notaire', pctInput('a-notaire', '8')));
      sheet.append(field('Apport personnel', moneyInput('a-apport', '60000')));
      sheet.append(field('Taux du crédit', pctInput('a-taux', '3')));
      sheet.append(field('Durée du crédit', stepper('a-duree', 20, 1, 40)));
      sheet.append(field('Charges de propriété / an (% du bien)', pctInput('a-charges', '1,5')));
      sheet.append(field('Revalorisation du bien / an', pctInput('a-reval', '2')));
      sheet.append(field('Loyer équivalent / an (% du bien)', pctInput('a-loyer', '4')));
      sheet.append(field('Indexation du loyer (IRL)', pctInput('a-irl', '1,5')));
      sheet.append(field('Rendement du placement', pctInput('a-place', '4')));
      sheet.append(field('Flat tax sur plus-values', pctInput('a-flat', '30')));
      sheet.append(field('Horizon d\'analyse', stepper('a-hor', 25, 1, 40)));
      sheet.append(actions(() => {
        const P = gv('a-prix'), notaire = gv('a-notaire') / 100, apport = gv('a-apport'), taux = gv('a-taux') / 100;
        const duree = Math.max(1, Math.round(gv('a-duree'))), chargesPct = gv('a-charges') / 100, reval = gv('a-reval') / 100;
        const loyerPct = gv('a-loyer') / 100, irl = gv('a-irl') / 100, rdtP = gv('a-place') / 100, flat = gv('a-flat') / 100, horizon = Math.max(1, Math.round(gv('a-hor')));
        const F = P * notaire, loan = Math.max(0, P + F - apport), creditM = duree * 12, rM = taux / 12;
        const pmtM = rM === 0 ? loan / creditM : loan * rM / (1 - Math.pow(1 + rM, -creditM)), rPM = rdtP / 12;
        let bal = loan, renter = apport, renterC = apport; const bW = [P - loan], rW = [apport]; let cross = null;
        for (let m = 1; m <= horizon * 12; m++) {
          const y = Math.ceil(m / 12), loanPay = m <= creditM ? pmtM : 0;
          if (m <= creditM) bal -= (pmtM - bal * rM);
          const chargesM = P * chargesPct * Math.pow(1.015, y - 1) / 12; // charges indexées ~inflation 1,5%/an
          const rentM = P * loyerPct * Math.pow(1 + irl, y - 1) / 12;
          const diff = (loanPay + chargesM) - rentM;
          renter = renter * (1 + rPM) + diff; renterC += diff;
          if (m % 12 === 0) { const pv = P * Math.pow(1 + reval, y); const rn = renter - Math.max(renter - renterC, 0) * flat; const bn = pv - Math.max(bal, 0); bW.push(bn); rW.push(rn); if (cross === null && bn >= rn) cross = y; }
        }
        const buyerH = bW[horizon], renterH = rW[horizon], ecart = buyerH - renterH;
        simRender(sheet, {
          title: 'Résultats',
          charts: [{ title: 'Évolution du patrimoine net', draw: cv => lineChart(cv, { n: horizon + 1, x0: 0, marker: cross, zero: true, euro: true, series: [{ data: bW, color: '#262A41' }, { data: rW, color: '#C9A24B' }] }), legend: '— acheteur · — locataire · - - bascule' }],
          rows: [
            ['Patrimoine acheteur (à ' + horizon + ' ans)', e0(buyerH)],
            ['Patrimoine locataire', e0(renterH)],
            ['Écart (acheteur − locataire)', (ecart >= 0 ? '+' : '') + e0(ecart)],
            ['Année de bascule', cross === null ? 'jamais' : cross + ' ans'],
          ],
          note: 'Cadrage classique : l\'acheteur capitalise le bien (− CRD), le locataire place l\'apport et l\'écart de budget (net de flat tax). Indicatif.'
        });
      }));
      v.append(sheet); return v;
    },

    /* -------- Dutreil -------- */
    sim_dutreil() {
      const v = el('div', {}); v.append(hero('SIMULATEUR', 'Pacte Dutreil', SW));
      const sheet = el('div', { class: 'sheet' });
      sheet.append(field('Valeur de l\'entreprise transmise', moneyInput('d-val', '3000000')));
      sheet.append(field('Nombre de donataires', stepper('d-nb', 2, 1, 20)));
      sheet.append(field('Abattement par donataire', moneyInput('d-abat', '100000')));
      const cP = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Type de transmission')]);
      cP.append(selectField('d-prop', [['pp', 'Pleine propriété'], ['np', 'Nue-propriété (démembrement)']], 'pp'));
      sheet.append(cP);
      sheet.append(field('Âge du donateur', stepper('d-age', 65, 0, 110)));
      sheet.append(field('Âge de l\'usufruitier (si démembrement)', stepper('d-usu', 65, 0, 110)));
      sheet.append(actions(() => {
        const valeur = gv('d-val'), nb = Math.max(1, Math.round(gv('d-nb'))), abat = gv('d-abat'), age = gv('d-age'), prop = gvSel('d-prop'), ageUsu = gv('d-usu');
        const droitsLD = base => { if (base <= 0) return 0; const W = [8072, 4037, 3823, 536392, 350514, 902839, Infinity], R = [.05, .1, .15, .2, .3, .4, .45]; let d = 0, rem = base; for (let i = 0; i < W.length && rem > 0; i++) { const w = Math.min(rem, W[i]); d += w * R[i]; rem -= w; } return d; };
        let coefNP = 1; if (prop === 'np') { const u = ageUsu < 21 ? .9 : ageUsu < 31 ? .8 : ageUsu < 41 ? .7 : ageUsu < 51 ? .6 : ageUsu < 61 ? .5 : ageUsu < 71 ? .4 : ageUsu < 81 ? .3 : ageUsu < 91 ? .2 : .1; coefNP = 1 - u; }
        const reduc50 = prop === 'pp' && age < 70;
        const part = valeur * coefNP / nb;
        let dD = droitsLD(Math.max(0, part * 0.25 - abat)); if (reduc50) dD *= 0.5;
        const dS = droitsLD(Math.max(0, part - abat));
        const droitsD = dD * nb, droitsS = dS * nb;
        simRender(sheet, {
          title: 'Résultats',
          rows: [
            ['Valeur transmise' + (coefNP < 1 ? ' (nue-propriété ' + Math.round(coefNP * 100) + ' %)' : ''), e0(valeur * coefNP)],
            ['Exonération Dutreil (75 %)', '– ' + e0(valeur * coefNP * 0.75)],
            ['Droits avec Dutreil' + (reduc50 ? ' (− réduction 50 %)' : ''), e0(droitsD)],
            ['Droits sans Dutreil', e0(droitsS)],
            ['Taux effectif (avec Dutreil)', p2(valeur > 0 ? droitsD / valeur * 100 : 0)],
          ],
          total: ['Économie réalisée', e0(droitsS - droitsD)],
          note: 'Art. 787 B CGI — exonération 75 % ; réduction 50 % si pleine propriété et donateur < 70 ans. Barème en ligne directe, abattement 100 000 €/enfant. Indicatif.'
        });
      }));
      v.append(sheet); return v;
    },

    /* -------- Apport-cession 150-0 B ter -------- */
    sim_apport() {
      const v = el('div', {}); v.append(hero('SIMULATEUR', 'Apport-cession', SW));
      const sheet = el('div', { class: 'sheet' });
      sheet.append(field('Valeur des titres apportés', moneyInput('ap-val', '2000000')));
      sheet.append(field('Prix de revient des titres', moneyInput('ap-prix', '200000')));
      sheet.append(field('Taux d\'imposition de la plus-value', pctInput('ap-taux', '30')));
      const cC = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Cession par la holding')]);
      cC.append(selectField('ap-cess', [['apres3', 'Après 3 ans (report maintenu)'], ['avant3', 'Avant 3 ans (réinvestissement requis)'], ['jamais', 'Conservation longue']], 'apres3'));
      sheet.append(cC);
      sheet.append(field('Part du produit réinvestie (si < 3 ans)', pctInput('ap-reinv', '70')));
      sheet.append(field('Horizon de placement', stepper('ap-hor', 10, 1, 40)));
      sheet.append(field('Rendement annuel du placement', pctInput('ap-rdt', '4')));
      sheet.append(actions(() => {
        const valeur = gv('ap-val'), prix = gv('ap-prix'), taux = gv('ap-taux') / 100, cession = gvSel('ap-cess'), reinvest = gv('ap-reinv') / 100, horizon = Math.max(1, Math.round(gv('ap-hor'))), r = gv('ap-rdt') / 100;
        const pv = Math.max(0, valeur - prix), impotPV = pv * taux;
        let reportMaintenu = true, statut = '';
        if (cession === 'avant3') { if (reinvest >= 0.70) statut = 'Report maintenu (réinvestissement ≥ 70 %).'; else { reportMaintenu = false; statut = 'Report caduc : réinvestissement < 70 % (LF 2026). Impôt exigible.'; } }
        else if (cession === 'apres3') statut = 'Cession après 3 ans : report maintenu, aucun réinvestissement requis.';
        else statut = 'Conservation : report maintenu jusqu\'à un évènement ultérieur.';
        const finalDirect = (valeur - impotPV) * Math.pow(1 + r, horizon);
        const finalApport = reportMaintenu ? valeur * Math.pow(1 + r, horizon) - impotPV : (valeur - impotPV) * Math.pow(1 + r, horizon);
        const gain = finalApport - finalDirect;
        simRender(sheet, {
          title: 'Résultats',
          rows: [
            ['Plus-value en report', e0(pv)],
            ['Impôt différé', e0(impotPV)],
            ['Réinvestissement minimal (70 %)', e0(valeur * 0.70)],
            ['Capital net — apport-cession', e0(finalApport)],
            ['Capital net — cession directe', e0(finalDirect)],
          ],
          total: ['Gain de l\'apport-cession', (gain >= 0 ? '+' : '') + e0(gain)],
          note: statut + ' Art. 150-0 B ter — LF 2026 : remploi 70 %, réinvestissement sous 3 ans, conservation 5 ans. Indicatif.'
        });
      }));
      v.append(sheet); return v;
    },
  });

  /* ---------- écran immobilier / SCI (factorisé) ---------- */
  function immoScreen(compare) {
    const v = el('div', {});
    v.append(hero('SIMULATEUR', compare ? 'SCI à l\'IS vs IR' : 'Immobilier — TRI', SW));
    const sheet = el('div', { class: 'sheet' });
    const pfx = compare ? 's' : 'm';
    if (!compare) {
      const cR = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Régime fiscal')]);
      cR.append(selectField(pfx + '-reg', [['rf', 'Revenus fonciers (réel)'], ['deficit', 'Déficit foncier'], ['lmnp', 'LMNP (amortissement)'], ['lmp', 'LMP'], ['sci_is', 'SCI à l\'IS'], ['malraux', 'Malraux'], ['mh', 'Monument historique']], 'rf'));
      sheet.append(cR);
    }
    sheet.append(field('Prix du bien (frais inclus)', moneyInput(pfx + '-prix', compare ? '600000' : '300000')));
    sheet.append(field('Rendement locatif brut', pctInput(pfx + '-rdt', compare ? '8' : '3,5')));
    sheet.append(field('Indexation du loyer (IRL)', pctInput(pfx + '-irl', '1')));
    sheet.append(field('Revalorisation du bien / an', pctInput(pfx + '-reval', '1')));
    sheet.append(field('Capital emprunté', moneyInput(pfx + '-emp', compare ? '550000' : '300000')));
    sheet.append(field('Taux d\'emprunt', pctInput(pfx + '-taux', compare ? '3' : '2')));
    sheet.append(field('Durée du crédit', stepper(pfx + '-dc', 20, 1, 40)));
    sheet.append(field('Durée de détention', stepper(pfx + '-hold', 20, 1, 40)));
    sheet.append(field('Taxe foncière annuelle', moneyInput(pfx + '-tf', compare ? '4000' : '875')));
    sheet.append(field('Frais de gestion (% du loyer)', pctInput(pfx + '-gest', compare ? '6' : '12')));
    sheet.append(field('Travaux / an (% du loyer)', pctInput(pfx + '-trav', '0')));
    sheet.append(field('Assurance PNO annuelle', moneyInput(pfx + '-pno', compare ? '1200' : '150')));
    const cT = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'TMI (régime IR)')]);
    cT.append(selectField(pfx + '-tmi', TMI_OPTS, compare ? '30' : '41')); sheet.append(cT);
    sheet.append(field('Prélèvements sociaux', pctInput(pfx + '-ps', compare ? '17' : '17,2')));
    sheet.append(field('Amortissement immobilier (durée, IS/LMNP)', stepper(pfx + '-am', 30, 1, 50)));

    sheet.append(actions(() => {
      const P = {
        prix: gv(pfx + '-prix'), rdt: gv(pfx + '-rdt') / 100, irl: gv(pfx + '-irl') / 100, reval: gv(pfx + '-reval') / 100,
        emp: gv(pfx + '-emp'), taux: gv(pfx + '-taux') / 100, dc: Math.max(1, Math.round(gv(pfx + '-dc'))), hold: Math.max(1, Math.round(gv(pfx + '-hold'))),
        tf: gv(pfx + '-tf'), gest: gv(pfx + '-gest') / 100, trav: gv(pfx + '-trav') / 100, pno: gv(pfx + '-pno'),
        tmi: gv(pfx + '-tmi') / 100, ps: gv(pfx + '-ps') / 100, amDuree: Math.max(1, Math.round(gv(pfx + '-am')))
      };
      if (!compare) {
        const reg = gvSel(pfx + '-reg'), R = immoScenario(P, reg, P.hold);
        simRender(sheet, {
          title: 'Résultats',
          rows: [
            ['TRI du projet', R.tri === null ? 'n/a' : p2(R.tri * 100)],
            ['Effort d\'épargne moyen', eMo(R.effort)],
            ['Valeur nette à la revente', e0(R.saleNet)],
            ['Plus-value brute', e0(R.gainBrut)],
            ['Impôt sur la plus-value', e0(R.pvTax)],
          ],
          total: ['Gain net total', e0(R.gainNet)],
          note: 'Loyers indexés IRL, charges réelles déductibles, plus-value selon le régime. Indicatif, hors cas particuliers.'
        });
      } else {
        const IR = immoScenario(P, 'rf', P.hold), IS = immoScenario(P, 'sci_is', P.hold);
        const maxY = Math.min(30, Math.max(P.hold, P.dc + 5, 20)); const tIR = [], tIS = [];
        for (let y = 1; y <= maxY; y++) { tIR.push((immoScenario(P, 'rf', y).tri || 0) * 100); tIS.push((immoScenario(P, 'sci_is', y).tri || 0) * 100); }
        const better = IS.gainNet >= IR.gainNet ? 'IS' : 'IR';
        simRender(sheet, {
          title: 'Comparaison (IR / IS)',
          charts: [{ title: 'TRI selon l\'année de cession', draw: cv => lineChart(cv, { n: maxY + 1, x0: 1, marker: P.hold, zero: false, euro: false, series: [{ data: [0].concat(tIR), color: '#262A41' }, { data: [0].concat(tIS), color: '#C9A24B' }] }), legend: '— SCI à l\'IR · — SCI à l\'IS · - - détention retenue' }],
          rows: [
            ['TRI (IR / IS)', (IR.tri === null ? 'n/a' : p2(IR.tri * 100)) + '  /  ' + (IS.tri === null ? 'n/a' : p2(IS.tri * 100))],
            ['Effort mensuel (IR / IS)', e0(IR.effort) + ' / ' + e0(IS.effort)],
            ['Valeur revente (IR / IS)', e0(IR.saleNet) + ' / ' + e0(IS.saleNet)],
            ['Gain net (IR / IS)', e0(IR.gainNet) + ' / ' + e0(IS.gainNet)],
          ],
          total: ['Régime le plus favorable', 'SCI à l\'' + better + '  (+' + e0(Math.abs(IS.gainNet - IR.gainNet)) + ')'],
          note: 'IR : résultat foncier × (TMI+PS), plus-value particuliers. IS : amortissement, IS 15/25 %, plus-value sur valeur nette comptable. Indicatif.'
        });
      }
    }));
    v.append(sheet); return v;
  }

  /* ---------- moteur immobilier (un régime, durée variable) ---------- */
  function immoScenario(P, regime, holdY) {
    const loyerBase = P.prix * P.rdt, assurEmp = 0;
    const rM = P.taux / 12, nM = P.dc * 12;
    const pmtM = rM === 0 ? P.emp / nM : P.emp * rM / (1 - Math.pow(1 + rM, -nM)), annuite = pmtM * 12;
    let bal = P.emp; const intM = [], balM = [];
    for (let m = 1; m <= nM; m++) { const i = bal * rM; bal -= pmtM - i; intM.push(i); balM.push(Math.max(bal, 0)); }
    const yint = y => { let s = 0; for (let m = (y - 1) * 12; m < y * 12 && m < nM; m++) s += intM[m]; return s; };
    const crd = y => { const idx = Math.min(y * 12, nM) - 1; return idx >= 0 ? balM[idx] : P.emp; };
    const loyerY = y => loyerBase * Math.pow(1 + P.irl, y - 1);
    const chExplY = y => { const lo = loyerY(y); return P.tf * Math.pow(1.01, y - 1) + P.pno * Math.pow(1.01, y - 1) + lo * (P.gest + P.trav) + assurEmp; };
    const amImmo = P.prix * 0.8 / P.amDuree, isSeuil = 42500, isReduit = 0.15, isTaux = 0.25;
    const isOn = x => x <= 0 ? 0 : Math.min(x, isSeuil) * isReduit + Math.max(x - isSeuil, 0) * isTaux;
    let stock = 0, cumAm = 0, cumAmLoc = 0, amStock = 0, deficitRep = 0;
    const apport = Math.max(P.prix - P.emp, 0);
    const cf = [-apport]; let somE = 0, saleNet = 0, gainBrut = 0, pvTax = 0;
    for (let y = 1; y <= holdY; y++) {
      const annY = y <= P.dc ? annuite : 0, loyer = loyerY(y), chExpl = chExplY(y), interets = yint(y);
      const resFonc = loyer - chExpl - interets; let impot = 0, sciBase = 0;
      if (regime === 'rf') impot = -resFonc * (P.tmi + P.ps);
      else if (regime === 'malraux') impot = -resFonc * (P.tmi + P.ps) + (y <= 3 ? P.prix * 0.5 * 0.30 / 3 : 0);
      else if (regime === 'deficit') {
        // intérêts d'emprunt imputables UNIQUEMENT sur les revenus fonciers ;
        // déficit "autres charges" imputable sur le revenu global, plafonné à 10 700 €.
        const trav = y <= 3 ? P.prix * 0.15 / 3 : 0;
        const chargesHorsInt = chExpl + trav;
        const res = loyer - interets - chargesHorsInt;
        if (res >= 0) { const ep = Math.min(deficitRep, res); deficitRep -= ep; impot = -(res - ep) * (P.tmi + P.ps); }
        else {
          const deficitInteret = Math.max(0, interets - loyer);             // intérêts non couverts -> report foncier seul
          const revenuApresInt = Math.max(0, loyer - interets);
          const deficitAutres = Math.max(0, chargesHorsInt - revenuApresInt); // autres charges -> revenu global
          const imputRG = Math.min(deficitAutres, 10700);
          impot = imputRG * P.tmi;                                          // économie d'impôt (revenu global, sans PS)
          deficitRep += (deficitAutres - imputRG) + deficitInteret;
        }
      } else if (regime === 'mh') { const trav = y <= 3 ? P.prix * 0.15 / 3 : 0; impot = -(resFonc - trav) * P.tmi; }
      else if (regime === 'lmnp' || regime === 'lmp') {
        // BIC : l'amortissement ne peut pas créer de déficit (excédent reporté en amortissements différés)
        const am = amImmo + P.prix * 0.05 / 10;
        const rAvAm = loyer - chExpl - interets;        // résultat avant amortissement
        if (rAvAm < 0) { stock += -rAvAm; impot = 0; }   // déficit BIC (hors amort) reportable
        else {
          let base = rAvAm;
          const epD = Math.min(stock, base); stock -= epD; base -= epD;     // imputation déficits BIC antérieurs
          const amDispo = am + amStock, amUtil = Math.min(amDispo, base);    // amort. limité au résultat
          amStock = amDispo - amUtil; cumAmLoc += amUtil;                    // excédent reporté ; cumul réellement déduit
          impot = -(base - amUtil) * (P.tmi + P.ps);
        }
      }
      else if (regime === 'sci_is') {
        cumAm += amImmo; let r2 = loyer - chExpl - interets - amImmo;
        if (r2 < 0) { stock += -r2; impot = 0; }
        else { const ep = Math.min(stock, r2); stock -= ep; r2 -= ep; sciBase = r2; impot = -isOn(r2); }
      }
      let net = (loyer - chExpl - annY) + impot; somE += -net;
      if (y === holdY) {
        const sv = P.prix * Math.pow(1 + P.reval, holdY);
        if (regime === 'sci_is') {
          const vnc = Math.max(P.prix - cumAm, 0); gainBrut = Math.max(sv - vnc, 0);
          pvTax = isOn(sciBase + gainBrut) - isOn(sciBase);                  // PV imposée en partageant le seuil 15% de l'année
        } else if (regime === 'lmp') {
          // plus-value professionnelle : court terme (amortissements déduits) au barème ; long terme (appréciation) au PFU 30%
          const pvCT = cumAmLoc, pvLT = Math.max(sv - P.prix, 0);
          gainBrut = pvCT + pvLT;
          pvTax = pvCT * (P.tmi + P.ps) + pvLT * 0.30;
        } else if (regime === 'lmnp') {
          // LF 2025 : réintégration des amortissements déduits dans la plus-value des particuliers
          gainBrut = Math.max(sv - P.prix + cumAmLoc, 0);
          pvTax = gainBrut > 0 ? gainBrut * (1 - abIR(holdY)) * 0.19 + gainBrut * (1 - abPS(holdY)) * 0.172 : 0;
        } else {
          gainBrut = Math.max(sv - P.prix, 0);
          pvTax = gainBrut > 0 ? gainBrut * (1 - abIR(holdY)) * 0.19 + gainBrut * (1 - abPS(holdY)) * 0.172 : 0;
        }
        saleNet = sv - crd(holdY) - pvTax; net += saleNet;
      }
      cf.push(net);
    }
    return { tri: irr(cf), effort: somE / holdY / 12, saleNet, gainBrut, pvTax, gainNet: cf.reduce((a, c) => a + c, 0) };
  }

  /* -------- Écran : Profil conseiller -------- */
  Object.assign(Screens, {
    profil() {
      const v = el('div', {}); v.append(hero('MON ESPACE', 'Profil conseiller'));
      const sheet = el('div', { class: 'sheet' });
      const p = Profile.get();
      sheet.append(el('div', { class: 'hint', style: 'margin:0 2px 16px' }, 'Ces informations et votre logo apparaissent en en-tête de vos exports PDF et Excel.'));

      // logo
      const logoCard = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Mon logo')]);
      const prev = el('div', { id: 'pf-prev', style: 'min-height:64px;display:flex;align-items:center;justify-content:center;background:var(--field);border:1.5px dashed var(--line);border-radius:18px;padding:12px;margin-bottom:12px' });
      prev.innerHTML = p.logo ? '<img src="' + p.logo + '" style="max-height:90px;max-width:100%">' : '<span class="hint" style="margin:0">Aucun logo importé</span>';
      if (p.logo) prev.dataset.logo = p.logo;
      const file = el('input', { type: 'file', accept: 'image/*', id: 'pf-file', style: 'display:none' });
      file.addEventListener('change', () => {
        const f = file.files[0]; if (!f) return;
        if (f.size > 1.5 * 1024 * 1024) { toast('Image trop lourde (max 1,5 Mo)'); return; }
        const rd = new FileReader(); rd.onload = () => { prev.innerHTML = '<img src="' + rd.result + '" style="max-height:90px;max-width:100%">'; prev.dataset.logo = rd.result; }; rd.readAsDataURL(f);
      });
      const up = el('button', { class: 'btn-ghost', type: 'button', style: 'margin:0', onclick: () => file.click() }, 'Choisir une image…');
      const rm = el('button', { class: 'btn-ghost', type: 'button', style: 'margin-top:8px', onclick: () => { prev.innerHTML = '<span class="hint" style="margin:0">Aucun logo importé</span>'; prev.dataset.logo = ''; } }, 'Retirer le logo');
      logoCard.append(prev, file, up, rm);
      sheet.append(logoCard);

      sheet.append(field('Cabinet / société', textInput('pf-cabinet', p.cabinet, 'Ex. Cabinet Durand Patrimoine')));
      sheet.append(field('Nom du conseiller', textInput('pf-conseiller', p.conseiller, 'Ex. Marie Durand')));
      sheet.append(field('Téléphone', textInput('pf-tel', p.tel, 'Ex. 06 12 34 56 78')));
      sheet.append(field('Adresse e-mail', textInput('pf-email', p.email, 'Ex. contact@cabinet.fr')));
      sheet.append(field('Adresse postale', textInput('pf-adresse', p.adresse, 'Ex. 12 rue de la Paix, 75002 Paris')));

      const save = el('button', { class: 'btn-primary', type: 'button', style: 'margin-top:6px' }, 'Enregistrer mon profil');
      save.onclick = () => {
        Profile.set({
          logo: prev.dataset.logo || '',
          cabinet: $('#pf-cabinet').value.trim(), conseiller: $('#pf-conseiller').value.trim(),
          tel: $('#pf-tel').value.trim(), email: $('#pf-email').value.trim(), adresse: $('#pf-adresse').value.trim()
        });
        toast('Profil enregistré'); Router.back();
      };
      const acts = el('div', { class: 'actions' }); acts.append(save);
      acts.append(el('button', { class: 'btn-ghost', type: 'button', onclick: () => Router.back() }, 'Annuler'));
      sheet.append(acts);
      v.append(sheet); return v;
    }
  });

})();
