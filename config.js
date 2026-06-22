// ============================================================
//  CONFIGURATION — Mon Kap Pro
//   1) Supabase (comptes + données) : URL + clé "anon public"
//   2) Stripe : 2 liens de paiement (offre Immobilier / offre Intégrale)
//  Tant que c'est vide, l'app tourne en MODE DÉMO (local).
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://ovxalcnumxxelxprdmjg.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92eGFsY251bXh4ZWx4cHJkbWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzAxODMsImV4cCI6MjA5NzEwNjE4M30.F8oRmjbV4FkdMbYTKwloD0bWaT1eh0hQGsO1dFHvus8",

  // Abonnement
  TRIAL_DAYS: 30,
  PRICE_IMMO: "4,99 € TTC/mois",   // offre Immobilier
  PRICE_ALL:  "9,99 € TTC/mois",   // offre Intégrale (tous les simulateurs)
  STRIPE_LINK_IMMO: "https://buy.stripe.com/00w4gy9wI7QigOmaLG1gs01",            // Payment Link Stripe — 4,99 €/mois
  STRIPE_LINK_ALL:  "https://buy.stripe.com/aFabJ07oAc6ycy69HC1gs00",            // Payment Link Stripe — 9,99 €/mois
};
