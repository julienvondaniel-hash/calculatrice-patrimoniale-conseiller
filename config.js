// ============================================================
//  CONFIGURATION — Mon Kap Pro
//   1) Supabase (comptes + données) : URL + clé "anon public"
//   2) Stripe : 2 liens de paiement (offre Immobilier / offre Intégrale)
//  Tant que c'est vide, l'app tourne en MODE DÉMO (local).
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Abonnement
  TRIAL_DAYS: 30,
  PRICE_IMMO: "4,99 € TTC/mois",   // offre Immobilier
  PRICE_ALL:  "9,99 € TTC/mois",   // offre Intégrale (tous les simulateurs)
  STRIPE_LINK_IMMO: "",            // Payment Link Stripe — 4,99 €/mois
  STRIPE_LINK_ALL:  "",            // Payment Link Stripe — 9,99 €/mois
};
