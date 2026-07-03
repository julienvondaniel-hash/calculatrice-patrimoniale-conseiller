/* ============================================================
   Calculatrice Patrimoniale — logique applicative
   ============================================================ */
'use strict';

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, props = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') n.className = props[k];
    else if (k === 'html') n.innerHTML = props[k];
    else if (k.startsWith('on') && typeof props[k] === 'function') n.addEventListener(k.slice(2), props[k]);
    else if (props[k] != null) n.setAttribute(k, props[k]);
  }
  (Array.isArray(kids) ? kids : [kids]).forEach(c => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
  return n;
};
const eur = n => isFinite(n) ? n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }) : '—';
const pct = n => isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' %' : '—';
const num = v => { const x = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : 0; };

let TOAST_T;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(TOAST_T); TOAST_T = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============================================================
   AUTHENTIFICATION
   - Si Supabase est configuré -> vrais comptes serveur
   - Sinon -> mode démo local (localStorage)
   ============================================================ */
const cfg = window.APP_CONFIG || {};
const SUPA_ON = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
let supa = null;

const Auth = {
  mode: 'login', // 'login' | 'signup'
  async init() {
    if (SUPA_ON) {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js')
        .catch(() => { /* fallback démo si CDN bloqué */ });
      if (window.supabase) {
        supa = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        supa.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') Auth.showResetForm(); });
        if (location.hash.includes('type=recovery')) { this.renderConfigNote(); showAuth(); return; }
        const { data } = await supa.auth.getSession();
        if (data && data.session) return this.onSignedIn(data.session.user);
      }
    }
    this.renderConfigNote();
    showAuth();
  },
  renderConfigNote() {
    const note = $('#auth-config-note');
    if (SUPA_ON && supa) note.innerHTML = 'Comptes sécurisés · serveur connecté';
    else note.innerHTML = 'Mode démo local — les comptes sont enregistrés sur cet appareil.<br>Renseigne <code>config.js</code> pour activer les vrais comptes serveur.';
  },
  toggleMode() {
    this.mode = this.mode === 'login' ? 'signup' : 'login';
    const signup = this.mode === 'signup';
    $('#auth-title').textContent = signup ? 'Créer un compte' : 'Connexion';
    $('#auth-sub').textContent = signup ? 'Quelques secondes suffisent' : 'Accédez à vos calculatrices patrimoniales';
    $('#auth-submit').textContent = signup ? "S'inscrire" : 'Se connecter';
    $('#auth-switch-text').textContent = signup ? 'Déjà inscrit ?' : 'Pas encore de compte ?';
    $('#auth-switch-link').textContent = signup ? 'Se connecter' : 'Créer un compte';
    $('#name-field').style.display = signup ? 'block' : 'none';
    $('#auth-pass').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    this.err('');
  },
  err(msg) {
    const box = $('#auth-error');
    if (!msg) { box.classList.add('hidden'); return; }
    box.textContent = msg; box.classList.remove('hidden');
  },
  async submit() {
    const email = $('#auth-email').value.trim().toLowerCase();
    const pass = $('#auth-pass').value;
    const name = $('#auth-name').value.trim();
    this.err('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return this.err('Adresse e-mail invalide.');
    if (pass.length < 6) return this.err('Le mot de passe doit faire au moins 6 caractères.');

    const btn = $('#auth-submit'); const original = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true;
    try {
      if (SUPA_ON && supa) await this.supaAuth(email, pass, name);
      else await this.demoAuth(email, pass, name);
    } catch (e) {
      this.err(e.message || 'Une erreur est survenue.');
    } finally {
      btn.textContent = original; btn.disabled = false;
    }
  },
  async supaAuth(email, pass, name) {
    if (this.mode === 'signup') {
      const { data, error } = await supa.auth.signUp({ email, password: pass, options: { data: { name } } });
      if (error) throw new Error(this.frError(error.message));
      if (data.user && !data.session) { toast('Vérifie ta boîte mail pour confirmer.'); return; }
      this.onSignedIn(data.user);
    } else {
      const { data, error } = await supa.auth.signInWithPassword({ email, password: pass });
      if (error) throw new Error(this.frError(error.message));
      this.onSignedIn(data.user);
    }
  },
  async demoAuth(email, pass, name) {
    const KEY = 'pat_demo_users';
    const users = JSON.parse(localStorage.getItem(KEY) || '{}');
    const hash = await sha256(pass + '::' + email);
    if (this.mode === 'signup') {
      if (users[email]) throw new Error('Un compte existe déjà avec cet e-mail.');
      users[email] = { hash, name: name || email.split('@')[0] };
      localStorage.setItem(KEY, JSON.stringify(users));
      this.onSignedIn({ email, user_metadata: { name: users[email].name } });
    } else {
      const u = users[email];
      if (!u || u.hash !== hash) throw new Error('E-mail ou mot de passe incorrect.');
      this.onSignedIn({ email, user_metadata: { name: u.name } });
    }
  },
  frError(m, err) {
    m = (m == null ? '' : String(m));
    if ((m === '' || m === '{}' || m === '[object Object]') && err && err.status) m = 'status ' + err.status;
    if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail.';
    if (/Invalid login/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Confirme ton adresse e-mail avant de te connecter.';
    if (/rate limit|429|too many/i.test(m)) return 'Trop de demandes en peu de temps. Patiente quelques minutes puis réessaie.';
    if (/sending|smtp|recovery email|status 5|unexpected/i.test(m)) return "L'e-mail n'a pas pu être envoyé. Avec le domaine de test Resend, seul l'e-mail du compte Resend peut recevoir ; vérifie ton domaine pour écrire à tous.";
    return m || "Une erreur s'est produite. Réessaie dans un instant.";
  },
  async onSignedIn(user) {
    State.user = user;
    const billing = await Billing.gate(user);
    State.billing = billing;
    showMain();
    const nav = document.querySelector('.bottomnav');
    if (billing.allowed) { if (nav) nav.style.display = ''; State.locked = false; Router.reset('home'); }
    else { if (nav) nav.style.display = 'none'; State.locked = true; Router.reset('paywall'); }
  },
  async forgot() {
    const email = $('#auth-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return this.err('Saisis ton adresse e-mail ci-dessus, puis clique sur « Mot de passe oublié ».');
    if (SUPA_ON && supa) {
      const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) return this.err(this.frError(error.message, error));
      this.err(''); toast('E-mail de réinitialisation envoyé. Vérifie ta boîte mail.');
    } else {
      this.err('La réinitialisation par e-mail nécessite les comptes serveur (Supabase). En mode démo, recrée simplement un compte.');
    }
  },
  async showResetForm() {
    const pass = prompt('Choisis un nouveau mot de passe (6 caractères minimum) :');
    if (!pass) return;
    if (pass.length < 6) { toast('Mot de passe trop court (min. 6).'); return; }
    const { error } = await supa.auth.updateUser({ password: pass });
    if (error) { toast('Erreur : ' + error.message); return; }
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    toast('Mot de passe mis à jour.');
  },
  async signOut() {
    if (SUPA_ON && supa) await supa.auth.signOut();
    State.user = null;
    showMain(false);
    showAuth();
  }
};

const Billing = {
  days() { return (cfg.TRIAL_DAYS || 30); },
  compute(p) {
    const now = Date.now();
    if (p.subscription_status === 'active' && p.current_period_end && new Date(p.current_period_end).getTime() > now)
      return { allowed: true, state: 'active', plan: (p.plan || 'all'), periodEnd: p.current_period_end };
    const start = new Date(p.trial_start || now).getTime();
    const daysLeft = Math.ceil((start + this.days() * 86400000 - now) / 86400000);
    if (daysLeft > 0) return { allowed: true, state: 'trial', plan: 'all', daysLeft };
    return { allowed: false, state: 'expired', plan: null, daysLeft: 0 };
  },
  allows(simKey) {
    const plan = (State.billing && State.billing.plan) || 'all';
    if (plan === 'all') return true;
    return ['sim', 'sim_immo', 'sim_sci', 'sim_achat', 'sim_saved'].includes(simKey);
  },
  async ensureAndGet(user) {
    if (SUPA_ON && supa) {
      let { data: prof } = await supa.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (!prof) { const r = await supa.from('profiles').insert({ id: user.id, email: user.email }).select().maybeSingle(); prof = r.data || { trial_start: new Date().toISOString(), subscription_status: 'trial' }; }
      return this.compute(prof);
    }
    const KEY = 'mkp_trial_' + (user.email || 'demo');
    let ts = localStorage.getItem(KEY); if (!ts) { ts = new Date().toISOString(); localStorage.setItem(KEY, ts); }
    const k = user.email || 'demo';
    const sub = localStorage.getItem('mkp_sub_' + k) === 'active';
    return this.compute({ trial_start: ts, subscription_status: sub ? 'active' : 'trial', plan: localStorage.getItem('mkp_plan_' + k) || 'all', current_period_end: sub ? new Date(Date.now() + 30 * 86400000).toISOString() : null });
  },
  async gate(user) { try { return await this.ensureAndGet(user); } catch (e) { return { allowed: true, state: 'trial', daysLeft: this.days() }; } },
  checkout(plan) {
    const link = plan === 'immo' ? cfg.STRIPE_LINK_IMMO : cfg.STRIPE_LINK_ALL, u = State.user;
    if (link) { const sep = link.includes('?') ? '&' : '?'; location.href = link + sep + 'client_reference_id=' + encodeURIComponent(u ? (u.id || u.email) : '') + (u && u.email ? '&prefilled_email=' + encodeURIComponent(u.email) : ''); }
    else if (!(SUPA_ON && supa)) { const k = (u && u.email) || 'demo'; localStorage.setItem('mkp_sub_' + k, 'active'); localStorage.setItem('mkp_plan_' + k, plan); toast('Abonnement activé (démo)'); this.refresh(); }
    else { toast('Lien de paiement non configuré (config.js).'); }
  },
  async refresh() { const b = await this.gate(State.user); State.billing = b; const nav = document.querySelector('.bottomnav'); if (b.allowed) { if (nav) nav.style.display = ''; State.locked = false; Router.reset('home'); } else { if (nav) nav.style.display = 'none'; Router.reset('paywall'); } }
};

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s);
  });
}
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function showAuth() { $('#screen-auth').classList.remove('hidden'); $('#screen-main').classList.add('hidden'); }
function showMain(show = true) {
  if (show) { $('#screen-auth').classList.add('hidden'); $('#screen-main').classList.remove('hidden'); }
  else { $('#screen-main').classList.add('hidden'); }
}

/* ---------- App state ---------- */
const State = { user: null };

/* ============================================================
   MOTEUR DE CALCUL  (barèmes France 2025)
   ============================================================ */
