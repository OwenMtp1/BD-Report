-- ============================================================
-- Niveau 2 — le scan : « qu'est-ce que ce code sait faire ? »
-- ============================================================
-- FiveM laisse une ressource LIRE les fichiers des autres
-- (LoadResourceFile). On s'en sert pour extraire les NOMS des
-- évènements que chaque ressource écoute — et rien de plus.
--
-- ⚠️ LE CODE NE QUITTE JAMAIS CETTE MACHINE. On envoie des noms
-- d'évènements, jamais une ligne de source. Beaucoup de ressources sont
-- payantes et sous licence : les remonter vers un panneau tiers serait
-- un problème juridique et commercial, pas un détail d'implémentation.
--
-- ⚠️ RIEN NE PART AU DÉMARRAGE. Lire tous les scripts serveur du
-- serveur coûte du temps CPU et se fait sur une machine qui n'est pas la
-- nôtre : cela se déclenche à la main, depuis la console, et jamais dans
-- le dos de l'administrateur.
--
--     origin_logs_scan
-- ============================================================
Origin = Origin or {}

-- On ne retient que ce que la ressource ÉCOUTE : c'est là-dessus qu'un
-- raccordement pourra se greffer. `TriggerClientEvent` part vers les
-- clients — s'y accrocher côté serveur n'aurait aucun sens.
local MOTIFS = {
  "RegisterNetEvent%s*%(%s*['\"]([^'\"]+)['\"]",
  "RegisterServerEvent%s*%(%s*['\"]([^'\"]+)['\"]",
  "AddEventHandler%s*%(%s*['\"]([^'\"]+)['\"]"
}

-- Les évènements du moteur : présents partout, utiles nulle part ici.
local SYSTEME = {
  onResourceStart = true, onResourceStop = true, onResourceStarting = true,
  onServerResourceStart = true, onServerResourceStop = true,
  playerConnecting = true, playerDropped = true, playerJoining = true,
  entityCreated = true, entityRemoved = true, onClientResourceStart = true
}

-- ⚠️ Un `server_scripts { 'server/*.lua' }` ne se déplie pas : FiveM
-- n'expose aucune lecture de dossier. Plutôt que de renoncer sur ces
-- ressources-là — c'est une écriture très répandue — on tente les noms
-- de fichiers les plus courants. C'est une HEURISTIQUE, et le compte des
-- motifs non dépliés remonte au panneau : « lu partiellement » ne se
-- corrige pas comme « rien trouvé ».
local COURANTS = {
  'main.lua', 'server.lua', 'sv_main.lua', 'sv_utils.lua', 'sv_functions.lua',
  'functions.lua', 'events.lua', 'commands.lua', 'utils.lua', 'init.lua',
  'server_main.lua', 'sv_events.lua', 'core.lua', 'open.lua', 'api.lua'
}

local MAX_PAR_RESSOURCE = 200
local MAX_OCTETS        = 600 * 1024      -- par fichier

local function fichiersServeur(res)
  local out, globs = {}, 0
  local n = GetNumResourceMetadata(res, 'server_script') or 0
  for i = 0, n - 1 do
    local entree = GetResourceMetadata(res, 'server_script', i)
    if entree and entree ~= '' then
      if entree:find('%*') then
        globs = globs + 1
        local dossier = entree:match('^(.*)/[^/]*$')
        for _, f in ipairs(COURANTS) do
          out[#out + 1] = dossier and (dossier .. '/' .. f) or f
        end
      else
        out[#out + 1] = entree
      end
    end
  end
  return out, globs
end

local function extraire(code, vus, liste)
  for _, motif in ipairs(MOTIFS) do
    for ev in code:gmatch(motif) do
      if not vus[ev] and not SYSTEME[ev] and #ev >= 3 and #ev <= 160
         and not ev:find('^__cfx') and #liste < MAX_PAR_RESSOURCE then
        vus[ev] = true
        liste[#liste + 1] = ev
      end
    end
  end
end

function Origin.Scanner(retour)
  local ressources, protegees = {}, {}
  local lus, globsNonDeplies = 0, 0

  for i = 0, GetNumResources() - 1 do
    local nom = GetResourceByFindIndex(i)
    if nom and nom ~= 'origin_logs' and GetResourceState(nom) == 'started' then
      -- Une ressource « escrow » (Cfx) porte un fichier .fxap et ses
      -- sources sont chiffrées : ce n'est pas une panne du scan, c'est
      -- une protection. Le dire évite de chercher un bug inexistant.
      if LoadResourceFile(nom, '.fxap') then
        protegees[#protegees + 1] = nom
      else
        local fichiers, globs = fichiersServeur(nom)
        globsNonDeplies = globsNonDeplies + globs
        local vus, liste = {}, {}
        for _, f in ipairs(fichiers) do
          local code = LoadResourceFile(nom, f)
          if code and #code > 0 and #code <= MAX_OCTETS then
            lus = lus + 1
            extraire(code, vus, liste)
          end
        end
        if #liste > 0 then ressources[#ressources + 1] = { nom = nom, evenements = liste } end
      end
    end
    -- Le serveur de jeu ne doit pas se figer le temps du scan.
    if i % 5 == 0 then Wait(0) end
  end

  local corps = json.encode({ ressources = ressources, protegees = protegees, lus = lus })
  PerformHttpRequest(Config.ApiUrl .. '/api/scan', function(code, texte)
    if retour then retour(code, texte, ressources, protegees, lus, globsNonDeplies) end
  end, 'POST', corps, { ['Content-Type'] = 'application/json', ['X-Origin-Key'] = Config.ServerKey })
end

RegisterCommand('origin_logs_scan', function(src)
  if src ~= 0 then return end   -- console uniquement
  if Config.ServerKey == '' then
    print('^1[origin_logs] Aucune clé d\'ingestion : le scan n\'a nulle part où aller.^7')
    return
  end
  print('[origin_logs] scan en cours…')
  CreateThread(function()
    Origin.Scanner(function(code, texte, ressources, protegees, lus, globs)
      local total = 0
      for _, r in ipairs(ressources) do total = total + #r.evenements end
      if code == 200 then
        print(('[origin_logs] scan terminé — %d évènement(s) dans %d ressource(s), %d fichier(s) lu(s).')
          :format(total, #ressources, lus))
        if #protegees > 0 then
          print(('[origin_logs] %d ressource(s) protégée(s) (escrow) : leur code est chiffré, rien à en tirer.')
            :format(#protegees))
        end
        if globs > 0 then
          print(('[origin_logs] %d motif(s) « server/*.lua » non dépliable(s) : lecture partielle de ces ressources.')
            :format(globs))
        end
        print('[origin_logs] Résultats : panneau → Espaces de logs → Intégration.')
      else
        print(('^1[origin_logs] scan refusé par le panneau (%s) %s^7'):format(code, texte or ''))
      end
    end)
  end)
end, true)
