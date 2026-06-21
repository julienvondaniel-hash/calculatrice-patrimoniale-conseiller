// Supabase Edge Function — webhook Stripe (abonnement Mon Kap Pro)
// Déploiement :
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... \
//                        SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ...
// Dans Stripe → Developers → Webhooks → endpoint = URL de la fonction,
//   évènements : checkout.session.completed, customer.subscription.updated,
//                customer.subscription.deleted, invoice.paid
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const PRICE_ALL = Deno.env.get("STRIPE_PRICE_ALL") || "";   // price_... de l'offre 9,99 €
function planFromPrice(priceId?: string) { return priceId && priceId === PRICE_ALL ? "all" : "immo"; }
const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function setStatus(match: Record<string, unknown>, fields: Record<string, unknown>) {
  await supa.from("profiles").update(fields).match(match);
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  let evt: Stripe.Event;
  try { evt = await stripe.webhooks.constructEventAsync(body, sig, whSecret); }
  catch (e) { return new Response("Bad signature: " + e.message, { status: 400 }); }

  try {
    if (evt.type === "checkout.session.completed") {
      const s = evt.data.object as Stripe.Checkout.Session;
      const userId = s.client_reference_id;
      const sub = s.subscription ? await stripe.subscriptions.retrieve(s.subscription as string) : null;
      const end = sub ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const plan = planFromPrice(sub?.items.data[0]?.price.id);
      if (userId) await setStatus({ id: userId },
        { subscription_status: "active", plan, current_period_end: end, stripe_customer_id: s.customer as string });
      else if (s.customer_details?.email) await setStatus({ email: s.customer_details.email.toLowerCase() },
        { subscription_status: "active", plan, current_period_end: end, stripe_customer_id: s.customer as string });
    } else if (evt.type === "customer.subscription.updated" || evt.type === "invoice.paid") {
      const sub = (evt.type === "invoice.paid")
        ? await stripe.subscriptions.retrieve((evt.data.object as Stripe.Invoice).subscription as string)
        : (evt.data.object as Stripe.Subscription);
      const active = sub.status === "active" || sub.status === "trialing";
      await setStatus({ stripe_customer_id: sub.customer as string },
        { subscription_status: active ? "active" : "expired", plan: planFromPrice(sub.items.data[0]?.price.id), current_period_end: new Date(sub.current_period_end * 1000).toISOString() });
    } else if (evt.type === "customer.subscription.deleted") {
      const sub = evt.data.object as Stripe.Subscription;
      await setStatus({ stripe_customer_id: sub.customer as string }, { subscription_status: "canceled" });
    }
  } catch (e) { return new Response("Handler error: " + e.message, { status: 500 }); }
  return new Response("ok", { status: 200 });
});