const Calc = {

  /* ---- 990 I : primes versées avant 70 ans, après 13/10/1998 ----
     Abattement 152 500 € / bénéficiaire ; 20% jusqu'à 700 000 € de
     part taxable, 31,25% au-delà ; vie-génération : abattement -20%
     d'assiette appliqué AVANT l'abattement de 152 500 €. */
  art990I({ capital, beneficiaires, abattement = 152500, vieGeneration = false }) {
    const list = (beneficiaires && beneficiaires.length) ? beneficiaires : [{ capital: capital || 0 }];
    const multi = list.length > 1;
    const rows = [];
    let totalCap = 0, totalTax = 0;
    list.forEach((b, i) => {
      const cap = b.capital || 0;
      const base = vieGeneration ? cap * 0.80 : cap;
      const afterAbat = Math.max(0, base - abattement);
      const t20 = Math.min(afterAbat, 700000);
      const t31 = Math.max(0, afterAbat - 700000);
      const tax = t20 * 0.20 + t31 * 0.3125;
      totalCap += cap; totalTax += tax;
      const pfx = multi ? '  ' : '';
      if (multi) rows.push(['Bénéficiaire ' + (i + 1), '']);
      rows.push([pfx + 'Capitaux versés', eur(cap)]);
      if (vieGeneration) rows.push([pfx + 'Abattement vie-génération (20%)', '– ' + eur(cap * 0.20)]);
      rows.push([pfx + 'Abattement', '– ' + eur(abattement)]);
      rows.push([pfx + 'Assiette taxable', eur(afterAbat)]);
      rows.push([pfx + 'Taxe 20% (≤ 700 000 €)', eur(t20 * 0.20)]);
      if (t31 > 0) rows.push([pfx + 'Taxe 31,25% (> 700 000 €)', eur(t31 * 0.3125)]);
    });
    return {
      rows,
      total: ['Prélèvement total', eur(totalTax)],
      net: ['Net transmis ' + (multi ? 'aux bénéficiaires' : 'au bénéficiaire'), eur(totalCap - totalTax)],
      note: "Art. 990 I CGI — abattement de 152 500 € PAR bénéficiaire ; 20% jusqu'à 700 000 € de part taxable puis 31,25%, appliqués par bénéficiaire. Primes versées avant 70 ans et après le 13/10/1998. Hors prélèvements sociaux (17,2%)."
    };
  },

  /* ---- 757 B : primes versées après 70 ans ----
     Seules les PRIMES (hors intérêts) sont taxables, après un
     abattement GLOBAL de 30 500 € réparti entre bénéficiaires,
     puis barème des droits de succession selon le lien de parenté. */
  art757B({ beneficiaires }) {
    const totalPrimes = beneficiaires.reduce((s, b) => s + b.capital, 0);
    const abatGlobal = 30500;
    const rows = [['Total des capitaux transmis (primes)', eur(totalPrimes)], ['Abattement global', '– ' + eur(abatGlobal)]];
    const taxableGlobal = Math.max(0, totalPrimes - abatGlobal);
    let taxTotal = 0;
    beneficiaires.forEach((b, i) => {
      const part = totalPrimes > 0 ? b.capital / totalPrimes : 0;
      const taxableB = taxableGlobal * part;
      const tax = bareme777(taxableB, b.lien);
      taxTotal += tax;
      rows.push([`Bénéf. ${i + 1} (${LIENS[b.lien]}) — part taxable`, eur(taxableB)]);
      rows.push([`Bénéf. ${i + 1} — droits dus`, eur(tax)]);
    });
    return {
      rows,
      total: ['Droits de succession totaux', eur(taxTotal)],
      net: ['Net transmis', eur(totalPrimes - taxTotal)],
      note: "Art. 757 B CGI — primes versées après 70 ans. Seules les primes sont taxées (les intérêts sont exonérés). Abattement global de 30 500 € puis barème des droits de succession (art. 777)."
    };
  },

  /* ---- Règles générales : exonérations selon dates ---- */
  reglesGenerales({ souscription, primesAvant1998 }) {
    let txt;
    if (souscription === 'avant') {
      txt = "Contrat souscrit AVANT le 20/11/1991 : exonération totale des capitaux transmis pour les primes versées avant le 13/10/1998 (quel que soit l'âge). Les primes versées après le 13/10/1998 relèvent de l'art. 990 I.";
    } else {
      txt = "Contrat souscrit APRÈS le 20/11/1991 : régime selon l'âge de l'assuré au versement — art. 990 I (avant 70 ans) ou art. 757 B (après 70 ans), avec exonération des primes versées avant le 13/10/1998.";
    }
    return { info: txt };
  },

  /* ---- Fiscalité du RACHAT ----
     Produits = rachat brut × (part produits). Ici on raisonne sur
     l'assiette de produits saisie. Options : PFL (avant 8 ans) ou
     PFU 12,8%/7,5% + abattement annuel après 8 ans. */
  rachat({ duree, produits, tmi, situation, abattementUtilise = true, primesApres2017 }) {
    const abat = situation === 'couple' ? 9200 : 4600;
    const rows = [];
    let impot;
    if (duree >= 8) {
      const abattement = abattementUtilise ? Math.min(produits, abat) : 0;
      const taxable = Math.max(0, produits - abattement);
      // après 27/09/2017 : 7,5% (jusqu'à 150k€ de primes) sinon 12,8% — simplifié à 7,5%
      const tauxPFU = primesApres2017 ? 0.075 : 0.075;
      impot = taxable * tauxPFU;
      rows.push(['Produits imposables', eur(produits)]);
      rows.push([`Abattement annuel (${situation === 'couple' ? 'couple' : 'seul'})`, '– ' + eur(abattement)]);
      rows.push(['Assiette taxable', eur(taxable)]);
      rows.push(['Prélèvement (7,5%)', eur(impot)]);
    } else {
      // avant 8 ans : PFU 12,8% (ou PFL historique selon ancienneté). On retient le PFU.
      const tauxPFU = 0.128;
      impot = produits * tauxPFU;
      rows.push(['Produits imposables', eur(produits)]);
      rows.push(['Prélèvement forfaitaire (12,8%)', eur(impot)]);
      if (tmi > 0) {
        const altIR = produits * (tmi / 100);
        rows.push([`Option barème IR (TMI ${tmi}%)`, eur(altIR)]);
      }
    }
    const ps = produits * 0.172;
    rows.push(['Prélèvements sociaux (17,2%)', eur(ps)]);
    return {
      rows,
      total: ['Imposition totale (IR + PS)', eur(impot + ps)],
      net: ['Produits nets perçus', eur(produits - impot - ps)],
      note: "Estimation. Avant 8 ans : PFU 12,8%. Après 8 ans : 7,5% après abattement annuel (4 600 € seul / 9 200 € couple) pour la fraction de primes ≤ 150 000 €, 12,8% au-delà. Prélèvements sociaux 17,2%."
    };
  },

  /* ---- Intérêts simples ---- */
  interetsSimples({ capital, taux, jours, base }) {
    const interets = capital * (taux / 100) * (jours / base);
    return {
      rows: [
        ['Capital placé', eur(capital)],
        ['Taux annuel', pct(taux)],
        ['Durée', `${jours} jours / ${base}`],
        ['Intérêts', eur(interets)],
      ],
      total: ['Valeur acquise', eur(capital + interets)],
      note: "Intérêts simples : I = C × t × (n / base)."
    };
  },

  /* ---- Intérêts composés ---- */
  interetsComposes({ cible, nPeriodes, periodesParAn, valeurActuelle, premierFlux, tauxAnnuel }) {
    const i = (tauxAnnuel / 100) / periodesParAn;
    const n = nPeriodes;
    if (cible === 'future') {
      const vfPrincipal = valeurActuelle * Math.pow(1 + i, n);
      const vfFlux = i === 0 ? premierFlux * n : premierFlux * (Math.pow(1 + i, n) - 1) / i;
      const vf = vfPrincipal + vfFlux;
      return {
        rows: [
          ['Valeur actuelle', eur(valeurActuelle)],
          ['Flux par période', eur(premierFlux)],
          ['Périodes', `${n} (${periodesParAn}/an)`],
          ['Taux périodique', pct(i * 100)],
        ],
        total: ['Valeur future', eur(vf)],
        note: "VF = VA·(1+i)ⁿ + flux·[(1+i)ⁿ−1]/i, avec i = taux annuel / périodes par an."
      };
    } else {
      const va = valeurActuelle / Math.pow(1 + i, n);
      return {
        rows: [
          ['Valeur future', eur(valeurActuelle)],
          ['Périodes', `${n} (${periodesParAn}/an)`],
          ['Taux périodique', pct(i * 100)],
        ],
        total: ['Valeur actuelle', eur(va)],
        note: "VA = VF / (1+i)ⁿ."
      };
    }
  },

  /* ---- Équivalence de taux ---- */
  equivalenceTaux({ periodesParAn, tauxPeriodique }) {
    const ip = tauxPeriodique / 100;
    const annuelEquiv = (Math.pow(1 + ip, periodesParAn) - 1) * 100;
    const annuelProp = ip * periodesParAn * 100;
    return {
      rows: [
        ['Taux périodique de référence', pct(tauxPeriodique)],
        ['Nombre de périodes par an', String(periodesParAn)],
        ['Taux annuel proportionnel', pct(annuelProp)],
      ],
      total: ['Taux annuel équivalent (actuariel)', pct(annuelEquiv)],
      note: "Taux équivalent : (1 + i_p)^m − 1. Taux proportionnel : i_p × m."
    };
  },

  /* ---- Emprunt à échéance constante ---- */
  emprunt({ montant, tauxAnnuel, type, periodesParAn, annees }) {
    const i = (tauxAnnuel / 100) / periodesParAn;
    const n = Math.round(annees * periodesParAn);
    if (n <= 0) return { rows: [['Durée', '0']], total: ['—', '—'], note: 'Renseigne une durée.' };
    let echeance, totalInterets;
    if (type === 'constante') {
      echeance = i === 0 ? montant / n : montant * i / (1 - Math.pow(1 + i, -n));
      totalInterets = echeance * n - montant;
      return {
        rows: [
          ['Montant emprunté', eur(montant)],
          ['Taux annuel', pct(tauxAnnuel)],
          ['Durée', `${annees} an(s) — ${n} échéances`],
          ['Échéance constante', eur(echeance)],
          ['Coût total du crédit', eur(totalInterets)],
        ],
        total: ['Total remboursé', eur(echeance * n)],
        note: "Échéance constante : a = K·i / (1 − (1+i)⁻ⁿ)."
      };
    } else {
      // capital constant
      const amort = montant / n;
      const premiere = amort + montant * i;
      const derniere = amort + amort * i;
      totalInterets = (montant * i) * (n + 1) / 2;
      return {
        rows: [
          ['Montant emprunté', eur(montant)],
          ['Taux annuel', pct(tauxAnnuel)],
          ['Durée', `${annees} an(s) — ${n} échéances`],
          ['Amortissement constant', eur(amort)],
          ['1ʳᵉ échéance', eur(premiere)],
          ['Dernière échéance', eur(derniere)],
          ['Coût total du crédit', eur(totalInterets)],
        ],
        total: ['Total remboursé', eur(montant + totalInterets)],
        note: "Capital constant : amortissement fixe, intérêts décroissants."
      };
    }
  }
};

/* Barème des droits de succession (art. 777) — ligne directe & autres */
const LIENS = { direct: 'Ligne directe', conjoint: 'Conjoint / PACS', frere: 'Frère / sœur', neveu: 'Neveu / nièce', autre: 'Sans lien / autre' };
function bareme777(montant, lien) {
  if (lien === 'conjoint') return 0; // exonéré
  if (lien === 'direct') {
    const tr = [[8072, .05],[12109, .10],[15932, .15],[552324, .20],[902838, .30],[1805677, .40],[Infinity, .45]];
    return baremeProgressif(montant, tr);
  }
  if (lien === 'frere') {
    const tr = [[24430, .35],[Infinity, .45]];
    return baremeProgressif(montant, tr);
  }
  if (lien === 'neveu') return montant * 0.55;
  return montant * 0.60; // sans lien
}
function baremeProgressif(montant, tranches) {
  let reste = montant, prev = 0, tax = 0;
  for (const [plafond, taux] of tranches) {
    const largeur = plafond - prev;
    const part = Math.min(reste, largeur);
    if (part <= 0) break;
    tax += part * taux; reste -= part; prev = plafond;
    if (reste <= 0) break;
  }
  return tax;
}

/* ============================================================
   MOTEURS DE CALCUL SUPPLÉMENTAIRES (France 2025)
   ============================================================ */

/* Barèmes IR par année (par part de quotient familial) */
const BAREME_IR = {
  // revenus 2024 (imposition 2025)
  2024: [[11497, 0],[29315, .11],[83823, .30],[180294, .41],[Infinity, .45]],
  // revenus 2025 (imposition 2026, +0,9%)
  2025: [[11600, 0],[29579, .11],[84577, .30],[181917, .41],[Infinity, .45]],
};

function impotParPart(quotient, annee) {
  const tr = BAREME_IR[annee] || BAREME_IR[2025];
  let reste = quotient, prev = 0, impot = 0;
  for (const [plafond, taux] of tr) {
    const largeur = plafond - prev;
    const part = Math.min(reste, largeur);
    if (part <= 0) break;
    impot += part * taux; reste -= part; prev = plafond;
    if (reste <= 0) break;
  }
  return impot;
}

