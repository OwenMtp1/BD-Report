-- ============================================================
-- Origin Roleplay — origin_logs
-- Seul fichier à éditer. Tout le reste fonctionne sans y toucher.
-- ============================================================
Config = {}

-- Adresse de l'API (le service Node du dossier api/). Depuis la machine
-- du serveur de jeu, c'est souvent 127.0.0.1 : n'exposez pas le port.
Config.ApiUrl    = 'http://127.0.0.1:8080'

-- MÊME valeur que SERVER_KEY côté API. Sans elle, rien n'est accepté.
Config.ServerKey = 'CHANGEZ-MOI'

-- Nom de ce serveur, utile si vous en faites tourner plusieurs.
Config.ServerName = 'origin-1'

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
  bans = true,
  connexions = true, chat = true, combat = true, economie = true,
  inventaire = true, vehicules = true, jobs = true, proprietes = true,
  braquages = true, drogue = true, organisations = true, craft = true,
  admin = true, anticheat = true, sanctions = true, staff = true,
  whitelist = true, systeme = true
}

-- Refuser la connexion d'un joueur banni depuis le panneau.
Config.BanCheck = true
Config.BanMessage = 'Vous êtes banni de Origin Roleplay.\nMotif : %s\n%s\nContestation : discord.gg/originrp'

-- Exécution des sanctions décidées depuis le panneau.
Config.ActionPollMs = 5000

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
