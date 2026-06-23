// Webhook Stripe -> Supabase, hébergé sur Vercel (zéro dépendance).
// Variables d'environnement à définir dans Vercel (Settings -> Environment Variables) :
//   STRIPE_WEBHOOK_SECRET   = whsec_...        (secret de signature du webhook Stripe)
//   STRIPE_SECRET_KEY       = sk_test_... ou sk_live_...
//   SUPABASE_URL            = https://ovxalcnumxxelxprdmjg.supabase.co
//   SUPABASE_SERVICE_KEY    = sb_secret_...     (clé "Secret" Supabase — JAMAIS côté navigateur)
//   STRIPE_PRICE_ALL        = price_...         (id du prix de l'offre 9,99 €)
//
// Stripe -> Webhooks -> endpoint = https://<ton-app>.vercel.app/api/stripe-webhook
// Évènements : checkout.session.completed, customer.subscription.updated,
//              customer.subscription.deleted, invoice.paid

const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

  // 1) Lire le corps BRUT (indispensable pour vérifier la signature Stripe)
  const raw = await readRawBody(req);

  // 2) Vérifier la signature Stripe
  const sig = req.headers['stripe-signature'] || '';
  if (!verifyStripeSignature(raw, sig, process.env.STRIPE_WEBHOOK_SECRET)) {
    res.status(400).send('Bad signature'); return;
  }

  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); }
  catch (e) { res.status(400).send('Bad JSON'); return; }

  // 3) Traiter l'évènement
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

async function supaUpdate(filter, fields) {
  const url = process.env.SUPABASE_URL + '/rest/v1/profiles?' + filter;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(fields)
  });
  if (!r.ok) throw new Error('Supabase update -> ' + r.status + ' ' + (await r.text()));
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
    if (s.client_reference_id) {
      await supaUpdate('id=eq.' + encodeURIComponent(s.client_reference_id), fields);
    } else if (s.customer_details && s.customer_details.email) {
      await supaUpdate('email=eq.' + encodeURIComponent(s.customer_details.email.toLowerCase()), fields);
    }
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