Object.assign(Calc, {

  /* ---- Impôt sur le revenu (barème progressif + décote) ---- */
  impotRevenu({ annee, revenuImposable, parts, couple }) {
    const isCouple = (couple != null) ? !!couple : (parts >= 2);
    const base = isCouple ? 2 : 1;                 // parts "de base" (sans personnes à charge)
    const quotient = revenuImposable / parts;

    // Impôt au barème avec le nombre de parts réel
    let impotBrut = impotParPart(quotient, annee) * parts;

    // --- Plafonnement du quotient familial (demi-parts supplémentaires) ---
    const plafondDP = (annee === 2024) ? 1791 : 1807; // plafond par demi-part supplémentaire
    let plafond = 0, plafonne = false;
    if (parts > base) {
      const impotBase = impotParPart(revenuImposable / base, annee) * base; // impôt sans les parts d'enfants
      const avantage = impotBase - impotBrut;                                // réduction due aux parts en plus
      const demiParts = Math.round((parts - base) / 0.5);                    // nb de demi-parts supplémentaires
      plafond = demiParts * plafondDP;
      if (avantage > plafond) { impotBrut = impotBase - plafond; plafonne = true; }
    }

    // --- Décote ---
    const dec = (annee === 2024)
      ? { s: 889, c: 1470, seuilS: 1929, seuilC: 3191 }
      : { s: 897, c: 1483, seuilS: 1946, seuilC: 3220 };
    let decote = 0;
    if (isCouple && impotBrut < dec.seuilC) decote = Math.max(0, dec.c - impotBrut * 0.4525);
    else if (!isCouple && impotBrut < dec.seuilS) decote = Math.max(0, dec.s - impotBrut * 0.4525);

    const impotNet = Math.max(0, impotBrut - decote);
    const tauxMoyen = revenuImposable > 0 ? impotNet / revenuImposable * 100 : 0;
    return {
      rows: [
        ['Revenu net imposable', eur(revenuImposable)],
        ['Situation', isCouple ? 'Couple (imposition commune)' : 'Personne seule'],
        ['Nombre de parts', String(parts)],
        ['Quotient familial', eur(quotient)],
        plafonne ? ['Plafonnement avantage QF', 'limité à ' + eur(plafond)] : null,
        ['Impôt brut', eur(impotBrut)],
        decote > 0 ? ['Décote', '– ' + eur(decote)] : null,
        ['Taux moyen', pct(tauxMoyen)],
      ].filter(Boolean),
      total: ['Impôt net sur le revenu', eur(impotNet)],
      note: `Barème progressif ${annee}. Plafonnement du quotient familial (${plafondDP} €/demi-part) et décote appliqués. Hors cas particuliers (parent isolé case T, invalidité, ancien combattant) et réductions/crédits d'impôt.`
    };
  },

  /* ---- CEHR ---- */
  cehr({ situation, rfr }) {
    const couple = situation !== 'seul';
    let tax = 0; const rows = [['Revenu fiscal de référence', eur(rfr)]];
    if (couple) {
      const t3 = Math.max(0, Math.min(rfr, 1000000) - 500000);
      const t4 = Math.max(0, rfr - 1000000);
      tax = t3 * 0.03 + t4 * 0.04;
      if (t3 > 0) rows.push(['3% (500 000 → 1 000 000 €)', eur(t3 * 0.03)]);
      if (t4 > 0) rows.push(['4% (> 1 000 000 €)', eur(t4 * 0.04)]);
    } else {
      const t3 = Math.max(0, Math.min(rfr, 500000) - 250000);
      const t4 = Math.max(0, rfr - 500000);
      tax = t3 * 0.03 + t4 * 0.04;
      if (t3 > 0) rows.push(['3% (250 000 → 500 000 €)', eur(t3 * 0.03)]);
      if (t4 > 0) rows.push(['4% (> 500 000 €)', eur(t4 * 0.04)]);
    }
    return {
      rows,
      total: ['CEHR due', eur(tax)],
      note: "Contribution exceptionnelle sur les hauts revenus (art. 223 sexies CGI). Seuils : 250 000 €/500 000 € (seul), 500 000 €/1 000 000 € (couple). Hors mécanisme de lissage."
    };
  },

  /* ---- Dividendes : PFU 30% vs barème ---- */
  dividendes({ montant, tmi, optionBareme }) {
    const ps = montant * 0.172;
    const pfu = montant * 0.128; // IR forfaitaire
    const rows = [['Dividendes bruts', eur(montant)]];
    if (optionBareme) {
      const abattement = montant * 0.40;
      const baseIR = montant - abattement;
      const ir = baseIR * (tmi / 100);
      // CSG déductible 6,8%
      const csgDeductible = montant * 0.068 * (tmi / 100);
      rows.push(['Abattement 40%', '– ' + eur(abattement)]);
      rows.push(['Base imposable IR', eur(baseIR)]);
      rows.push([`IR (TMI ${tmi}%)`, eur(ir)]);
      rows.push(['Prélèvements sociaux (17,2%)', eur(ps)]);
      rows.push(['Dont CSG déductible récupérée', '– ' + eur(csgDeductible)]);
      const total = ir + ps - csgDeductible;
      return { rows, total: ['Imposition totale (option barème)', eur(total)], net: ['Dividendes nets', eur(montant - total)], note: "Option barème progressif : abattement de 40%, CSG déductible 6,8%. À comparer avec le PFU." };
    }
    rows.push(['IR forfaitaire (12,8%)', eur(pfu)]);
    rows.push(['Prélèvements sociaux (17,2%)', eur(ps)]);
    return {
      rows,
      total: ['Flat tax (PFU 30%)', eur(pfu + ps)],
      net: ['Dividendes nets', eur(montant - pfu - ps)],
      note: "PFU (flat tax) 30% = 12,8% IR + 17,2% PS. Sans abattement. Comparez avec l'option barème si votre TMI est faible."
    };
  },

  /* ---- Plafonnement des niches fiscales ---- */
  plafondNiches({ impotBrut, riciSoumises, riciMajorees, riciHors }) {
    const plafondStd = 10000, plafondMajore = 18000;
    // Réductions soumises au plafond standard + majorées (outre-mer/Sofica) au plafond +8000
    const exces = Math.max(0, (riciSoumises - plafondStd)) + Math.max(0, (riciMajorees - (plafondMajore - plafondStd)));
    const totalRetenu = Math.min(riciSoumises, plafondStd) + Math.min(riciMajorees, plafondMajore - plafondStd) + riciHors;
    const impotApres = Math.max(0, impotBrut - totalRetenu);
    return {
      rows: [
        ['Impôt brut', eur(impotBrut)],
        ['RICI soumises au plafonnement', eur(riciSoumises)],
        ['RICI éligibles plafond majoré', eur(riciMajorees)],
        ['RICI hors plafonnement', eur(riciHors)],
        ['Plafond global applicable', eur(plafondStd) + ' (+8 000 € majoré)'],
        exces > 0 ? ['Excédent perdu (plafonné)', eur(exces)] : null,
        ['Réductions effectivement retenues', eur(totalRetenu)],
      ].filter(Boolean),
      total: ['Impôt après réductions', eur(impotApres)],
      note: "Plafonnement global des niches fiscales : 10 000 € (18 000 € avec investissements outre-mer / Sofica). L'excédent au-delà du plafond est perdu."
    };
  },

  /* ---- Plus-values de cession de valeurs mobilières ---- */
  pvMobilieres({ pv, optionBareme, tmi, departRetraite }) {
    if (pv <= 0) return { rows: [['Moins-value', eur(pv)]], total: ['Imposition', eur(0)], note: "Une moins-value est imputable sur les plus-values de même nature des 10 années suivantes." };
    const ps = pv * 0.172;
    const rows = [['Plus-value', eur(pv)]];
    let ir;
    if (departRetraite) {
      const abatFixe = Math.min(pv, 500000);
      const base = Math.max(0, pv - abatFixe);
      ir = optionBareme ? base * (tmi / 100) : base * 0.128;
      rows.push(['Abattement départ retraite', '– ' + eur(abatFixe)]);
      rows.push(['Base imposable', eur(base)]);
    } else {
      ir = optionBareme ? pv * (tmi / 100) : pv * 0.128;
    }
    rows.push(optionBareme ? [`IR barème (TMI ${tmi}%)`, eur(ir)] : ['IR forfaitaire (12,8%)', eur(ir)]);
    rows.push(['Prélèvements sociaux (17,2%)', eur(ps)]);
    return {
      rows,
      total: ['Imposition totale', eur(ir + ps)],
      net: ['Plus-value nette', eur(pv - ir - ps)],
      note: "PFU 30% par défaut. Option barème possible (abattements pour durée de détention si titres acquis avant 2018). Abattement fixe 500 000 € pour départ à la retraite du dirigeant."
    };
  },

  /* ---- IS (impôt sur les sociétés) ---- */
  is({ resultatComptable, reintegrations, deductions, tauxReduit }) {
    const resultatFiscal = resultatComptable + reintegrations - deductions;
    const rows = [
      ['Résultat comptable avant IS', eur(resultatComptable)],
      ['+ Réintégrations fiscales', eur(reintegrations)],
      ['– Déductions fiscales', eur(deductions)],
      ['Résultat fiscal', eur(resultatFiscal)],
    ];
    if (resultatFiscal <= 0) return { rows, total: ['IS dû', eur(0)], note: "Résultat fiscal déficitaire : pas d'IS, déficit reportable." };
    let is = 0;
    if (tauxReduit) {
      const t15 = Math.min(resultatFiscal, 42500);
      const t25 = Math.max(0, resultatFiscal - 42500);
      is = t15 * 0.15 + t25 * 0.25;
      rows.push(['IS taux réduit 15% (≤ 42 500 €)', eur(t15 * 0.15)]);
      if (t25 > 0) rows.push(['IS taux normal 25% (> 42 500 €)', eur(t25 * 0.25)]);
    } else {
      is = resultatFiscal * 0.25;
      rows.push(['IS taux normal (25%)', eur(is)]);
    }
    return {
      rows,
      total: ['IS dû', eur(is)],
      net: ['Résultat net après IS', eur(resultatFiscal - is)],
      note: "Taux normal 25%. Taux réduit PME 15% jusqu'à 42 500 € de bénéfice (CA < 10 M€, capital détenu ≥ 75% par personnes physiques)."
    };
  },

  /* ---- DMTG droits simples (donation / succession) ---- */
  dmtgDroitsSimples({ typeTransmission, lien, montant, handicap, abattementConsomme = 0 }) {
    const ab = abattementDMTG(lien, typeTransmission) + (handicap ? 159325 : 0);
    const abEffectif = Math.max(0, ab - abattementConsomme);
    const taxable = Math.max(0, montant - abEffectif);
    const droits = baremeDMTG(taxable, lien);
    return {
      rows: [
        ['Montant transmis', eur(montant)],
        ['Abattement applicable', eur(ab)],
        abattementConsomme > 0 ? ['Abattement déjà consommé', '– ' + eur(abattementConsomme)] : null,
        ['Part taxable', eur(taxable)],
      ].filter(Boolean),
      total: ['Droits de mutation (DMTG)', eur(droits)],
      net: ['Net transmis', eur(montant - droits)],
      note: `${typeTransmission === 'donation' ? 'Donation' : 'Succession'} — ${LIENS_DMTG[lien]}. Abattement renouvelable tous les 15 ans (donations). Barème art. 777 CGI.`
    };
  },

  /* ---- DMTG donations avec droits inclus (prise en charge des droits par le donateur) ---- */
  dmtgDroitsInclus({ lien, coutTotal, handicap, abattementConsomme = 0 }) {
    const ab = Math.max(0, abattementDMTG(lien, 'donation') + (handicap ? 159325 : 0) - abattementConsomme);
    // coutTotal = donation nette + droits. On résout itérativement la donation nette D telle que D + droits(D) = coutTotal
    let bas = 0, haut = coutTotal, D = coutTotal;
    for (let i = 0; i < 60; i++) {
      D = (bas + haut) / 2;
      const droits = baremeDMTG(Math.max(0, D - ab), lien);
      if (D + droits > coutTotal) haut = D; else bas = D;
    }
    const droits = baremeDMTG(Math.max(0, D - ab), lien);
    return {
      rows: [
        ['Coût total (donation + droits)', eur(coutTotal)],
        ['Abattement applicable', eur(ab)],
        ['Donation nette transmise', eur(D)],
        ['Droits pris en charge par le donateur', eur(droits)],
      ],
      total: ['Donation effective au donataire', eur(D)],
      note: "Donation « droits inclus » : le donateur règle les droits, ce qui augmente la somme réellement transmise sans surcoût fiscal (les droits payés ne sont pas eux-mêmes taxés)."
    };
  },

  /* ---- Démembrement (usufruit / nue-propriété, art. 669) ---- */
  demembrement({ type, dureeFixe, ageUsufruitier }) {
    let usufruit;
    if (type === 'fixe') {
      // art. 669 II : 23% par période de 10 ans ENTAMÉE. 10 ans -> 23%, 11 ans -> 46%, 20 ans -> 46%.
      const periodes = Math.max(1, Math.ceil(dureeFixe / 10));
      usufruit = Math.min(periodes * 23, 92);
    } else {
      // viager (art. 669 I) selon l'âge
      const a = ageUsufruitier;
      if (a < 21) usufruit = 90; else if (a < 31) usufruit = 80; else if (a < 41) usufruit = 70;
      else if (a < 51) usufruit = 60; else if (a < 61) usufruit = 50; else if (a < 71) usufruit = 40;
      else if (a < 81) usufruit = 30; else if (a < 91) usufruit = 20; else usufruit = 10;
    }
    const nuePropriete = 100 - usufruit;
    return {
      usufruit, nuePropriete,
      rows: [
        ['Type', type === 'fixe' ? `Durée fixe (${dureeFixe} ans)` : `Viager (${ageUsufruitier} ans)`],
        ['Valeur fiscale de l\'usufruit', pct(usufruit)],
        ['Valeur fiscale de la nue-propriété', pct(nuePropriete)],
      ],
      note: "Barème art. 669 CGI. Usufruit viager selon l'âge ; usufruit à durée fixe : 23% par période de 10 ans (sans excéder la valeur viagère)."
    };
  },

  /* ---- Frais de notaire / d'acquisition (émoluments + droits + CSI + débours) ---- */
  dmtoAchat({ departement, valeur, typeBien, debours }) {
    const tauxDept = DMTO_DEPTS[departement] ?? 0.0581;   // droits d'enregistrement globaux (départemental + communal + assiette)
    const d = fraisAcquisitionDetail(valeur, typeBien, tauxDept * 100, debours);
    const neuf = typeBien === 'neuf';
    return {
      rows: [
        ['Type de bien', neuf ? 'Neuf / VEFA' : 'Ancien'],
        ['Valeur d\'acquisition hors frais', eur(valeur)],
        neuf ? ['Taxe de publicité foncière (0,715 %)', eur(d.droits)]
             : ['Droits de mutation (' + pct(tauxDept * 100) + ')', eur(d.droits)],
        ['Émoluments du notaire TTC', eur(d.emolTTC)],
        ['Contribution de sécurité immobilière (0,10 %)', eur(d.csi)],
        ['Débours', eur(d.debours)],
        ['Soit, en % du prix', pct(d.total / valeur * 100)],
      ],
      total: ['Frais d\'acquisition totaux', eur(d.total)],
      note: "Émoluments réglementés (barème par tranches, TVA 20 %) + droits de mutation (ancien) ou TPF réduite 0,715 % (neuf/VEFA) + CSI + débours. Estimation, hors cas particuliers (primo-accédant, prêts aidés, mobilier déductible…)."
    };
  },

  /* ---- IFI ---- */
  ifi({ actifNetImposable, reductions = 0 }) {
    const base = actifNetImposable;
    if (base < 1300000) return { rows: [['Patrimoine net taxable', eur(base)]], total: ['IFI dû', eur(0)], note: "IFI dû uniquement si le patrimoine immobilier net taxable atteint 1 300 000 €. En deçà, aucune imposition." };
    const tr = [[800000, 0],[1300000, .005],[2570000, .007],[5000000, .01],[10000000, .0125],[Infinity, .015]];
    let reste = base, prev = 0, impot = 0;
    for (const [plafond, taux] of tr) {
      const part = Math.min(reste, plafond - prev); if (part <= 0) break;
      impot += part * taux; reste -= part; prev = plafond; if (reste <= 0) break;
    }
    // décote entre 1,3M et 1,4M
    if (base <= 1400000) impot -= Math.max(0, 17500 - 0.0125 * base);
    impot = Math.max(0, impot - reductions);
    return {
      rows: [
        ['Patrimoine immobilier net taxable', eur(base)],
        reductions > 0 ? ['Réductions d\'IFI', '– ' + eur(reductions)] : null,
      ].filter(Boolean),
      total: ['IFI dû', eur(impot)],
      note: "Barème IFI 2025 (seuil 1 300 000 €, barème dès 800 000 €). Décote pour patrimoines entre 1,3 et 1,4 M€."
    };
  },

  /* ---- Plus-values immobilières des particuliers ---- */
  pvImmobiliere({ terrainABatir, dureeDetention, prixCession, fraisCession, prixAcquisition, fraisAcqForfait, fraisAcqReels, fraisTravaux, abattementApplicable }) {
    const fraisAcq = fraisAcqForfait ? prixAcquisition * 0.075 : fraisAcqReels;
    const prixAcqMajore = prixAcquisition + fraisAcq + fraisTravaux;
    const prixCessionNet = prixCession - fraisCession;
    const pvBrute = Math.max(0, prixCessionNet - prixAcqMajore);
    // Abattements pour durée de détention
    let abIR = 0, abPS = 0;
    if (abattementApplicable && dureeDetention > 5) {
      // IR : 6%/an de 6 à 21 ans, 4% la 22e -> exo à 22 ans
      let aIR = 0;
      for (let y = 6; y <= Math.min(dureeDetention, 21); y++) aIR += 6;
      if (dureeDetention >= 22) aIR += 4;
      abIR = Math.min(100, aIR);
      // PS : 1,65%/an de 6 à 21 ans, 1,60% 22e, 9%/an de 23 à 30 -> exo à 30 ans
      let aPS = 0;
      for (let y = 6; y <= Math.min(dureeDetention, 21); y++) aPS += 1.65;
      if (dureeDetention >= 22) aPS += 1.60;
      for (let y = 23; y <= Math.min(dureeDetention, 30); y++) aPS += 9;
      abPS = Math.min(100, aPS);
    }
    const baseIR = pvBrute * (1 - abIR / 100);
    const basePS = pvBrute * (1 - abPS / 100);
    const ir = baseIR * 0.19;
    const ps = basePS * 0.172;
    // surtaxe sur PV > 50 000 € (base IR)
    let surtaxe = 0;
    if (baseIR > 50000) surtaxe = surtaxePVImmo(baseIR);
    return {
      rows: [
        ['Prix de cession net', eur(prixCessionNet)],
        ['Prix d\'acquisition majoré', eur(prixAcqMajore)],
        ['Plus-value brute', eur(pvBrute)],
        ['Abattement IR / PS', `${abIR}% / ${abPS}%`],
        ['Base imposable IR', eur(baseIR)],
        ['Impôt IR (19%)', eur(ir)],
        ['Prélèvements sociaux (17,2%)', eur(ps)],
        surtaxe > 0 ? ['Surtaxe (PV > 50 000 €)', eur(surtaxe)] : null,
      ].filter(Boolean),
      total: ['Imposition totale', eur(ir + ps + surtaxe)],
      net: ['Plus-value nette', eur(pvBrute - ir - ps - surtaxe)],
      note: terrainABatir ? "Terrain à bâtir : mêmes règles d'abattement depuis 2014." : "Résidence principale exonérée. IR 19% + PS 17,2%. Exonération IR à 22 ans, PS à 30 ans de détention."
    };
  },

  /* ---- Revenus fonciers ---- */
  revenusFonciers({ revenuNetFoncier, deficitN10, deficitAnterieur, plafondImputation, tmi }) {
    // déficit imputable sur revenu global plafonné (10 700 € en général)
    const plafond = Math.abs(plafondImputation);
    const rows = [['Revenu net foncier', eur(revenuNetFoncier)]];
    let revenuImposable = revenuNetFoncier;
    let imputationGlobale = 0;
    if (revenuNetFoncier < 0) {
      imputationGlobale = Math.min(Math.abs(revenuNetFoncier), plafond);
      rows.push(['Déficit imputable sur le revenu global', eur(imputationGlobale)]);
      revenuImposable = 0;
    }
    const totalDeficitsAnterieurs = deficitN10 + deficitAnterieur;
    const imputable = Math.min(Math.max(0, revenuImposable), totalDeficitsAnterieurs);
    revenuImposable = Math.max(0, revenuImposable - imputable);
    if (imputable > 0) rows.push(['Déficits antérieurs imputés', '– ' + eur(imputable)]);
    rows.push(['Revenu foncier imposable', eur(revenuImposable)]);
    const ir = revenuImposable * (tmi / 100);
    const ps = revenuImposable * 0.172;
    return {
      rows: [...rows, [`IR (TMI ${tmi}%)`, eur(ir)], ['Prélèvements sociaux (17,2%)', eur(ps)]],
      total: ['Imposition des revenus fonciers', eur(ir + ps)],
      note: "Déficit foncier imputable sur le revenu global jusqu'à 10 700 € (21 400 € rénovation énergétique). Surplus reportable 10 ans sur revenus fonciers."
    };
  },
});

