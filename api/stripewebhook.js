// Webhook Stripe -> Supabase, hébergé sur Vercel (zéro dépendance).
// Variables d'environnement à définir dans Vercel (Settings -> Environment Variables) :
//   STRIPE_WEBHOOK_SECRET   = whsec_...
//   STRIPE_SECRET_KEY       = sk_live_... (ou sk_test_...)
//   SUPABASE_URL            = https://ovxalcnumxxelxprdmjg.supabase.co   (SANS /rest/v1, sans slash final)
//   SUPABASE_SERVICE_KEY    = sb_secret_...   (clé "Secret" Supabase — JAMAIS côté navigateur)
//   STRIPE_PRICE_ALL        = price_...        (id du prix de l'offre 9,99 €)

const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

  const raw = await readRawBody(req);

  const sig = req.headers['stripe-signature'] || '';
  if (!verifyStripeSignature(raw, sig, process.env.STRIPE_WEBHOOK_SECRET)) {
    res.status(400).send('Bad signature'); return;
  }

  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); }
  catch (e) { res.status(400).send('Bad JSON'); return; }

  try {
    await handleEvent(evt);
  } catch (e) {
    console.error('handler error', e);
    res.status(500).send('Handler error: ' + (e && e.message)); return;
  }
  res.status(200).send('ok');
};

// ---------- utilitaires ----------

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBuf, header, secret) {
  if (!secret || !header) return false;
  const parts = {};
  header.split(',').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  const t = parts['t'], v1 = parts['v1'];
  if (!t || !v1) return false;
  const signedPayload = t + '.' + rawBuf.toString('utf8');
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(v1);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function stripeGet(path) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY }
  });
  if (!r.ok) throw new Error('Stripe ' + path + ' -> ' + r.status);
  return r.json();
}

// Renvoie le NOMBRE de lignes mises à jour (grâce à return=representation)
async function supaUpdate(filter, fields) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const url = base + '/rest/v1/profiles?' + filter;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(fields)
  });
  const text = await r.text();
  if (!r.ok) throw new Error('Supabase update -> ' + r.status + ' ' + text);
  let rows = [];
  try { rows = JSON.parse(text); } catch (_) {}
  return Array.isArray(rows) ? rows.length : 0;
}

function planFromPrice(priceId) {
  return priceId && priceId === process.env.STRIPE_PRICE_ALL ? 'all' : 'immo';
}

async function handleEvent(evt) {
  if (evt.type === 'checkout.session.completed') {
    const s = evt.data.object;
    const sub = s.subscription ? await stripeGet('subscriptions/' + s.subscription) : null;
    const end = sub ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const plan = planFromPrice(sub && sub.items && sub.items.data[0] && sub.items.data[0].price.id);
    const fields = {
      subscription_status: 'active', plan,
      current_period_end: end, stripe_customer_id: s.customer
    };
    const email = (s.customer_details && s.customer_details.email)
      ? s.customer_details.email.toLowerCase()
      : (s.customer_email ? s.customer_email.toLowerCase() : null);

    let n = 0;
    const tried = [];
    if (s.client_reference_id) {
      tried.push('id=' + s.client_reference_id);
      n = await supaUpdate('id=eq.' + encodeURIComponent(s.client_reference_id), fields);
    }
    if (n === 0 && email) {
      tried.push('email=' + email);
      n += await supaUpdate('email=eq.' + encodeURIComponent(email), fields);
    }
    if (n === 0) throw new Error('No profile matched (' + (tried.join('  ') || 'aucun identifiant dans la session') + ')');
  } else if (evt.type === 'customer.subscription.updated' || evt.type === 'invoice.paid') {
    const sub = (evt.type === 'invoice.paid')
      ? await stripeGet('subscriptions/' + evt.data.object.subscription)
      : evt.data.object;
    const active = sub.status === 'active' || sub.status === 'trialing';
    await supaUpdate('stripe_customer_id=eq.' + encodeURIComponent(sub.customer), {
      subscription_status: active ? 'active' : 'expired',
      plan: planFromPrice(sub.items && sub.items.data[0] && sub.items.data[0].price.id),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString()
    });
  } else if (evt.type === 'customer.subscription.deleted') {
    const sub = evt.data.object;
    await supaUpdate('stripe_customer_id=eq.' + encodeURIComponent(sub.customer),
      { subscription_status: 'canceled' });
  }
}
