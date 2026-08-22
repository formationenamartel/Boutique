# Boutique en ligne — intégrable avec Stripe

Ce projet vous donne trois choses :

1. **`public/`** — le widget boutique (HTML/CSS/JS) que vous intégrez dans vos sites : grille produits, filtres par catégorie, panier, paiement.
2. **`admin/index.html`** — une page d'administration à ouvrir dans votre navigateur pour gérer produits, catégories et images, sans rien installer.
3. **`api/`** — de petites fonctions serveur (déployées gratuitement sur [Vercel](https://vercel.com)) : `create-checkout-session.js` crée la session de paiement Stripe de façon sécurisée, et `stock.js` / `stock-adjust.js` / `webhook.js` gèrent le suivi de stock optionnel (section 8). C'est la seule pièce "backend", et elle est **partagée par tous vos sites**.

Pourquoi une fonction serveur est nécessaire : pour un panier avec plusieurs produits payés en une seule fois, Stripe doit connaître les prix exacts. Il ne faut **jamais** faire confiance aux prix envoyés par le navigateur (n'importe qui pourrait les modifier avant l'envoi) — la fonction relit donc les vrais prix dans votre `products.json` avant de créer le paiement.

---

## 1. Préparer votre compte Stripe

1. Connectez-vous sur [dashboard.stripe.com](https://dashboard.stripe.com).
2. Récupérez votre **clé secrète** (`Développeurs > Clés API > Clé secrète`), commençant par `sk_test_...` (mode test) ou `sk_live_...` (mode production).
3. Ne partagez jamais cette clé et ne la mettez jamais dans du code HTML/JS visible publiquement — elle ne doit exister que côté serveur (voir étape 3).

## 2. Déployer votre catalogue et le widget

Le dossier `public/` contient un exemple fonctionnel (`products.json`, `boutique.css`, `boutique.js`, 4 produits de démo). Deux options :

- **Option simple** : déployez tout le dossier `public/` tel quel sur votre hébergement (à la racine ou dans un sous-dossier `/boutique`), puis intégrez le widget dans vos autres pages en pointant vers cette URL.
- **Option recommandée si vous ne savez pas encore où héberger** : déployez tout ce dépôt (y compris `api/`) sur Vercel en une fois (voir étape 3) — `public/` sera alors servi automatiquement par Vercel, et vos autres sites n'auront qu'à appeler cette même adresse.

Une fois hébergé, notez l'URL publique de votre `products.json`, par exemple :
`https://boutique-xyz.vercel.app/products.json`

## 3. Déployer la fonction de paiement sur Vercel

1. Créez un compte gratuit sur [vercel.com](https://vercel.com).
2. Installez leur CLI ou connectez ce dossier à un dépôt Git (GitHub/GitLab) puis importez-le dans Vercel — les deux fonctionnent.
3. Dans les paramètres du projet Vercel, ajoutez ces **variables d'environnement** :

   | Variable | Exemple | Description |
   |---|---|---|
   | `STRIPE_SECRET_KEY` | `sk_live_...` | Votre clé secrète Stripe (étape 1) |
   | `PRODUCTS_JSON_URL` | `https://boutique-xyz.vercel.app/products.json` | URL publique de votre catalogue |
   | `ALLOWED_ORIGINS` | `https://monsite.com,https://autresite.com` | Domaines de vos sites autorisés à appeler l'API (séparés par des virgules) |
   | `DEFAULT_SUCCESS_URL` | `https://monsite.com/merci` | Page affichée après un paiement réussi (si le site appelant n'en fournit pas une valide) |
   | `DEFAULT_CANCEL_URL` | `https://monsite.com/boutique` | Page affichée si le client annule |
   | `SHIP_TO_COUNTRIES` *(optionnel)* | `CA,US` | Si vous vendez des produits physiques, pays de livraison acceptés par Stripe |
   | `ENABLE_AUTOMATIC_TAX` *(optionnel)* | `true` | Active le calcul automatique de la TVA/taxes via Stripe Tax (voir section 7) |
   | `STRIPE_WEBHOOK_SECRET` *(optionnel)* | `whsec_...` | Requis pour le suivi de stock (section 8) et/ou la livraison numérique (section 9) |
   | `ADMIN_STOCK_TOKEN` *(optionnel)* | une chaîne aléatoire longue | Requis pour le suivi de stock (section 8) et/ou les rapports de vente (section 10) |
   | `RESEND_API_KEY` *(optionnel)* | `re_...` | Requis uniquement pour la livraison automatique de produits numériques (voir section 9) |
   | `FROM_EMAIL` *(optionnel)* | `boutique@votredomaine.com` | Adresse d'expédition des emails de livraison (voir section 9) |
   | `CRON_SECRET` *(optionnel)* | une chaîne aléatoire longue | Requis pour la sauvegarde automatique quotidienne du stock (voir section 8) |

4. Déployez. Vous obtenez une URL du type `https://votre-projet.vercel.app/api/create-checkout-session` — c'est l'URL `data-api-url` à utiliser dans le widget.

**Important** : tant que `ALLOWED_ORIGINS` n'est pas défini, l'API accepte les appels de n'importe quel site (pratique pour tester, à éviter en production).

## 4. Intégrer le widget dans vos pages

Copiez ce bloc dans n'importe laquelle de vos pages HTML (voir aussi `public/demo.html`) :

```html
<link rel="stylesheet" href="https://votre-projet.vercel.app/boutique.css">

<div
  data-boutique-root
  data-products-url="https://votre-projet.vercel.app/products.json"
  data-api-url="https://votre-projet.vercel.app/api/create-checkout-session"
></div>

<script src="https://votre-projet.vercel.app/boutique.js"></script>
```

Vous pouvez placer plusieurs de ces blocs sur des sites différents : ils pointent tous vers le même catalogue et la même API.

Personnalisation visuelle : les couleurs sont pilotées par des variables CSS (`--boutique-primary`, `--boutique-accent`, etc.) sur la classe `.boutique` — surchargez-les dans le CSS de votre site si besoin.

### Afficher des produits différents selon le site

Si vous intégrez la boutique sur plusieurs sites (ex. plusieurs entreprises), vous pouvez limiter les produits affichés sur chacun sans dupliquer le catalogue. Ajoutez l'attribut `data-site-id` au bloc d'intégration :

```html
<div
  data-boutique-root
  data-products-url="https://votre-projet.vercel.app/products.json"
  data-api-url="https://votre-projet.vercel.app/api/create-checkout-session"
  data-site-id="aide-informatique"
></div>
```

Puis, dans `admin/index.html`, cochez le ou les sites où chaque produit doit apparaître (section « Sites » du formulaire produit). Un produit sans site coché reste visible partout — utile pour un produit commun à tous vos sites. Sans `data-site-id` sur le bloc d'intégration, tous les produits actifs s'affichent (comme sur `public/demo.html`), peu importe les sites cochés.

Notez que le catalogue reste techniquement accessible en entier via `products.json` (le filtrage se fait côté navigateur) — adapté pour organiser l'affichage entre vos propres sites, mais pas conçu comme un cloisonnement strict entre plusieurs marchands indépendants.

## 5. Gérer vos produits au quotidien

1. Ouvrez `admin/index.html` directement dans votre navigateur (double-clic, aucune installation).
2. Ajoutez vos catégories, puis vos produits (nom, description, prix, image, catégorie).
3. Vos modifications sont sauvegardées automatiquement dans votre navigateur pendant que vous travaillez (brouillon local).
4. Cliquez sur **Exporter (ZIP)** : vous obtenez `boutique-export.zip` contenant `products.json` et le dossier `images/`.
5. Décompressez et remplacez les fichiers correspondants sur votre hébergement (dans `public/`).
6. Pour continuer à modifier plus tard, utilisez **Importer un ZIP existant** avec votre dernier export.

### Code produit (SKU) et code-barres, pour un point de vente

Chaque produit a deux champs optionnels :
- **Code produit (SKU)** : un identifiant lisible (ex. `LIV-0001`), généré automatiquement par catégorie (bouton **Générer**) ou modifiable librement.
- **Code-barres (EAN-13)** : généré dans la plage réservée par GS1 à l'usage interne (préfixe `20`-`29`), avec un chiffre de contrôle valide — scannable en magasin, mais pas destiné à la revente via un distributeur externe (qui exigerait un préfixe d'entreprise officiel enregistré auprès de GS1).

Le bouton **Exporter CSV (point de vente)** génère un fichier `boutique-produits.csv` (SKU, code-barres, nom, description, prix, devise, catégorie, stock, actif) à importer dans votre système de point de vente. Le format des colonnes attendues varie d'un système à l'autre — vérifiez la documentation d'import de votre logiciel (ex. Best POS, Azimutpos) si l'import échoue.

## 6. Tester avant de passer en production

1. Utilisez d'abord votre clé Stripe **de test** (`sk_test_...`) dans `STRIPE_SECRET_KEY`.
2. Passez une commande sur votre site avec une [carte de test Stripe](https://docs.stripe.com/testing), par exemple `4242 4242 4242 4242`, une date future, et n'importe quel CVC.
3. Vérifiez dans le Dashboard Stripe (mode test) que le paiement apparaît.
4. Une fois satisfait, remplacez `STRIPE_SECRET_KEY` par votre clé `sk_live_...` et redéployez.

## 7. Reçus, taxes automatiques et codes promo

### Reçus email automatiques

Aucun code requis. Dans le Dashboard Stripe : `Paramètres > Emails clients` (ou `Business settings > Customer emails`), activez **"Paiements réussis"**. Stripe collecte déjà l'email du client pendant le paiement (Checkout le demande automatiquement) et lui envoie un reçu.

### Taxes automatiques (Stripe Tax)

1. Dans le Dashboard Stripe, activez **Stripe Tax** (`Paramètres > Tax`) et renseignez votre adresse d'origine (obligatoire pour calculer les taxes).
2. Dans l'admin (`admin/index.html`), choisissez si vos prix saisis sont **hors taxe** ou **toutes taxes comprises** (menu déroulant à côté de la devise), puis réexportez votre catalogue.
3. Sur Vercel, ajoutez la variable d'environnement `ENABLE_AUTOMATIC_TAX=true` et redéployez.

Une fois activé, Stripe calcule automatiquement la taxe selon l'adresse de facturation du client (collectée automatiquement pendant le paiement) et l'ajoute au total affiché sur la page Stripe Checkout.

**Tant que `ENABLE_AUTOMATIC_TAX` n'est pas défini sur `true`, rien ne change** : les prix sont facturés tels quels, sans calcul de taxe automatique.

#### Cas du Québec (TPS + TVQ)

Au Québec, deux taxes distinctes s'appliquent et nécessitent **deux inscriptions séparées** dans Stripe, même si Revenu Québec administre les deux :

1. **TPS/TVH (fédérale, 5 %)** : inscription auprès de l'ARC (Agence du revenu du Canada).
2. **TVQ (provinciale, 9,975 %)** : inscription auprès de Revenu Québec.

Vous n'êtes **obligé de vous inscrire à aucune des deux tant que vos ventes taxables restent sous 30 000 $ CA sur 12 mois** (seuil de « petit fournisseur », identique pour la TPS et la TVQ). En dessous de ce seuil, vous pouvez simplement ne pas activer Stripe Tax et vendre vos prix sans taxe.

Une fois inscrit (ou si vous dépassez le seuil) :

1. Dashboard Stripe > `Paramètres > Tax > Registrations` : ajoutez une inscription pour **Canada** (TPS/TVH, avec votre numéro d'entreprise) puis une seconde pour **Québec** (TVQ, avec votre numéro d'inscription TVQ).
2. Assurez-vous que `SHIP_TO_COUNTRIES` (ou la collecte d'adresse de facturation) inclut bien `CA` pour que Stripe puisse déterminer la province du client.
3. Stripe Tax appliquera alors automatiquement 5 % + 9,975 % aux clients québécois, et les taux corrects pour les autres provinces si vous vous y inscrivez aussi.

Le catalogue de démo (`public/products.json`) est déjà configuré en dollars canadiens (`"currency": "cad"`).

#### Codes de taxe par produit (cas des biens numériques/services)

Par défaut, chaque produit est taxé comme un **bien physique standard** (`txcd_99999999`). Si vous vendez des produits numériques, des services, ou des abonnements — dont le traitement fiscal peut différer — sélectionnez la **« Catégorie fiscale (Stripe Tax) »** appropriée directement dans le formulaire produit de l'admin (`admin/index.html`) : une liste des catégories les plus courantes est proposée, avec une option « Autre (code personnalisé) » pour entrer n'importe quel code manuellement. La liste complète des codes est disponible dans le [Tax Code Registry de Stripe](https://stripe.com/docs/tax/tax-codes).

**Cas particulier des livres imprimés** : Stripe ne propose pas de code fiscal dédié aux livres imprimés physiques, et **le calcul automatique de Stripe Tax applique à tort la TVQ dessus** (vérifié empiriquement — TPS 5 % + TVQ 9,975 % au lieu de TPS seule). Si vous vendez des livres, utilisez plutôt les **taux de taxe manuels** décrits à la section suivante.

### Codes promo

Déjà activé dans `api/create-checkout-session.js` (`allow_promotion_codes: true`) — un champ "Code promo" apparaît automatiquement sur la page de paiement Stripe. Pour créer un code :

1. Dashboard Stripe > `Produits > Coupons` : créez un coupon (ex. -10%, ou -5€, avec ou sans date d'expiration).
2. `Produits > Codes promotionnels` : créez un code (ex. `BIENVENUE10`) lié à ce coupon.
3. Vos clients l'utilisent directement sur la page de paiement — aucune action supplémentaire de votre part.

## 7bis. Taux de taxe manuels (nécessaire pour les livres au Québec)

Stripe Tax (automatique, section 7) calcule mal la taxe sur les livres imprimés — il applique la TVQ alors qu'elle ne devrait pas s'appliquer. Pour corriger ça, on contourne le calcul automatique avec des **taux fixes définis par vous**, appliqués directement sur chaque produit.

**Important** : ce mode remplace complètement Stripe Tax automatique (les deux ne peuvent pas être actifs en même temps). Il applique toujours les taux du Québec (TPS 5 % + TVQ 9,975 %, sauf exemption), peu importe la province réelle du client — adapté si votre clientèle est essentiellement québécoise, mais moins précis si vous vendez ailleurs au Canada.

### Mise en place (une fois)

1. Dashboard Stripe (mode **Live**, puis répétez en mode **Test** si vous voulez tester) > `Produits > Taux de taxe` (ou `Tax rates`) > **Créer un taux de taxe**.
2. Créez un premier taux : nom « TPS Canada », **5 %**, non inclusif. Notez son ID (`txr_...`).
3. Créez un second taux : nom « TVQ Québec », **9,975 %**, non inclusif. Notez son ID (`txr_...`).
4. Sur Vercel, ajoutez ces deux variables d'environnement :
   - `STRIPE_TAX_RATE_GST` = l'ID du taux TPS
   - `STRIPE_TAX_RATE_QST` = l'ID du taux TVQ
5. Redéployez.

Dès que ces deux variables sont présentes, tous les paiements utilisent automatiquement ces taux fixes (TPS + TVQ pour tout produit, sauf ceux marqués détaxés — voir ci-dessous), et `ENABLE_AUTOMATIC_TAX` est ignoré si défini.

### Utilisation au quotidien

Dans `admin/index.html`, cochez **« Livre détaxé de la TVQ »** sur chaque produit qui est un livre imprimé — seule la TPS (5 %) s'appliquera à ce produit. Laissez décoché pour tout autre produit (TPS + TVQ s'appliqueront normalement).

## 8. Gestion du stock (suivi automatique entre les commandes)

Le stock est **optionnel par produit** : un produit sans valeur de stock renseignée dans l'admin est traité comme illimité (parfait pour un téléchargement, un service, ou tout produit dont vous ne voulez pas suivre la quantité). Seuls les produits avec un stock renseigné sont suivis.

Fonctionnement : quand un client clique sur « Passer la commande », la quantité demandée est **réservée immédiatement** (décomptée) avant même que le paiement soit confirmé — cela évite que deux clients achètent en même temps la dernière unité. Si le client abandonne le paiement (session expirée après 40 minutes, ou paiement asynchrone qui échoue), un webhook Stripe restitue automatiquement le stock réservé.

### Mise en place (une fois)

1. **Ajouter une base de données Vercel KV** : dans votre projet Vercel, `Storage > Create Database > KV` (gratuit jusqu'à un usage raisonnable). Vercel ajoute automatiquement les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` à votre projet — aucune configuration manuelle nécessaire, c'est ce qui active le suivi de stock (sans cette base, tout fonctionne comme avant, sans suivi).
2. **Définir un jeton admin** : ajoutez la variable d'environnement `ADMIN_STOCK_TOKEN` avec une chaîne aléatoire longue (ex. générée sur [1password.com/password-generator](https://1password.com/password-generator) ou similaire) — c'est le mot de passe qui protège le réapprovisionnement.
3. **Créer le webhook Stripe** : Dashboard Stripe > `Développeurs > Webhooks > Ajouter un point de terminaison`.
   - URL : `https://votre-projet.vercel.app/api/webhook`
   - Événements à écouter : `checkout.session.expired` et `checkout.session.async_payment_failed`
   - Une fois créé, copiez le « Signing secret » (`whsec_...`) dans la variable d'environnement `STRIPE_WEBHOOK_SECRET`.
4. Redéployez le projet pour que les nouvelles variables soient prises en compte.

### Utilisation au quotidien

1. Dans `admin/index.html`, renseignez un **Stock initial** par produit (laissez vide pour un stock illimité).
2. Exportez et déployez comme d'habitude. La première fois qu'un produit avec un stock défini est vendu (ou consulté via le widget), ce nombre devient la valeur de départ suivie en ligne.
3. **Pour réapprovisionner ensuite**, n'éditez plus le champ « Stock initial » (il ne sert qu'à l'amorçage) : utilisez le panneau **« Stock en ligne »** en bas de l'admin — renseignez une seule fois l'URL de votre API et votre `ADMIN_STOCK_TOKEN` (mémorisés dans votre navigateur), cliquez sur **Charger le stock actuel**, puis entrez un ajustement (ex. `+20` pour un réassort, `-1` pour une correction) et **Appliquer**.
4. Le widget affiche automatiquement « Rupture de stock » et désactive le bouton d'achat quand un produit atteint 0, à condition d'ajouter l'attribut `data-stock-url="https://votre-projet.vercel.app/api/stock"` sur votre bloc d'intégration (voir `public/demo.html`).

### Limites à connaître

- Le stock est stocké dans Vercel KV, pas dans `products.json` — c'est volontaire (voir ci-dessus), mais cela veut dire que le stock affiché dans l'admin après un import ZIP reflète le dernier export, pas forcément le stock réellement disponible en ligne (utilisez « Charger le stock actuel » pour le vérifier).
- Si la livraison du webhook échoue durablement (rare), une réservation abandonnée ne sera pas restituée automatiquement ; vous pouvez toujours corriger manuellement via le panneau de réapprovisionnement.
- Les endpoints protégés par `ADMIN_STOCK_TOKEN` (réapprovisionnement, rapports de vente, sauvegarde) limitent les tentatives : après 10 essais avec un mauvais jeton depuis la même adresse IP en 15 minutes, les requêtes suivantes sont refusées (`429`) jusqu'à expiration de la fenêtre. Aucune configuration requise, actif dès que Vercel KV est connecté.

### Sauvegarde automatique du stock

Comme le stock ne vit que dans Vercel KV (pas dans `products.json`, ni dans Git), une suppression accidentelle de la base ferait perdre les quantités en cours. Une sauvegarde quotidienne automatique est en place :

1. **Ajouter Vercel Blob** si ce n'est pas déjà fait (utilisé aussi pour la livraison numérique, section 9) : `Storage > Create Database > Blob`.
2. **Définir un jeton de tâche planifiée** : ajoutez la variable d'environnement `CRON_SECRET` avec une chaîne aléatoire longue — Vercel l'utilise automatiquement pour authentifier ses propres appels planifiés (rien d'autre à configurer).
3. Redéployez. Une sauvegarde s'exécute alors **automatiquement chaque jour à 8h UTC**, écrasant un fichier `backups/stock-backup-latest.json` sur votre Blob store avec les quantités actuelles.

Vous pouvez aussi déclencher une sauvegarde immédiate à tout moment avec le bouton **« Sauvegarder le stock maintenant »** dans le panneau « Stock en ligne » de l'admin (utilise le même `ADMIN_STOCK_TOKEN`).

**En cas de perte de la base KV (restauration manuelle)** : ouvrez le fichier de sauvegarde (son URL s'affiche après un clic sur le bouton, ou consultez votre Blob store) — il contient un objet `{ "productId": quantite, ... }`. Pour chaque produit, utilisez le panneau « Stock en ligne » : cliquez « Charger le stock actuel » (affichera 0 ou vide pour les produits perdus), puis entrez la quantité de la sauvegarde comme ajustement (puisque la base repart de zéro, l'ajustement = la valeur sauvegardée) et « Appliquer ».

## 9. Livraison automatique des produits numériques

Pour un produit téléchargeable (ebook, logiciel, fichier de service, etc.), la boutique peut envoyer automatiquement un **email avec un lien de téléchargement sécurisé** dès que le paiement est confirmé — pas besoin de le faire manuellement.

Fonctionnement : le lien envoyé n'est pas le fichier lui-même, mais une adresse de votre boutique (`/api/download?token=...`) qui vérifie un jeton à usage limité avant de rediriger vers le fichier réel. Chaque lien est valide **7 jours** et **3 téléchargements maximum**, après quoi il expire (le client vous recontacte si besoin d'un nouvel envoi).

### Mise en place (une fois)

1. **Stock/KV doit déjà être activé** (section 8) — la livraison numérique réutilise la même base Vercel KV pour stocker les jetons de téléchargement.
2. **Héberger vos fichiers avec Vercel Blob** : dans votre projet Vercel, `Storage > Create Database > Blob` (gratuit jusqu'à un usage raisonnable). Une fois créé, ouvrez le store et **uploadez chaque fichier téléchargeable** (glisser-déposer) — copiez l'URL générée pour chaque fichier.
3. **Créer un compte [Resend](https://resend.com)** (gratuit jusqu'à 3000 emails/mois) pour l'envoi d'emails. Récupérez une clé API (`Dashboard > API Keys`), ajoutez-la sur Vercel comme `RESEND_API_KEY`.
   - Pour commencer sans configurer votre propre domaine d'envoi, laissez `FROM_EMAIL` non défini : les emails partiront de `onboarding@resend.dev` (fonctionne, mais moins professionnel). Pour utiliser votre propre adresse (ex. `boutique@votredomaine.com`), suivez la vérification de domaine dans Resend puis définissez `FROM_EMAIL` sur Vercel.
4. **Ajouter l'événement au webhook Stripe existant** : Dashboard Stripe > `Développeurs > Webhooks`, ouvrez le point de terminaison déjà créé à la section 8, et ajoutez l'événement **`checkout.session.completed`** à la liste (en plus de `checkout.session.expired` et `checkout.session.async_payment_failed`).
5. Redéployez le projet.

### Utilisation au quotidien

Dans `admin/index.html`, pour chaque produit téléchargeable, collez l'URL du fichier (obtenue à l'étape 2) dans le champ **« Fichier numérique (URL) »** du formulaire produit. Exportez et déployez comme d'habitude (section 5). Rien d'autre à faire : dès qu'un client paie ce produit, il reçoit l'email automatiquement.

### Limites à connaître

- Le fichier hébergé sur Vercel Blob a une URL publique mais très difficile à deviner (longue chaîne aléatoire) — le lien envoyé par email est une couche de protection supplémentaire (expiration + nombre d'utilisations limité), mais ce n'est pas un système d'authentification à part entière. Suffisant pour la grande majorité des petites boutiques, mais à garder en tête si vous vendez des fichiers de très haute valeur.
- Un seul email est envoyé par commande, listant tous les produits téléchargeables achetés dans cette commande.

## 10. Rapports de vente (pour le partage de dividendes)

L'admin peut générer des rapports de vente directement depuis Stripe, sur une période choisie, avec quatre vues : total, par catégorie, par article (avec SKU), et par site. Utile pour calculer des dividendes/parts revenant à des produits ou sites spécifiques.

**Aucune configuration supplémentaire** : ça réutilise le même jeton (`ADMIN_STOCK_TOKEN`) et la même URL d'API que le panneau « Stock en ligne » (section 8). Si vous ne suivez pas le stock, définissez quand même `ADMIN_STOCK_TOKEN` sur Vercel pour activer cette fonctionnalité.

### Utilisation

1. Dans `admin/index.html`, panneau **« Rapports de vente »** : renseignez l'URL de l'API et le jeton admin (comme pour le panneau Stock, mémorisés dans votre navigateur).
2. Choisissez une date de début et de fin.
3. **Générer le rapport** — affiche le nombre de commandes, le revenu total (hors taxes — base pertinente pour un partage), et le montant encaissé (taxes incluses).
4. **Exporter le détail (CSV)** pour obtenir la liste ligne par ligne (date, site, SKU, produit, catégorie, quantité, revenu, encaissé, ID de commande Stripe) — utile pour vos calculs de comptabilité.

### Comment le rapport « par site » fonctionne

Le site d'origine d'une vente est enregistré automatiquement si le bloc d'intégration du widget porte l'attribut `data-site-id` (section 4). Une vente effectuée sans cet attribut apparaîtra sous « inconnu ».

### Limites à connaître

- Le rapport interroge Stripe en direct à chaque génération (pas de base de données de ventes séparée) — pour une période avec beaucoup de commandes (plus de 500), le rapport est tronqué ; réduisez la plage de dates dans ce cas.
- La fonction est limitée à 10 secondes d'exécution (plan Vercel Hobby). Pour une période avec beaucoup de commandes, ça peut ne pas suffire et renvoyer une erreur — dans ce cas, réduisez la plage de dates (ex. un mois à la fois plutôt qu'une année) et cumulez plusieurs rapports.
- Un produit supprimé du catalogue après une vente apparaît comme « Produit supprimé du catalogue » dans le rapport (l'historique Stripe reste intact, mais on ne peut plus retrouver son SKU/catégorie).

## Aller plus loin (suggestions restantes)

- **Suivi des commandes détaillé** : les rapports de vente (section 10) couvrent l'essentiel pour les dividendes. Pour un vrai tableau de bord de commandes (statuts, adresses de livraison, etc.), le Dashboard Stripe reste la référence complète.