function surtaxePVImmo(pv) {
  // barème progressif simplifié de la taxe sur PV immobilières élevées (art. 1609 nonies G)
  if (pv <= 50000) return 0;
  if (pv <= 100000) return pv * 0.02;
  if (pv <= 150000) return pv * 0.03;
  if (pv <= 200000) return pv * 0.04;
  if (pv <= 250000) return pv * 0.05;
  return pv * 0.06;
}

/* Abattements et barème DMTG */
const LIENS_DMTG = {
  conjoint: 'Conjoints (pacsé ou marié)', enfant: 'Enfants', petitenfant: 'Petits-enfants',
  frere: 'Frère / sœur', neveu: 'Neveu / nièce', autre: 'Sans lien de parenté'
};
function abattementDMTG(lien, type) {
  switch (lien) {
    case 'conjoint': return type === 'donation' ? 80724 : Infinity; // succession conjoint exonérée
    case 'enfant': return 100000;
    case 'petitenfant': return type === 'donation' ? 31865 : 1594;
    case 'frere': return 15932;
    case 'neveu': return 7967;
    default: return 1594;
  }
}
function baremeDMTG(taxable, lien) {
  if (taxable <= 0) return 0; // succession entre époux : abattement infini -> taxable nul -> 0
  // conjoint : succession exonérée (taxable déjà nul) ; donation au barème ligne directe au-delà de 80 724 €
  if (lien === 'enfant' || lien === 'petitenfant' || lien === 'conjoint') {
    return baremeProgressif(taxable, [[8072,.05],[12109,.10],[15932,.15],[552324,.20],[902838,.30],[1805677,.40],[Infinity,.45]]);
  }
  if (lien === 'frere') return baremeProgressif(taxable, [[24430,.35],[Infinity,.45]]);
  if (lien === 'neveu') return taxable * 0.55;
  return taxable * 0.60;
}

/* Taux DMTO par département (la plupart à 5,81% ; quelques exceptions historiques à 5,11%) */
const DMTO_DEPTS = {
  '36 Indre': 0.0511, '38 Isère': 0.0511, '56 Morbihan': 0.0581, '75 Paris': 0.0581,
};

/* ---- Frais d'acquisition / notaire (fonctions globales, partagées avec simulateurs.js) ---- */
// Émoluments du notaire (barème réglementé, tranches HT) — arrêté tarifaire
function emolumentsNotaireHT(prix) {
  const tranches = [
    { plafond: 6500, taux: 0.0387 },
    { plafond: 17000, taux: 0.0160 },
    { plafond: 60000, taux: 0.0106 },
    { plafond: Infinity, taux: 0.0080 },
  ];
  let bas = 0, emol = 0;
  for (const t of tranches) {
    const assiette = Math.max(0, Math.min(prix, t.plafond) - bas);
    emol += assiette * t.taux;
    bas = t.plafond;
    if (prix <= t.plafond) break;
  }
  return emol;
}
// Frais d'acquisition totaux : émoluments TTC + CSI + droits (DMTO ancien / TPF réduite neuf) + débours.
// tauxDMTO en POURCENT (ex. 5.8106). Renvoie { emolTTC, csi, droits, debours, total }.
function fraisAcquisitionDetail(prix, typeBien, tauxDMTO, debours) {
  const emolTTC = emolumentsNotaireHT(prix) * 1.20;                 // TVA 20 %
  const csi = Math.max(prix * 0.001, 15);                          // contribution de sécurité immobilière 0,10 %, min 15 €
  const droits = typeBien === 'neuf'
    ? prix * 0.00715                                                // TPF réduite (neuf / VEFA)
    : prix * ((tauxDMTO || 5.81) / 100);                           // DMTO (ancien)
  const deb = debours || 0;
  return { emolTTC, csi, droits, debours: deb, total: emolTTC + csi + droits + deb };
}
function computeFraisNotaire(prix, typeBien, tauxDMTO, debours) {
  return fraisAcquisitionDetail(prix, typeBien, tauxDMTO, debours).total;
}

/* ============================================================
   COMPOSANTS UI réutilisables
   ============================================================ */
