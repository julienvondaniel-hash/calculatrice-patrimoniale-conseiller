# Mode opératoire — Mon Kap Pro (PWA professionnelle)

Application web installable, avec **comptes utilisateurs sécurisés (Supabase)**, **enregistrement
des simulations dans le cloud**, et **déploiement professionnel sur Vercel**.
Utilisable depuis un **navigateur** (ordinateur ou téléphone), en ligne et hors-ligne.

---

## 1. Contenu du package
```
calculatrice-patrimoniale/
├── index.html              ← page principale
├── app.js                  ← calculatrices fiscales (assurance-vie, IR, immobilier, succession…)
├── simulateurs.js          ← 7 simulateurs + enregistrement des simulations
├── config.js               ← À RENSEIGNER : clés Supabase (comptes + stockage)
├── sw.js                   ← service worker (mode hors-ligne / PWA)
├── manifest.webmanifest    ← manifeste d'installation
├── vercel.json             ← configuration de déploiement Vercel
├── supabase-schema.sql     ← schéma de base de données à exécuter dans Supabase
├── icon-192.png, icon-512.png
├── README.md
└── MODE_OPERATOIRE.md      ← ce document
```

---

## 2. Vue d'ensemble (3 briques)
| Brique | Rôle | Coût |
|---|---|---|
| **Vercel** | héberge l'app, donne une URL https publique professionnelle | gratuit |
| **Supabase** | comptes utilisateurs + base de données (simulations enregistrées) | gratuit |
| **PWA** | installation sur l'écran d'accueil du téléphone, hors-ligne | inclus |

> Sans configuration, l'app fonctionne en **mode démo** (comptes + simulations stockés
> localement sur l'appareil). Les étapes 3 et 4 activent le **vrai backend professionnel**.

---

## 3. Configurer Supabase (comptes + stockage des données) — ~5 min

1. Crée un compte gratuit sur **https://supabase.com** → **New project** (choisis une région UE,
   ex. *Frankfurt*, et note le mot de passe de la base).
2. **Authentication → Providers → Email** : active-le.
   *(Option confort : désactive « Confirm email » pour une connexion immédiate sans e-mail de validation.)*
3. **SQL Editor → New query** : copie-colle tout le contenu de **`supabase-schema.sql`**, puis **Run**.
   → Cela crée la table `simulations` et la sécurité (chaque utilisateur ne voit que **ses** données).
4. **Project Settings → API** : copie **Project URL** et la clé **anon public**.
5. Ouvre **`config.js`** et colle-les :
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://xxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOiJ...",
   };
   ```
6. Enregistre. (Re-déploie si déjà en ligne — voir étape 4.)

Désormais : **comptes sécurisés côté serveur** + **simulations enregistrées dans le cloud**,
accessibles depuis n'importe quel appareil avec le même identifiant.

---

## 4. Déployer sur Vercel — ~3 min

### Option A — la plus simple (sans Git, par glisser-déposer)
1. Installe l'outil en ligne de commande (une seule fois) :
   ```bash
   npm i -g vercel
   ```
2. Dans un terminal, place-toi dans le dossier `calculatrice-patrimoniale` puis :
   ```bash
   vercel
   ```
   - Connecte-toi (e-mail), accepte les valeurs par défaut.
   - Vercel publie le dossier et te donne une **URL https** (ex. `https://calculatrice-patrimoniale.vercel.app`).
3. Pour la version définitive (production) :
   ```bash
   vercel --prod
   ```

### Option B — via le site Vercel (avec GitHub)
1. Mets le dossier dans un dépôt **GitHub**.
2. Sur **https://vercel.com** → **Add New → Project** → importe le dépôt → **Deploy**.
3. À chaque `git push`, Vercel redéploie automatiquement.

> `vercel.json` est déjà fourni : URLs propres, en-têtes de sécurité, et `config.js`/`sw.js`
> non sur-cachés (pour que tes clés et mises à jour soient prises en compte immédiatement).

---

## 5. Accéder depuis ton téléphone

1. Ouvre l'**URL Vercel** sur le téléphone (envoie-la-toi par SMS, ou scanne un QR code de l'URL).
2. **Installe l'app sur l'écran d'accueil** :
   - **iPhone (Safari obligatoire)** : bouton **Partager** ↑ → **« Sur l'écran d'accueil »** → Ajouter.
   - **Android (Chrome)** : menu **⋮** → **« Installer l'application »** / « Ajouter à l'écran d'accueil ».
3. Lance l'app → **Créer un compte** (ou se connecter). Les **simulations enregistrées** te suivent
   sur tous tes appareils (avec Supabase activé).

---

## 6. Enregistrer & retrouver une simulation
- Dans n'importe quel simulateur, après **« Calculer le résultat »**, touche
  **« 💾 Enregistrer cette simulation »** et donne-lui un nom.
- Retrouve-les dans **Simulateurs → « ★ Mes simulations enregistrées »** :
  - **toucher** une ligne → recharge les paramètres et recalcule ;
  - **« Suppr. »** → supprime.

---

