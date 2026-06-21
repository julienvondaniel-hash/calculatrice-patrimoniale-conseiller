# Mon Kap Pro — PWA

Application web installable (assurance-vie + calculs financiers) avec login/mot de passe.
**Coût total : 0 €.**

## Contenu
- `index.html`, `app.js`, `config.js`, `sw.js`, `manifest.webmanifest`, icônes

## Démarrer en 30 secondes (mode démo, sans serveur)
Ouvre simplement `index.html`. Les comptes sont enregistrés localement sur l'appareil.
Tu peux déjà tout tester (créer un compte, te connecter, faire des calculs).

## Mettre en ligne gratuitement (recommandé)
1. Va sur https://app.netlify.com/drop (ou Vercel / Cloudflare Pages)
2. Glisse-dépose le dossier entier. Tu obtiens une URL https publique.
3. Sur ton téléphone, ouvre l'URL → menu Partager → « Sur l'écran d'accueil ».
   L'app s'installe comme une vraie application, fonctionne hors-ligne.

## Activer les VRAIS comptes serveur (Supabase, gratuit)
1. Crée un projet sur https://supabase.com (gratuit, 50 000 utilisateurs/mois)
2. Project Settings → API → copie « Project URL » et la clé « anon public »
3. Colle-les dans `config.js` :
   SUPABASE_URL: "https://xxxx.supabase.co"
   SUPABASE_ANON_KEY: "eyJ..."
4. Dans Supabase → Authentication → Providers → active « Email ».
   (Option : désactive « Confirm email » pour une connexion immédiate sans e-mail de validation.)
5. Re-déploie. Les comptes sont désormais sécurisés côté serveur.

## Calculs inclus
**Assurance-vie** : Fiscalité décès 757 B, 990 I (abattement 152 500 €, vie-génération),
Règles générales (dates 1991/1998), Fiscalité rachat (PFU/PFL + prélèvements sociaux).

**Fiscalité des particuliers** : Impôt sur le revenu (barème 2024/2025 + décote),
CEHR, Dividendes (PFU vs barème), Plafonnement des niches fiscales, Plus-values de
cession de valeurs mobilières.

**Immobilier** : DMTO Achat (par département), IFI (barème 2025), Plus-values
immobilières des particuliers (abattements durée de détention + surtaxe), Revenus
fonciers (déficit foncier), Démembrement (usufruit/nue-propriété art. 669 CGI).

**Succession / Donation** : DMTG droits simples (donation/succession, tous liens de
parenté), DMTG donations avec droits inclus.

**Société** : Impôt sur les sociétés (taux réduit PME 15% / taux normal 25%).

**Finance** : Intérêts simples, intérêts composés (VF/VA), équivalence de taux, emprunt
(échéance constante / capital constant).

Barèmes France 2025. Les résultats sont des estimations indicatives, pas un conseil fiscal.


## 🆕 Simulateurs patrimoniaux (nouvelle catégorie)
Accessibles depuis l'accueil → **« Simulateurs patrimoniaux »** :
- **Épargne-retraite (Monte Carlo)** : capital projeté + rentes (sans toucher / en consommant le capital), fourchette P10/P50/P90 et graphique en éventail.
- **Capital par classe d'actifs** : Monte Carlo avec volatilités historiques (actions, obligations, fonds immobiliers, portefeuille mondial diversifié).
- **Immobilier locatif — TRI** : 7 régimes (revenus fonciers, déficit foncier, LMNP, LMP, SCI à l'IS, Malraux, Monument historique), TRI, effort d'épargne, plus-value et gain net.
- **SCI à l'IS vs SCI à l'IR** : comparaison sur un même investissement + courbe du TRI selon l'année de cession.
- **Acheter vs Louer** : patrimoine de l'acheteur vs locataire-investisseur, année de bascule et courbe d'évolution.
- **Pacte Dutreil (787 B)** : exonération 75 %, réduction 50 %, comparaison avec/sans Dutreil.
- **Apport-cession 150-0 B ter** : report d'imposition, remploi 70 % (loi de finances 2026), comparaison vs cession directe.

Les calculs financiers (capitalisation, annuités, amortissement, TRI, Monte Carlo, plus-values,
barèmes Dutreil et apport-cession) ont été vérifiés par recalcul indépendant.

> Note : sur mobile, les simulateurs immobiliers utilisent un modèle de charges allégé
> (taxe foncière, gestion, travaux, PNO) ; la plus-value et la valeur de revente sont exactes.

## 🗄️ Comptes & stockage des données (Supabase) + déploiement (Vercel)
Cette version est prête pour un usage **professionnel** :
- **Supabase** (gratuit) : comptes sécurisés + **enregistrement des simulations dans le cloud**.
  Exécute `supabase-schema.sql` dans Supabase (SQL Editor) puis renseigne `config.js`.
- **Vercel** (gratuit) : déploiement par `vercel --prod` (ou via GitHub). `vercel.json` est fourni.
- **Mode opératoire détaillé** : voir `MODE_OPERATOIRE.md`.

Chaque utilisateur peut **enregistrer**, **recharger** et **supprimer** ses simulations
(bouton « 💾 Enregistrer » sur un résultat, puis « ★ Mes simulations enregistrées »).