function field(label, inputNode, hint) {
  const wrap = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, label)]);
  if (hint) wrap.append(el('div', { class: 'hint' }, hint));
  wrap.append(inputNode);
  return wrap;
}
function moneyInput(id, ph = '') {
  const w = el('div', { class: 'input-wrap' });
  w.append(el('input', { id, class: 'inp text-right', inputmode: 'decimal', placeholder: ph }));
  w.append(el('div', { class: 'suffix' }, '€'));
  return w;
}
function dateInput(id) {
  const w = el('div', { class: 'input-wrap' });
  w.append(el('input', { id, type: 'date', class: 'inp' }));
  return w;
}
function plainInput(id, ph = '') {
  const w = el('div', { class: 'input-wrap' });
  w.append(el('input', { id, class: 'inp text-right', inputmode: 'decimal', placeholder: ph }));
  return w;
}
function stepperDecimal(id, val = 1, min = 0, max = 100, step = 0.5) {
  const wrap = el('div', { class: 'stepper' });
  const input = el('input', { id, inputmode: 'decimal', value: val });
  const dec = el('button', { class: 'step-btn', type: 'button', onclick: () => { input.value = Math.max(min, (parseFloat(input.value || 0) - step)); } }, '−');
  const inc = el('button', { class: 'step-btn', type: 'button', onclick: () => { input.value = Math.min(max, (parseFloat(input.value || 0) + step)); } }, '+');
  wrap.append(dec, input, inc);
  return wrap;
}
function numSigned(v) { const x = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : 0; }
function pctInput(id, ph = '') {
  const w = el('div', { class: 'input-wrap' });
  w.append(el('input', { id, class: 'inp text-right', inputmode: 'decimal', placeholder: ph }));
  w.append(el('div', { class: 'suffix' }, '%'));
  return w;
}
function stepper(id, val = 0, min = 0, max = 600) {
  const wrap = el('div', { class: 'stepper' });
  const input = el('input', { id, inputmode: 'numeric', value: val });
  const dec = el('button', { class: 'step-btn', type: 'button', onclick: () => { input.value = Math.max(min, (parseInt(input.value || 0) - 1)); } }, '−');
  const inc = el('button', { class: 'step-btn', type: 'button', onclick: () => { input.value = Math.min(max, (parseInt(input.value || 0) + 1)); } }, '+');
  wrap.append(dec, input, inc);
  return wrap;
}
function selectField(id, options, value) {
  const w = el('div', { class: 'select-wrap' });
  const sel = el('select', { id, class: 'inp' });
  options.forEach(([v, t]) => { const o = el('option', { value: v }, t); if (v === value) o.selected = true; sel.append(o); });
  w.append(sel);
  return w;
}
function toggleGroup(id, options, value) {
  const g = el('div', { class: 'toggle', id });
  options.forEach(([v, t]) => {
    const b = el('button', { type: 'button', 'data-val': v }, t);
    if (v === value) b.classList.add('active');
    b.onclick = () => { $$('button', g).forEach(x => x.classList.remove('active')); b.classList.add('active'); g.dataset.value = v; };
    g.append(b);
  });
  g.dataset.value = value;
  return g;
}
function getToggle(id) { return $('#' + id).dataset.value; }

