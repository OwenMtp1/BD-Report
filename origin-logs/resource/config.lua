-- ============================================================
-- Origin Roleplay — origin_logs
-- Seul fichier à éditer. Tout le reste fonctionne sans y toucher.
-- ============================================================
Config = {}

-- ⚠️ CE FICHIER EST « SHARED » : IL PART CHEZ CHAQUE JOUEUR.
-- Tout ce qu'on écrit ici finit dans le cache de tous les clients. On
-- n'y met donc RIEN de secret — l'adresse de l'API, la clé d'ingestion
-- et le nom du serveur vivent dans `server/config_serveur.lua`, qui ne
-- s'exécute que côté serveur.

-- 'auto' détecte ESX, QBCore ou QBox. Mettez 'standalone' pour n'utiliser
-- que les évènements natifs de FiveM (qui marchent partout).
Config.Framework = 'auto'

-- Envoi groupé : on n'ouvre pas une requête HTTP par ligne de log.
Config.BatchSize = 40        -- envoi dès que la file atteint ce nombre
Config.FlushMs   = 3000      -- …ou au bout de ce délai
Config.QueueMax  = 3000      -- file de secours si l'API est injoignable

-- Catégories émises. Couper une catégorie ici arrête l'émission à la
-- source : c'est plus efficace que de la masquer dans le panneau.
Config.Categories = {
  -- Modération
  bans = true, sanctions = true, anticheat = true,
  -- Joueurs
  connexions = true, deconnexion = true, ecran_joueur = true, combat = true,
  -- Argent & biens          (combat = morts de joueurs ; inventaire = transactions et coffres)
  inventaire = true, items_sol = true, proprietes = true,
  -- Boutique
  boutique_caisse = true, boutique_monnaie = true, boutique_produits = true,
  -- Activités RP
  jobs = true, casino = true, facture_ems = true,
  -- Staff
  admin = true
}

-- Refuser la connexion d'un joueur banni depuis le panneau.
Config.BanCheck = true
Config.BanMessage = 'Vous êtes banni de Origin Roleplay.\nMotif : %s\n%s\nContestation : discord.gg/originrp'

-- Exécution des sanctions décidées depuis le panneau.
Config.ActionPollMs = 5000

-- Captures de l'écran d'un joueur, prises sur demande du staff depuis
-- la rubrique « Écran du joueur ». Nécessite la ressource officielle
-- screenshot-basic (ensure screenshot-basic AVANT origin_logs).
Config.Screenshots = {
  enabled        = true,
  format         = 'jpg',   -- jpg (léger) ou png (fidèle, 5 à 10× plus lourd)
  quality        = 0.7,     -- 0.1 à 1.0 — au-delà de 0.8 le gain se voit peu
  maxKo          = 4096,    -- refus au-delà, avant même d'appeler l'API
  -- ⚠️ Prévenir le joueur ou non est un choix de SERVEUR, pas un défaut
  -- technique : certains règlements l'imposent, et d'autres perdraient
  -- tout intérêt à la capture en prévenant. À vous de trancher, et de
  -- l'écrire dans votre règlement.
  notifierJoueur = false
}

Config.Anticheat = {
  enabled        = true,
  heartbeatMs    = 2000,     -- rythme d'envoi client (position, santé)
  positionDelta  = 250.0,    -- mètres parcourus entre deux battements -> téléportation
  healthJump     = 60,       -- points de vie regagnés d'un coup hors soin
  vehicleSpeed   = 310.0,    -- km/h au-delà du plausible
  explosions     = true,     -- explosions qu'un joueur ne peut pas provoquer
  entities       = true,     -- véhicules interdits
  -- Seules les explosions qu'un joueur NE PEUT PAS déclencher légitimement.
  -- Y mettre trop large produit du bruit, et le bruit fait ignorer l'alerte.
  explosionsInterdites = { [2]=true, [4]=true, [6]=true, [7]=true, [8]=true, [9]=true,
                           [10]=true, [11]=true, [12]=true, [13]=true, [14]=true,
                           [15]=true, [16]=true, [17]=true, [18]=true, [19]=true,
                           [20]=true, [21]=true, [22]=true, [26]=true, [27]=true },
  entitesInterdites = { 'rhino', 'lazer', 'hydra', 'cargoplane', 'jet', 'titan',
                        'savage', 'valkyrie', 'apc', 'khanjali', 'akula' }
}

-- Zones où tirer est interdit (rayon en mètres). Laissez vide pour désactiver.
Config.ZonesProtegees = {
  { nom = 'Legion Square',       coords = vector3(195.0, -933.0, 30.0),   rayon = 90.0 },
  { nom = 'Hôpital Pillbox',     coords = vector3(298.0, -584.0, 43.0),   rayon = 70.0 },
  { nom = 'Commissariat Mission Row', coords = vector3(441.0, -981.0, 30.0), rayon = 70.0 }
}