## 7. Les 7 simulateurs
Épargne-retraite (Monte Carlo) · Capital par classe d'actifs · Immobilier locatif — TRI (7 régimes) ·
SCI à l'IS vs IR · Acheter vs Louer · Pacte Dutreil (787 B) · Apport-cession 150-0 B ter.

---

## 8. Recette (tests d'acceptation réalisés) — 11/11 ✅
| Test | Résultat | Statut |
|---|---|---|
| Création de compte / connexion | accès à l'accueil | ✅ |
| Épargne-retraite | 635 194 € · 2 117 / 3 353 €/mois | ✅ |
| Capital (actions) | total versé 58 000 € | ✅ |
| Immobilier — TRI (foncier) | revente 356 252 €, impôt PV 9 805 € | ✅ |
| SCI IS vs IR | IS favorable, TRI cohérents | ✅ |
| Acheter vs Louer | bascule ~6 ans | ✅ |
| Pacte Dutreil | économie 772 162 € | ✅ |
| Apport-cession | gain +259 332 € | ✅ |
| **Enregistrer une simulation** | apparaît dans la liste | ✅ |
| **Recharger une simulation** | paramètres + résultat restaurés | ✅ |
| **Supprimer une simulation** | retirée de la liste | ✅ |

Défaut détecté puis corrigé pendant la recette : écran « Capital » qui ne s'affichait pas — re-testé OK.

---

## 9. Limites & avertissement
- Sur mobile, les simulateurs immobiliers utilisent un modèle de charges allégé ;
  la plus-value et la valeur de revente sont exactes.
- Régimes spécialisés (LMP, MH, déficit foncier, SCI IS) : hypothèses de modélisation documentées.
- Barèmes France 2025/2026. **Résultats indicatifs — ne constituent pas un conseil fiscal.**


## 10. Personnalisation conseiller + exports PDF / Excel
- **Profil conseiller** : barre du bas → icône **profil** → **« Mon profil & logo »**.
  Renseignez **logo**, cabinet, nom, **téléphone, e-mail, adresse**. (Enregistré sur l'appareil.)
- Sur **chaque résultat de simulateur** : boutons **« 📄 PDF »** et **« 📊 Excel »**.
  - **PDF** : ouvre l'aperçu d'impression (choisir « Enregistrer au format PDF ») —
    en-tête avec **votre logo + vos coordonnées**, le détail des résultats, et une mention légale.
  - **Excel** : télécharge un fichier `.xls` (coordonnées + tableau Indicateur / Valeur).
- Si aucun logo n'est importé, l'en-tête affiche par défaut le logo **Mon Kap Pro**.


## 11. Comptes, mot de passe oublié & abonnement (5 €/mois)
**Création de compte / connexion** : écran d'accueil → « Créer un compte ». Avec Supabase activé,
un e-mail de confirmation peut être demandé (paramétrable dans Supabase → Authentication).

**Mot de passe oublié** : sur l'écran de connexion, lien **« Mot de passe oublié ? »** →
saisir l'e-mail → un message de réinitialisation est envoyé (nécessite Supabase). En cliquant
le lien reçu, l'utilisateur revient sur l'app et définit un nouveau mot de passe.

**Essai gratuit 30 jours, puis 2 offres** :
- **Immobilier — 4,99 € TTC/mois** : calculatrices + SCI à l'IS vs IR, Immobilier locatif (TRI), Acheter vs Louer.
- **Intégrale — 9,99 € TTC/mois** : tous les simulateurs (retraite, capital, Dutreil, apport-cession inclus).

- À l'inscription, l'essai démarre automatiquement (table `profiles.trial_start`).
- Pendant l'essai, un bandeau affiche les **jours restants**.
- À l'expiration, l'accès est bloqué par un **écran d'abonnement** (5 €/mois, par utilisateur).
- Paiement par **Stripe** :
  1. Crée **deux** produits/prix Stripe (4,99 € et 9,99 €) → **deux Payment Links**. Colle-les dans
     `config.js` → `STRIPE_LINK_IMMO` et `STRIPE_LINK_ALL`. Renseigne aussi le secret `STRIPE_PRICE_ALL`
     (id du prix 9,99 €) pour que le webhook attribue la bonne offre (`plan = all` sinon `immo`).
  2. Déploie la fonction **`supabase/functions/stripe-webhook`** (code fourni) :
     `supabase functions deploy stripe-webhook --no-verify-jwt` puis `supabase secrets set …`
     (clé secrète Stripe, secret du webhook, URL + clé service_role Supabase).
  3. Dans Stripe → Webhooks, pointe l'endpoint vers cette fonction (évènements `checkout.session.completed`,
     `customer.subscription.updated/deleted`, `invoice.paid`).
  - Le webhook met `profiles.subscription_status = active` → l'utilisateur retrouve l'accès
    (bouton « J'ai déjà payé — actualiser »).
- Exécute la version mise à jour de **`supabase-schema.sql`** (ajoute la table `profiles` + le déclencheur
  qui démarre l'essai à l'inscription).

> En **mode démo** (sans Supabase/Stripe), l'essai et le blocage fonctionnent localement pour
> démonstration ; le paiement réel nécessite la configuration Stripe ci-dessus.