function hero(eyebrow, title, iconSvg) {
  const h = el('div', { class: 'hero' });
  if (iconSvg) h.append(el('div', { class: 'icon', html: iconSvg }));
  if (eyebrow) h.append(el('div', { class: 'eyebrow' }, eyebrow));
  h.append(el('h1', {}, title));
  return h;
}
function actions(onCalc) {
  const a = el('div', { class: 'actions' });
  a.append(el('button', { class: 'btn-primary', type: 'button', onclick: onCalc }, 'Calculer le résultat'));
  a.append(el('button', { class: 'btn-ghost', type: 'button', onclick: () => Router.back() }, 'Annuler'));
  return a;
}
function renderResult(sheet, res) {
  $$('.result', sheet).forEach(r => r.remove());
  $$('.sim-export', sheet).forEach(r => r.remove());
  const box = el('div', { class: 'result' });
  if (res.info) { box.append(el('div', { class: 'note', html: res.info, style: 'font-size:14px;color:#dfe1ee' })); sheet.append(box); safeScroll(box); return; }
  box.append(el('h3', {}, 'Résultat'));
  res.rows.forEach(([k, v]) => box.append(el('div', { class: 'row' }, [el('span', { class: 'k' }, k), el('span', { class: 'v' }, v)])));
  if (res.total) box.append(el('div', { class: 'row total' }, [el('span', { class: 'k' }, res.total[0]), el('span', { class: 'v' }, res.total[1])]));
  if (res.net) box.append(el('div', { class: 'row total' }, [el('span', { class: 'k' }, res.net[0]), el('span', { class: 'v', style:'color:#fff' }, res.net[1])]));
  if (res.note) box.append(el('div', { class: 'note' }, res.note));
  sheet.append(box);
  try { if (window.MKPExport && res.rows && res.rows.length) window.MKPExport.addExportButtons(sheet, res); } catch (e) {}
  safeScroll(box);
}
function safeScroll(node) { try { if (node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
/* Élément de menu vers un simulateur, avec gating d'abonnement (badge 9,99 € si offre insuffisante) */
function simMenuItem(sheet, title, key) {
  const ok = (typeof Billing === 'undefined') || (Billing.allows ? Billing.allows(key) : true);
  const right = ok ? el('div', { class: 'ma' })
    : el('div', { style: 'background:#12B981;color:#08362a;font-weight:800;font-size:11px;padding:5px 9px;border-radius:20px' }, '9,99 €');
  sheet.append(el('div', { class: 'menu-item', onclick: () => ok ? Router.go(key) : Router.go('upgrade') }, [el('div', { class: 'mt' }, title), right]));
}

/* ============================================================
   ICÔNES
   ============================================================ */
const ICON_PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/></svg>';
const ICON_CHART = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M4 16l4-5 4 3 5-7"/><path d="M16 7h3v3"/></svg>';

/* ============================================================
   ÉCRANS
   ============================================================ */
const Screens = {

  /* -------- Accueil : catégories -------- */
  home() {
    const v = el('div', {});
    const h = hero('', 'Mon Kap Pro');
    const wm = el('div', { style: 'margin:6px auto 2px;text-align:center' });
    wm.innerHTML = `<svg viewBox="0 0 250 56" xmlns="http://www.w3.org/2000/svg" style="width:220px;max-width:74vw;height:auto">
      <rect x="2" y="8" width="40" height="40" rx="11" fill="#12B981"/>
      <rect x="11" y="29" width="6" height="11" rx="2" fill="#fff"/><rect x="20" y="23" width="6" height="17" rx="2" fill="#fff"/><rect x="29" y="16" width="6" height="24" rx="2" fill="#fff"/>
      <path d="M12 24 L22 19 L33 13" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="33" cy="13" r="2.4" fill="#fff"/>
      <text x="52" y="37" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="27" font-weight="800" fill="#1B2559">Mon Kap <tspan fill="#12B981">Pro</tspan></text></svg>`;
    const titleEl = h.querySelector('h1'); if (titleEl) titleEl.style.display = 'none';
    h.insertBefore(wm, h.firstChild);
    v.append(h);
    const sheet = el('div', { class: 'sheet' });
    if (State.billing && State.billing.state === 'trial') {
      const days = State.billing.daysLeft;
      const banner = el('div', { class: 'card', style: 'background:var(--navy);display:flex;align-items:center;justify-content:space-between;gap:12px' }, [
        el('div', {}, [el('div', { style: 'color:#fff;font-weight:700;font-size:16px' }, 'Essai gratuit'), el('div', { style: 'color:#AAB0CE;font-size:13px;margin-top:3px' }, days + ' jour' + (days > 1 ? 's' : '') + ' restant' + (days > 1 ? 's' : ''))]),
        el('button', { class: 'btn-back', style: 'background:#12B981;color:#0b3b2e', onclick: () => Router.go('paywall') }, 'S\'abonner')
      ]);
      sheet.append(banner);
    }
    const cats = [
      ['Assurance-Vie', 'av', 'Fiscalité décès & rachat'],
      ['Fiscalité des particuliers', 'part', 'IR, CEHR, dividendes, plus-values'],
      ['Immobilier', 'immo', 'Calculatrices + simulateurs (TRI, SCI, Acheter/Louer)'],
      ['Transmission d\'entreprise', 'transmission', 'Pacte Dutreil & Apport-cession 150-0 B ter'],
      ['Succession / Donation', 'succ', 'DMTG droits simples & inclus'],
      ['Épargne & retraite', 'epargne', 'Monte Carlo, capitalisation, dossiers enregistrés'],
      ['Société', 'soc', 'Impôt sur les sociétés'],
      ['Actualisation / Capitalisation / Emprunt', 'fin', 'Intérêts, taux, emprunt'],
    ];
    cats.forEach(([title, key, sub]) => {
      sheet.append(el('div', { class: 'menu-item', onclick: () => Router.go(key) }, [
        el('div', {}, [el('div', { class: 'mt' }, title), el('div', { class: 'hint', style: 'margin:6px 0 0' }, sub)]),
        el('div', { class: 'ma' })
      ]));
    });
    v.append(sheet);
    return v;
  },

  /* -------- Menu Assurance-Vie -------- */
  av() {
    const v = el('div', {});
    v.append(hero('CALCULATRICE', 'Assurance-Vie'));
    const sheet = el('div', { class: 'sheet' });
    [
      ['Fiscalité décès – 757 B', 'av_757b'],
      ['Fiscalité décès – 990 I', 'av_990i'],
      ['Fiscalité décès – Règles générales', 'av_regles'],
      ['Fiscalité rachat', 'av_rachat'],
    ].forEach(([t, key]) => {
      sheet.append(el('div', { class: 'menu-item', onclick: () => Router.go(key) }, [el('div', { class: 'mt' }, t), el('div', { class: 'ma' })]));
    });
    v.append(sheet);
    return v;
  },

  /* -------- Menu Finance -------- */
  fin() {
    const v = el('div', {});
    v.append(hero('CALCULATRICE', 'Finance'));
    const sheet = el('div', { class: 'sheet' });
    [
      ['Intérêts simples', 'fin_simple'],
      ['Intérêts composés', 'fin_compose'],
      ['Équivalence de taux', 'fin_equiv'],
      ['Emprunt', 'fin_emprunt'],
    ].forEach(([t, key]) => {
      sheet.append(el('div', { class: 'menu-item', onclick: () => Router.go(key) }, [el('div', { class: 'mt' }, t), el('div', { class: 'ma' })]));
    });
    v.append(sheet);
    return v;
  },

  /* -------- 990 I -------- */
  av_990i() {
    const v = el('div', {});
    v.append(hero('ASSURANCE-VIE', 'Fiscalité décès – 990 I', ICON_PERSON));
    const sheet = el('div', { class: 'sheet' });
    const nbCard = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Nombre de bénéficiaires')]);
    const nbSel = selectField('c-nb', [['1', '1 bénéficiaire'], ['2', '2 bénéficiaires'], ['3', '3 bénéficiaires'], ['4', '4 bénéficiaires']], '1');
    nbCard.append(nbSel);
    sheet.append(nbCard);
    const benefBox = el('div', { id: 'c-benefs' });
    sheet.append(benefBox);
    function renderBenefs(n) {
      benefBox.innerHTML = '';
      for (let i = 1; i <= n; i++) {
        const c = el('div', { class: 'card' }, [el('div', { class: 'sub-title' }, 'Bénéficiaire ' + i)]);
        c.append(el('label', { class: 'field-label', style: 'font-size:16px' }, 'Capitaux versés (primes + produits)'));
        c.append(moneyInput('c-b' + i + '-cap'));
        benefBox.append(c);
      }
    }
    renderBenefs(1);
    $('select', nbSel).addEventListener('change', e => renderBenefs(parseInt(e.target.value)));
    const cardVG = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Contrat vie-génération')]);
    cardVG.append(toggleGroup('c-vg', [['non', 'Non'], ['oui', 'Oui']], 'non'));
    sheet.append(cardVG);
    const cardAb = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Abattement (par bénéficiaire)')]);
    const abToggle = toggleGroup('c-abat', [['152500', '152 500 €'], ['autre', 'Autre']], '152500');
    cardAb.append(abToggle);
    const abWrap = el('div', { class: 'input-wrap', id: 'c-abat-wrap', style: 'display:none;margin-top:12px' }, [
      el('input', { id: 'c-abat-val', class: 'inp text-right', inputmode: 'decimal', placeholder: 'Montant' }), el('div', { class: 'suffix' }, '€')
    ]);
    cardAb.append(abWrap);
    sheet.append(cardAb);
    $$('button', abToggle).forEach(b => b.addEventListener('click', () => {
      abWrap.style.display = abToggle.dataset.value === 'autre' ? 'block' : 'none';
    }));
    sheet.append(actions(() => {
      const n = parseInt($('#c-nb').value);
      const beneficiaires = [];
      for (let i = 1; i <= n; i++) beneficiaires.push({ capital: num($('#c-b' + i + '-cap').value) });
      const ab = getToggle('c-abat') === 'autre' ? num($('#c-abat-val').value) : 152500;
      renderResult(sheet, Calc.art990I({ beneficiaires, abattement: ab, vieGeneration: getToggle('c-vg') === 'oui' }));
    }));
    v.append(sheet);
    return v;
  },

  /* -------- 757 B -------- */
  av_757b() {
    const v = el('div', {});
    v.append(hero('ASSURANCE-VIE', 'Fiscalité décès – 757 B', ICON_PERSON));
    const sheet = el('div', { class: 'sheet' });
    const nbCard = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Nombre de bénéficiaires')]);
    const nbSel = selectField('c-nb', [['1', '1 bénéficiaire'], ['2', '2 bénéficiaires'], ['3', '3 bénéficiaires'], ['4', '4 bénéficiaires']], '1');
    nbCard.append(nbSel);
    sheet.append(nbCard);
    const benefBox = el('div', { id: 'c-benefs' });
    sheet.append(benefBox);
    function renderBenefs(n) {
      benefBox.innerHTML = '';
      for (let i = 1; i <= n; i++) {
        const c = el('div', { class: 'card' }, [el('div', { class: 'sub-title' }, 'Bénéficiaire ' + i)]);
        c.append(el('label', { class: 'field-label', style: 'font-size:16px' }, 'Capitaux transmis (primes)'));
        c.append(moneyInput('c-b' + i + '-cap'));
        c.append(el('label', { class: 'field-label', style: 'font-size:16px;margin-top:14px' }, 'Lien de parenté'));
        c.append(selectField('c-b' + i + '-lien', Object.entries(LIENS), 'direct'));
        benefBox.append(c);
      }
    }
    renderBenefs(1);
    $('select', nbSel).addEventListener('change', e => renderBenefs(parseInt(e.target.value)));
    sheet.append(actions(() => {
      const n = parseInt($('#c-nb').value);
      const beneficiaires = [];
      for (let i = 1; i <= n; i++) beneficiaires.push({ capital: num($('#c-b' + i + '-cap').value), lien: $('#c-b' + i + '-lien').value });
      renderResult(sheet, Calc.art757B({ beneficiaires }));
    }));
    v.append(sheet);
    return v;
  },

  /* -------- Règles générales -------- */
  av_regles() {
    const v = el('div', {});
    v.append(hero('ASSURANCE-VIE', 'Fiscalité décès – Règles générales', ICON_PERSON));
    const sheet = el('div', { class: 'sheet' });
    const c1 = el('div', { class: 'card' }, [el('div', { class: 'section-title' }, 'Date de souscription du contrat')]);
    const seg = el('div', { class: 'seg', id: 'c-sousc' });
    const b1 = el('button', { 'data-val': 'avant', type: 'button' }, [el('span', { class: 'big' }, 'AVANT'), el('span', { class: 'sm' }, 'le 20/11/1991')]);
    const b2 = el('button', { 'data-val': 'apres', type: 'button' }, [el('span', { class: 'big' }, 'APRÈS'), el('span', { class: 'sm' }, 'le 20/11/1991')]);
    b1.classList.add('active'); seg.dataset.value = 'avant';
    [b1, b2].forEach(b => b.onclick = () => { [b1, b2].forEach(x => x.classList.remove('active')); b.classList.add('active'); seg.dataset.value = b.dataset.val; });
    seg.append(b1, b2); c1.append(seg); sheet.append(c1);
    sheet.append(actions(() => {
      renderResult(sheet, Calc.reglesGenerales({ souscription: seg.dataset.value }));
    }));
    v.append(sheet);
    return v;
  },

  /* -------- Rachat -------- */
  av_rachat() {
    const v = el('div', {});
    v.append(hero('ASSURANCE-VIE', 'Fiscalité rachat', ICON_PERSON));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(field('Durée de détention (en années)', stepper('c-duree', 0, 0, 60)));
    sheet.append(field('Produits imposables (intérêts)', moneyInput('c-prod'), 'Part de plus-value comprise dans le rachat'));
    sheet.append(field("Tranche marginale d'imposition", pctInput('c-tmi'), 'Pour comparer avec l’option barème (avant 8 ans)'));
    const cSit = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Situation de famille')]);
    cSit.append(selectField('c-sit', [['seul', 'Célibataire / seul'], ['couple', 'Couple (marié/PACS)']], 'seul'));
    sheet.append(cSit);
    const cP = el('div', { class: 'card' }, [el('label', { class: 'field-label', style:'font-size:17px' }, 'Primes versées après le 27/09/2017 ?')]);
    cP.append(toggleGroup('c-2017', [['oui', 'Oui'], ['non', 'Non']], 'oui'));
    sheet.append(cP);
    sheet.append(actions(() => {
      renderResult(sheet, Calc.rachat({
        duree: parseInt($('#c-duree').value || 0),
        produits: num($('#c-prod').value),
        tmi: num($('#c-tmi').value),
        situation: $('#c-sit').value,
        primesApres2017: getToggle('c-2017') === 'oui',
      }));
    }));
    v.append(sheet);
    return v;
  },

  /* -------- Intérêts simples -------- */
  fin_simple() {
    const v = el('div', {});
    v.append(hero('ACTUALISATION / CAPITALISATION / EMPRUNT', 'Intérêts simples', ICON_CHART));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(field('Capital', moneyInput('c-cap', '0')));
    sheet.append(field("Taux d'intérêt annuel", pctInput('c-taux')));
    sheet.append(field('Nombre de jours placé', stepper('c-jours', 0, 0, 100000)));
    const cBase = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, "Nombre de jours par an")]);
    cBase.append(toggleGroup('c-base', [['360', '360'], ['365', '365']], '365'));
    sheet.append(cBase);
    sheet.append(actions(() => {
      renderResult(sheet, Calc.interetsSimples({
        capital: num($('#c-cap').value), taux: num($('#c-taux').value),
        jours: parseInt($('#c-jours').value || 0), base: parseInt(getToggle('c-base')),
      }));
    }));
    v.append(sheet);
    return v;
  },

  /* -------- Intérêts composés -------- */
  fin_compose() {
    const v = el('div', {});
    v.append(hero('ACTUALISATION / CAPITALISATION / EMPRUNT', 'Intérêts composés', ICON_CHART));
    const sheet = el('div', { class: 'sheet' });
    const cCible = el('div', { class: 'card' }, [el('div', { class: 'section-title' }, 'Valeur à rechercher')]);
    cCible.append(selectField('c-cible', [['future', 'Valeur future'], ['actuelle', 'Valeur actuelle']], 'future'));
    sheet.append(cCible);
    sheet.append(field('Nombre total de périodes', stepper('c-n', 0, 0, 100000)));
    sheet.append(field('Nombre de périodes par an', stepper('c-ppa', 1, 1, 365)));
    sheet.append(field('Valeur actuelle', moneyInput('c-va'), 'Capital de départ (ou valeur future si vous cherchez la VA)'));
    sheet.append(field('Valeur du premier flux', moneyInput('c-flux'), 'Versement périodique constant (0 si aucun)'));
    sheet.append(field("Taux d'intérêt annuel", pctInput('c-taux')));
    sheet.append(actions(() => {
      renderResult(sheet, Calc.interetsComposes({
        cible: $('#c-cible').value,
        nPeriodes: parseInt($('#c-n').value || 0),
        periodesParAn: parseInt($('#c-ppa').value || 1),
        valeurActuelle: num($('#c-va').value),
        premierFlux: num($('#c-flux').value),
        tauxAnnuel: num($('#c-taux').value),
      }));
    }));
    v.append(sheet);
    return v;
  },

  /* -------- Équivalence de taux -------- */
  fin_equiv() {
    const v = el('div', {});
    v.append(hero('ACTUALISATION / CAPITALISATION / EMPRUNT', 'Équivalence de taux', ICON_CHART));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(field('Nombre de périodes par an', stepper('c-ppa', 12, 1, 365)));
    sheet.append(field('Taux périodique de référence', pctInput('c-taux')));
    sheet.append(actions(() => {
      renderResult(sheet, Calc.equivalenceTaux({
        periodesParAn: parseInt($('#c-ppa').value || 1), tauxPeriodique: num($('#c-taux').value),
      }));
    }));
    v.append(sheet);
    return v;
  },

  /* -------- Emprunt -------- */
  fin_emprunt() {
    const v = el('div', {});
    v.append(hero('ACTUALISATION / CAPITALISATION / EMPRUNT', 'Emprunt', ICON_CHART));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(field('Je souhaite emprunter', moneyInput('c-montant')));
    sheet.append(field("Taux d'intérêt annuel", pctInput('c-taux')));
    const cType = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, "Type d'emprunt")]);
    cType.append(selectField('c-type', [['constante', 'Échéance constante'], ['capital', 'Capital constant']], 'constante'));
    sheet.append(cType);
    const cPer = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Périodicité')]);
    cPer.append(selectField('c-per', [['12', 'Mensuelle'], ['4', 'Trimestrielle'], ['2', 'Semestrielle'], ['1', 'Annuelle']], '12'));
    sheet.append(cPer);
    sheet.append(field("Durée d'emprunt (années)", stepper('c-annees', 0, 0, 40)));
    sheet.append(actions(() => {
      renderResult(sheet, Calc.emprunt({
        montant: num($('#c-montant').value), tauxAnnuel: num($('#c-taux').value),
        type: $('#c-type').value, periodesParAn: parseInt($('#c-per').value), annees: parseInt($('#c-annees').value || 0),
      }));
    }));
    v.append(sheet);
    return v;
  },

  /* -------- Compte -------- */
  /* ======================= MENUS DE CATÉGORIE ======================= */
  part() {
    const v = el('div', {});
    v.append(hero('CALCULATRICE', 'Fiscalité des particuliers'));
    const sheet = el('div', { class: 'sheet' });
    [
      ["Calcul de l'impôt sur le revenu", 'p_ir'],
      ['CEHR', 'p_cehr'],
      ['Dividendes', 'p_div'],
      ['Plafonnement des niches fiscales', 'p_niches'],
      ['Plus-values de cession de valeurs mobilières', 'p_pvm'],
    ].forEach(([t, key]) => sheet.append(el('div', { class: 'menu-item', onclick: () => Router.go(key) }, [el('div', { class: 'mt' }, t), el('div', { class: 'ma' })])));
    v.append(sheet); return v;
  },
  immo() {
    const v = el('div', {});
    v.append(hero('CALCULATRICE', 'Immobilier'));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(el('div', { class: 'group-label' }, 'Calculatrices'));
    [
      ['Frais de notaire (acquisition)', 'i_dmto'],
      ['IFI', 'i_ifi'],
      ['Plus-values immobilières des particuliers', 'i_pvimmo'],
      ['Revenus fonciers', 'i_foncier'],
      ['Démembrement', 'i_demembrement'],
    ].forEach(([t, key]) => sheet.append(el('div', { class: 'menu-item', onclick: () => Router.go(key) }, [el('div', { class: 'mt' }, t), el('div', { class: 'ma' })])));
    sheet.append(el('div', { class: 'group-label' }, 'Simulateurs'));
    [['Immobilier locatif — TRI', 'sim_immo'], ['SCI à l\'IS vs SCI à l\'IR', 'sim_sci'], ['Acheter vs Louer', 'sim_achat']]
      .forEach(([t, key]) => simMenuItem(sheet, t, key));
    v.append(sheet); return v;
  },
  transmission() {
    const v = el('div', {});
    v.append(hero('CALCULATRICE', 'Transmission d\'entreprise'));
    const sheet = el('div', { class: 'sheet' });
    [['Pacte Dutreil (787 B)', 'sim_dutreil'], ['Apport-cession 150-0 B ter', 'sim_apport']]
      .forEach(([t, key]) => simMenuItem(sheet, t, key));
    v.append(sheet); return v;
  },
  epargne() {
    const v = el('div', {});
    v.append(hero('CALCULATRICE', 'Épargne & retraite'));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(el('div', { class: 'group-label' }, 'Simulateurs'));
    [['Épargne-retraite (Monte Carlo)', 'sim_retraite'], ['Capital par classe d\'actifs', 'sim_capital']]
      .forEach(([t, key]) => simMenuItem(sheet, t, key));
    sheet.append(el('div', { class: 'group-label' }, 'Mes dossiers'));
    simMenuItem(sheet, '★ Mes simulations enregistrées', 'sim_saved');
    v.append(sheet); return v;
  },
  succ() {
    const v = el('div', {});
    v.append(hero('CALCULATRICE', 'Succession / Donation'));
    const sheet = el('div', { class: 'sheet' });
    [
      ['Fiscalité – DMTG – Donations avec droits inclus', 's_inclus'],
      ['Fiscalité – DMTG – Droits simples', 's_simples'],
    ].forEach(([t, key]) => sheet.append(el('div', { class: 'menu-item', onclick: () => Router.go(key) }, [el('div', { class: 'mt' }, t), el('div', { class: 'ma' })])));
    v.append(sheet); return v;
  },
  soc() {
    const v = el('div', {});
    v.append(hero('CALCULATRICE', 'Société'));
    const sheet = el('div', { class: 'sheet' });
    [['IS', 'soc_is']].forEach(([t, key]) => sheet.append(el('div', { class: 'menu-item', onclick: () => Router.go(key) }, [el('div', { class: 'mt' }, t), el('div', { class: 'ma' })])));
    v.append(sheet); return v;
  },

  /* ======================= FISCALITÉ DES PARTICULIERS ======================= */
  p_ir() {
    const v = el('div', {});
    v.append(hero('FISCALITÉ DES PARTICULIERS', "Calcul de l'impôt sur le revenu"));
    const sheet = el('div', { class: 'sheet' });
    const cAn = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, "Imposition des revenus de")]);
    cAn.append(selectField('c-annee', [['2025', 'Année 2025'], ['2024', 'Année 2024']], '2025'));
    sheet.append(cAn);
    const cSit = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Je suis')]);
    cSit.append(selectField('c-sit', [['celib', 'Célibataire'], ['couple', 'Marié.e / Pacsé.e']], 'celib'));
    sheet.append(cSit);
    sheet.append(field('Revenu net global imposable', moneyInput('c-rev')));
    sheet.append(field('Nombre de parts du foyer fiscal', stepperDecimal('c-parts', 1, 1, 20, 0.5)));
    sheet.append(actions(() => {
      const annee = $('#c-annee').value === '2024' ? 2024 : 2025;
      renderResult(sheet, Calc.impotRevenu({ annee, revenuImposable: num($('#c-rev').value), parts: parseFloat($('#c-parts').value) || 1, couple: $('#c-sit').value === 'couple' }));
    }));
    v.append(sheet); return v;
  },
  p_cehr() {
    const v = el('div', {});
    v.append(hero('FISCALITÉ DES PARTICULIERS', 'CEHR'));
    const sheet = el('div', { class: 'sheet' });
    const cSit = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Je suis')]);
    cSit.append(toggleGroup('c-sit', [['seul', 'Seul.e'], ['couple', 'Couple']], 'seul'));
    sheet.append(cSit);
    sheet.append(field('Revenu fiscal de référence', moneyInput('c-rfr')));
    sheet.append(actions(() => renderResult(sheet, Calc.cehr({ situation: getToggle('c-sit'), rfr: num($('#c-rfr').value) }))));
    v.append(sheet); return v;
  },
  p_div() {
    const v = el('div', {});
    v.append(hero('FISCALITÉ DES PARTICULIERS', 'Dividendes'));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(field('Dividendes bruts perçus', moneyInput('c-montant')));
    const cOpt = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, "Option barème progressif")]);
    cOpt.append(toggleGroup('c-opt', [['non', 'Non (PFU)'], ['oui', 'Oui']], 'non'));
    sheet.append(cOpt);
    sheet.append(field("Tranche marginale d'imposition", pctInput('c-tmi'), 'Utile uniquement si option barème'));
    sheet.append(actions(() => renderResult(sheet, Calc.dividendes({ montant: num($('#c-montant').value), tmi: num($('#c-tmi').value), optionBareme: getToggle('c-opt') === 'oui' }))));
    v.append(sheet); return v;
  },
  p_niches() {
    const v = el('div', {});
    v.append(hero('FISCALITÉ DES PARTICULIERS', 'Plafonnement des niches fiscales'));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(field('Impôt brut', moneyInput('c-impot')));
    sheet.append(field('RICI soumises au plafonnement', moneyInput('c-soum'), 'Réductions et crédits d’impôt soumis au plafond de 10 000 €'));
    sheet.append(field('RICI éligibles au plafonnement majoré', moneyInput('c-maj'), 'Outre-mer / Sofica (plafond +8 000 €)'));
    sheet.append(field('RICI hors plafonnement', moneyInput('c-hors')));
    sheet.append(actions(() => renderResult(sheet, Calc.plafondNiches({ impotBrut: num($('#c-impot').value), riciSoumises: num($('#c-soum').value), riciMajorees: num($('#c-maj').value), riciHors: num($('#c-hors').value) }))));
    v.append(sheet); return v;
  },
  p_pvm() {
    const v = el('div', {});
    v.append(hero('FISCALITÉ DES PARTICULIERS', 'Plus-values de cession de valeurs mobilières'));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(field('Plus ou moins-value', moneyInput('c-pv')));
    const cBar = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Option globale barème progressif')]);
    cBar.append(toggleGroup('c-bar', [['non', 'Non'], ['oui', 'Oui']], 'non'));
    sheet.append(cBar);
    const cRet = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Régime départ à la retraite applicable')]);
    cRet.append(toggleGroup('c-ret', [['non', 'Non'], ['oui', 'Oui']], 'non'));
    sheet.append(cRet);
    sheet.append(field("Tranche marginale d'imposition", pctInput('c-tmi'), 'Si option barème'));
    sheet.append(actions(() => renderResult(sheet, Calc.pvMobilieres({ pv: num($('#c-pv').value), optionBareme: getToggle('c-bar') === 'oui', tmi: num($('#c-tmi').value), departRetraite: getToggle('c-ret') === 'oui' }))));
    v.append(sheet); return v;
  },

  /* ======================= IMMOBILIER ======================= */
  i_dmto() {
    const v = el('div', {});
    v.append(hero('IMMOBILIER', 'Frais de notaire'));
    const sheet = el('div', { class: 'sheet' });
    const cTB = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Type de bien')]);
    cTB.append(selectField('c-tb', [['ancien', 'Ancien'], ['neuf', 'Neuf / VEFA']], 'ancien'));
    sheet.append(cTB);
    const cDep = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Département (droits de mutation)')]);
    const depts = Object.keys(DMTO_DEPTS).concat(['Autre département']);
    cDep.append(selectField('c-dep', depts.map(d => [d, d]), '56 Morbihan'));
    sheet.append(cDep);
    const tbSel = cTB.querySelector('select');
    const syncDep = () => { cDep.style.display = tbSel.value === 'neuf' ? 'none' : ''; };
    tbSel.addEventListener('change', syncDep); syncDep();
    sheet.append(field('Valeur acquisition hors frais', moneyInput('c-val')));
    sheet.append(field('Débours notaire', moneyInput('c-deb', '1200')));
    sheet.append(actions(() => renderResult(sheet, Calc.dmtoAchat({ departement: $('#c-dep').value, valeur: num($('#c-val').value), typeBien: $('#c-tb').value, debours: num($('#c-deb').value) }))));
    v.append(sheet); return v;
  },
  i_ifi() {
    const v = el('div', {});
    v.append(hero('IMMOBILIER', 'IFI'));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(field("Détermination de l'actif net imposable", moneyInput('c-actif'), 'Patrimoine immobilier net taxable'));
    sheet.append(field("Réductions d'IFI", moneyInput('c-red'), 'Dons éligibles, etc. (optionnel)'));
    sheet.append(actions(() => renderResult(sheet, Calc.ifi({ actifNetImposable: num($('#c-actif').value), reductions: num($('#c-red').value) }))));
    v.append(sheet); return v;
  },
  i_pvimmo() {
    const v = el('div', {});
    v.append(hero('IMMOBILIER', 'Plus-values immobilières des particuliers'));
    const sheet = el('div', { class: 'sheet' });
    const cTab = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Terrain à bâtir')]);
    cTab.append(selectField('c-tab', [['non', 'Non'], ['oui', 'Oui']], 'non'));
    sheet.append(cTab);
    sheet.append(field('Durée de détention (en années)', stepper('c-duree', 0, 0, 60)));
    sheet.append(field('Prix de cession', moneyInput('c-pc')));
    sheet.append(field('Frais de cession', moneyInput('c-fc')));
    sheet.append(field('Prix acquisition', moneyInput('c-pa')));
    const cFa = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, "Frais d'acquisition")]);
    cFa.append(toggleGroup('c-fa', [['forfait', 'Forfait 7,5%'], ['reels', 'Frais réels']], 'forfait'));
    cFa.append(el('div', { class: 'input-wrap', id: 'c-fa-wrap', style: 'display:none;margin-top:12px' }, [el('input', { id: 'c-fa-val', class: 'inp text-right', inputmode: 'decimal', placeholder: 'Montant réel' }), el('div', { class: 'suffix' }, '€')]));
    sheet.append(cFa);
    $$('button', cFa).forEach(b => b.addEventListener('click', () => { $('#c-fa-wrap').style.display = getToggle('c-fa') === 'reels' ? 'block' : 'none'; }));
    sheet.append(field('Frais de travaux (frais réels)', moneyInput('c-trav')));
    const cAb = el('div', { class: 'card' }, [el('label', { class: 'field-label', style: 'font-size:17px' }, 'Abattement pour durée de détention applicable')]);
    cAb.append(toggleGroup('c-ab', [['oui', 'Oui'], ['non', 'Non']], 'oui'));
    sheet.append(cAb);
    sheet.append(actions(() => renderResult(sheet, Calc.pvImmobiliere({
      terrainABatir: $('#c-tab').value === 'oui',
      dureeDetention: parseInt($('#c-duree').value || 0),
      prixCession: num($('#c-pc').value), fraisCession: num($('#c-fc').value),
      prixAcquisition: num($('#c-pa').value),
      fraisAcqForfait: getToggle('c-fa') === 'forfait', fraisAcqReels: num($('#c-fa-val').value),
      fraisTravaux: num($('#c-trav').value), abattementApplicable: getToggle('c-ab') === 'oui',
    }))));
    v.append(sheet); return v;
  },
  i_foncier() {
    const v = el('div', {});
    v.append(hero('IMMOBILIER', 'Revenus fonciers'));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(field('Revenu net foncier', moneyInput('c-rnf'), 'Négatif en cas de déficit'));
    sheet.append(field('Déficit N-10', moneyInput('c-d10')));
    sheet.append(field('Déficit N-9 et antérieurs', moneyInput('c-d9')));
    const cPl = el('div', { class: 'card' }, [el('label', { class: 'field-label' }, 'Plafond du déficit foncier imputable sur le RBG')]);
    cPl.append(selectField('c-plafond', [['-10700', '-10 700 €'], ['-21400', '-21 400 € (rénovation énergétique)']], '-10700'));
    sheet.append(cPl);
    sheet.append(field("Tranche marginale d'imposition", pctInput('c-tmi')));
    sheet.append(actions(() => renderResult(sheet, Calc.revenusFonciers({
      revenuNetFoncier: numSigned($('#c-rnf').value), deficitN10: num($('#c-d10').value), deficitAnterieur: num($('#c-d9').value),
      plafondImputation: num($('#c-plafond').value), tmi: num($('#c-tmi').value),
    }))));
    v.append(sheet); return v;
  },
  i_demembrement() {
    const v = el('div', {});
    v.append(hero('IMMOBILIER', 'Démembrement'));
    const sheet = el('div', { class: 'sheet' });
    const cType = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Type de démembrement')]);
    cType.append(selectField('c-type', [['fixe', 'Durée fixe'], ['viager', 'Viager']], 'fixe'));
    sheet.append(cType);
    const wrapFixe = el('div', { id: 'c-wrap-fixe' });
    wrapFixe.append(field("Durée de l'usufruit à durée fixe (en années)", stepper('c-duree', 0, 0, 99)));
    sheet.append(wrapFixe);
    const wrapViager = el('div', { id: 'c-wrap-viager', style: 'display:none' });
    wrapViager.append(field("Âge de l'usufruitier", stepper('c-age', 0, 0, 110)));
    sheet.append(wrapViager);
    $('select', cType).addEventListener('change', e => {
      const fixe = e.target.value === 'fixe';
      wrapFixe.style.display = fixe ? 'block' : 'none';
      wrapViager.style.display = fixe ? 'none' : 'block';
    });
    const resultBox = el('div', { class: 'seg', style: 'margin-top:8px' });
    const computeDemembrement = () => {
      const type = $('#c-type').value;
      const res = Calc.demembrement({ type, dureeFixe: parseInt($('#c-duree')?.value || 0), ageUsufruitier: parseInt($('#c-age')?.value || 0) });
      resultBox.innerHTML = '';
      resultBox.append(el('div', { class: 'card flat', style: 'flex:1;text-align:center' }, [el('div', { style: 'font-size:28px;font-weight:800' }, pct(res.usufruit)), el('div', { class: 'hint', style: 'margin:6px 0 0' }, "Valeur fiscale de l'usufruit")]));
      resultBox.append(el('div', { class: 'card flat', style: 'flex:1;text-align:center' }, [el('div', { style: 'font-size:28px;font-weight:800' }, pct(res.nuePropriete)), el('div', { class: 'hint', style: 'margin:6px 0 0' }, 'Valeur fiscale de la nue-propriété')]));
    };
    sheet.append(resultBox);
    const a = el('div', { class: 'actions' });
    a.append(el('button', { class: 'btn-primary', type: 'button', onclick: computeDemembrement }, 'Calculer le résultat'));
    a.append(el('button', { class: 'btn-ghost', type: 'button', onclick: () => Router.back() }, 'Retour'));
    sheet.append(a);
    v.append(sheet); return v;
  },

  /* ======================= SUCCESSION / DONATION ======================= */
  s_simples() {
    const v = el('div', {});
    v.append(hero('SUCCESSION / DONATION', 'Fiscalité – DMTG – Droits simples'));
    const sheet = el('div', { class: 'sheet' });
    const cType = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Type de transmission')]);
    cType.append(selectField('c-trans', [['donation', 'Donation'], ['succession', 'Succession']], 'donation'));
    sheet.append(cType);
    const cLien = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Lien de parenté entre le donateur et le donataire')]);
    const lienSel = selectField('c-lien', Object.entries(LIENS_DMTG), 'conjoint');
    cLien.append(lienSel);
    const abLabel = el('div', { class: 'field-label center', style: 'margin-top:14px;color:#8B8FA8' }, "Montant de l'abattement théorique");
    const abValue = el('div', { style: 'text-align:center;font-size:22px;font-weight:800;margin-bottom:6px' });
    cLien.append(abLabel, abValue);
    sheet.append(cLien);
    const refreshAbat = () => { const ab = abattementDMTG($('select', lienSel).value, $('select', cType).value); abValue.textContent = isFinite(ab) ? eur(ab) : 'Exonéré'; };
    $('select', lienSel).addEventListener('change', refreshAbat);
    $('select', cType).addEventListener('change', refreshAbat);
    refreshAbat();
    sheet.append(field('Montant de la transmission', moneyInput('c-montant')));
    const cHand = el('div', { class: 'card' }, [el('label', { class: 'field-label', style: 'font-size:17px' }, 'Bénéficiaire en situation de handicap')]);
    cHand.append(toggleGroup('c-hand', [['oui', 'Oui'], ['non', 'Non']], 'non'));
    sheet.append(cHand);
    const cRappel = el('div', { class: 'card' }, [el('label', { class: 'field-label', style: 'font-size:17px' }, 'Rappel fiscal (abattement déjà consommé)')]);
    cRappel.append(toggleGroup('c-rappel', [['oui', 'Oui'], ['non', 'Non']], 'non'));
    cRappel.append(el('div', { class: 'input-wrap', id: 'c-rappel-wrap', style: 'display:none;margin-top:12px' }, [el('input', { id: 'c-rappel-val', class: 'inp text-right', inputmode: 'decimal', placeholder: 'Montant déjà consommé' }), el('div', { class: 'suffix' }, '€')]));
    sheet.append(cRappel);
    $$('button', cRappel).forEach(b => b.addEventListener('click', () => { $('#c-rappel-wrap').style.display = getToggle('c-rappel') === 'oui' ? 'block' : 'none'; }));
    sheet.append(actions(() => renderResult(sheet, Calc.dmtgDroitsSimples({
      typeTransmission: $('#c-trans').value, lien: $('#c-lien').value, montant: num($('#c-montant').value),
      handicap: getToggle('c-hand') === 'oui', abattementConsomme: getToggle('c-rappel') === 'oui' ? num($('#c-rappel-val').value) : 0,
    }))));
    v.append(sheet); return v;
  },
  s_inclus() {
    const v = el('div', {});
    v.append(hero('SUCCESSION / DONATION', 'Fiscalité – DMTG – Donations avec droits inclus'));
    const sheet = el('div', { class: 'sheet' });
    const cLien = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Lien de parenté entre le donateur et le donataire')]);
    cLien.append(selectField('c-lien', Object.entries(LIENS_DMTG), 'enfant'));
    sheet.append(cLien);
    sheet.append(field('Coût total de la donation (donation + droits)', moneyInput('c-cout')));
    const cHand = el('div', { class: 'card' }, [el('label', { class: 'field-label', style: 'font-size:17px' }, 'Bénéficiaire en situation de handicap')]);
    cHand.append(toggleGroup('c-hand', [['oui', 'Oui'], ['non', 'Non']], 'non'));
    sheet.append(cHand);
    sheet.append(field("Montant de l'abattement consommé", moneyInput('c-conso')));
    sheet.append(actions(() => renderResult(sheet, Calc.dmtgDroitsInclus({
      lien: $('#c-lien').value, coutTotal: num($('#c-cout').value),
      handicap: getToggle('c-hand') === 'oui', abattementConsomme: num($('#c-conso').value),
    }))));
    v.append(sheet); return v;
  },

  /* ======================= SOCIÉTÉ ======================= */
  soc_is() {
    const v = el('div', {});
    v.append(hero('SOCIÉTÉ', 'IS'));
    const sheet = el('div', { class: 'sheet' });
    const cTr = el('div', { class: 'card' }, [el('label', { class: 'field-label center' }, 'Taux réduit PME applicable')]);
    cTr.append(selectField('c-tr', [['oui', 'Oui'], ['non', 'Non']], 'oui'));
    sheet.append(cTr);
    sheet.append(field('Résultat comptable avant IS', moneyInput('c-rc')));
    sheet.append(field('Réintégrations fiscales', moneyInput('c-rein')));
    sheet.append(field('Déductions fiscales', moneyInput('c-ded')));
    sheet.append(actions(() => renderResult(sheet, Calc.is({
      resultatComptable: num($('#c-rc').value), reintegrations: num($('#c-rein').value),
      deductions: num($('#c-ded').value), tauxReduit: $('#c-tr').value === 'oui',
    }))));
    v.append(sheet); return v;
  },

  account() {
    const v = el('div', {});
    v.append(hero('MON ESPACE', 'Compte', ICON_PERSON));
    const sheet = el('div', { class: 'sheet' });
    const name = (State.user && (State.user.user_metadata?.name)) || (State.user && State.user.email) || '—';
    const email = (State.user && State.user.email) || '—';
    const c = el('div', { class: 'card' });
    c.append(el('div', { class: 'result', style: 'margin:0' }, [
      el('div', { class: 'row' }, [el('span', { class: 'k' }, 'Nom'), el('span', { class: 'v' }, name)]),
      el('div', { class: 'row' }, [el('span', { class: 'k' }, 'E-mail'), el('span', { class: 'v', style:'font-size:15px' }, email)]),
      el('div', { class: 'row' }, [el('span', { class: 'k' }, 'Mode'), el('span', { class: 'v', style:'font-size:15px' }, SUPA_ON && supa ? 'Serveur sécurisé' : 'Démo local')]),
    ]));
    sheet.append(c);
    sheet.append(el('div', { class: 'menu-item', style: 'margin-top:4px', onclick: () => Router.go('profil') }, [
      el('div', {}, [el('div', { class: 'mt', style: 'font-size:19px' }, 'Mon profil & logo'), el('div', { class: 'hint', style: 'margin:6px 0 0' }, 'Coordonnées et logo repris sur les exports PDF / Excel')]),
      el('div', { class: 'ma' })
    ]));
    sheet.append(el('button', { class: 'btn-ghost', style: 'margin-top:14px', onclick: () => Auth.signOut() }, 'Se déconnecter'));
    v.append(sheet);
    return v;
  },

  notif() {
    const v = el('div', {});
    v.append(hero('', 'Notifications', ICON_PERSON));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(el('div', { class: 'card' }, el('div', { class: 'hint', style: 'margin:0;font-size:15px' }, 'Aucune notification pour le moment.')));
    v.append(sheet);
    return v;
  },

  paywall() {
    const v = el('div', {});
    v.append(hero('MON KAP PRO', 'Choisissez votre offre'));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(el('div', { class: 'hint', style: 'margin:-4px 2px 14px;font-size:14px' }, 'Votre essai gratuit est terminé. Choisissez une formule pour continuer (sans engagement, résiliable à tout moment).'));
    const feat = (t) => el('div', { style: 'display:flex;gap:8px;align-items:flex-start;margin-top:7px' }, [el('span', { style: 'color:#12B981;font-weight:800' }, '✓'), el('span', { style: 'font-size:13px;color:#3A4063;line-height:1.4' }, t)]);
    const card = (badge, price, feats, plan, hl) => {
      const c = el('div', { class: 'card', style: 'border:2px solid ' + (hl ? '#12B981' : 'var(--line)') });
      c.append(el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
        el('div', { style: 'font-weight:800;font-size:17px;color:var(--ink)' }, badge),
        el('div', { style: 'font-weight:800;font-size:18px;color:var(--navy)' }, price)
      ]));
      feats.forEach(f => c.append(feat(f)));
      c.append(el('button', { class: 'btn-primary', style: 'margin-top:14px;padding:15px;font-size:16px' + (hl ? ';background:#12B981;color:#08362a' : ''), onclick: () => Billing.checkout(plan) }, 'Choisir cette offre'));
      return c;
    };
    sheet.append(card('Immobilier', (cfg.PRICE_IMMO || '4,99 € TTC/mois'),
      ['Toutes les calculatrices fiscales', 'SCI à l\'IS vs SCI à l\'IR', 'Immobilier locatif — TRI (7 régimes)', 'Acheter vs Louer'], 'immo', false));
    sheet.append(card('Intégrale', (cfg.PRICE_ALL || '9,99 € TTC/mois'),
      ['Tout l\'offre Immobilier, plus :', 'Épargne-retraite (Monte Carlo)', 'Capital par classe d\'actifs', 'Pacte Dutreil & Apport-cession 150-0 B ter'], 'all', true));
    sheet.append(el('button', { class: 'btn-ghost', style: 'margin-top:6px', onclick: () => Billing.refresh() }, 'J\'ai déjà payé — actualiser'));
    sheet.append(el('button', { class: 'btn-ghost', style: 'margin-top:12px', onclick: () => Auth.signOut() }, 'Se déconnecter'));
    v.append(sheet);
    return v;
  },

  upgrade() {
    const v = el('div', {});
    v.append(hero('MON KAP PRO', 'Offre Intégrale'));
    const sheet = el('div', { class: 'sheet' });
    sheet.append(el('div', { class: 'card' }, [
      el('div', { class: 'section-title', style: 'font-size:19px' }, 'Réservé à l\'offre Intégrale'),
      el('div', { class: 'hint', style: 'margin:0;font-size:14px' }, 'Ce simulateur (retraite, capitalisation, Dutreil, apport-cession) est inclus dans l\'offre Intégrale ' + (cfg.PRICE_ALL || '9,99 € TTC/mois') + '.')
    ]));
    sheet.append(el('button', { class: 'btn-primary', style: 'margin-top:8px;background:#12B981;color:#08362a', onclick: () => Billing.checkout('all') }, 'Passer à l\'offre Intégrale'));
    sheet.append(el('button', { class: 'btn-ghost', style: 'margin-top:12px', onclick: () => Router.back() }, 'Retour'));
    v.append(sheet);
    return v;
  },
};

/* ============================================================
   ROUTEUR
   ============================================================ */
const Router = {
  stack: [],
  go(key, push = true) {
    const fn = Screens[key];
    if (!fn) return;
    if (push) this.stack.push(key);
    const view = $('#view');
    view.innerHTML = '';
    view.append(fn());
    window.scrollTo(0, 0);
    // bottom nav highlight
    $$('.bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.nav === key));
    $('#btn-back').style.visibility = this.stack.length > 1 ? 'visible' : 'hidden';
  },
  back() {
    if (this.stack.length > 1) { this.stack.pop(); this.go(this.stack[this.stack.length - 1], false); }
  },
  reset(key) { this.stack = [key]; this.go(key, false); }
};

/* ============================================================
   BOOT
   ============================================================ */
$('#auth-submit').addEventListener('click', () => Auth.submit());
$('#auth-pass').addEventListener('keydown', e => { if (e.key === 'Enter') Auth.submit(); });
$('#auth-switch-link').addEventListener('click', () => Auth.toggleMode());
$('#auth-forgot').addEventListener('click', () => Auth.forgot());
$('#btn-back').addEventListener('click', () => Router.back());
$$('.bottomnav button').forEach(b => b.addEventListener('click', () => {
  const nav = b.dataset.nav;
  if (nav === 'home') Router.reset('home');
  else Router.reset(nav);
}));

Auth.init();
