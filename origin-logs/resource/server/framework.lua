-- ============================================================
-- Couche d'abstraction framework
-- ESX, QBCore et QBox nomment les mêmes choses différemment.
-- Tout le reste de la ressource passe par Framework.GetPlayer()
-- et ne sait pas lequel tourne — y compris « aucun ».
-- ============================================================
Framework = { nom = 'standalone', core = nil }

local function detecter()
  if Config.Framework ~= 'auto' then return Config.Framework end
  if GetResourceState('qbx_core')    == 'started' then return 'qbox' end
  if GetResourceState('qb-core')     == 'started' then return 'qb' end
  if GetResourceState('es_extended') == 'started' then return 'esx' end
  return 'standalone'
end

CreateThread(function()
  Wait(1000)  -- laisser le framework démarrer avant de l'interroger
  Framework.nom = detecter()
  if Framework.nom == 'esx' then
    Framework.core = exports['es_extended']:getSharedObject()
  elseif Framework.nom == 'qb' then
    Framework.core = exports['qb-core']:GetCoreObject()
  elseif Framework.nom == 'qbox' then
    Framework.core = exports.qbx_core
  end
  print(('[origin_logs] framework détecté : %s'):format(Framework.nom))
  Origin.Log({
    cat = 'admin', sev = 'info',
    msg = ('Journalisation démarrée — framework %s'):format(Framework.nom),
    data = { kind = 'boot', framework = Framework.nom, ressource = GetCurrentResourceName(),
             version = GetResourceMetadata(GetCurrentResourceName(), 'version', 0) },
    res = 'origin_logs'
  })
end)

-- Identifiants FiveM : la license est la clé stable (elle survit au
-- changement de pseudo, de Steam et de Discord).
function Framework.Identifiants(src)
  local out = {}
  for _, id in ipairs(GetPlayerIdentifiers(src) or {}) do
    local prefixe = id:match('^(%a+):')
    if prefixe then out[prefixe] = id end
  end
  return out
end

function Framework.Job(src)
  local ok, res = pcall(function()
    if Framework.nom == 'esx' then
      local x = Framework.core.GetPlayerFromId(src)
      if x and x.job then return { nom = x.job.label or x.job.name, grade = x.job.grade } end
    elseif Framework.nom == 'qb' then
      local p = Framework.core.Functions.GetPlayer(src)
      if p then return { nom = p.PlayerData.job.label, grade = p.PlayerData.job.grade.level } end
    elseif Framework.nom == 'qbox' then
      local p = exports.qbx_core:GetPlayer(src)
      if p then return { nom = p.PlayerData.job.label, grade = p.PlayerData.job.grade.level } end
    end
  end)
  if ok and res then return res end
  return nil
end

-- Portrait d'un joueur tel que le panneau l'attend.
function Framework.GetPlayer(src)
  src = tonumber(src)
  if not src or src <= 0 then return nil end
  local nom = GetPlayerName(src)
  if not nom then return nil end
  local ids = Framework.Identifiants(src)
  local job = Framework.Job(src)
  return {
    key     = ids.license or ids.fivem or ids.steam or ('src:' .. src),
    name    = nom,
    sid     = src,
    discord = ids.discord, steam = ids.steam, fivem = ids.fivem,
    job     = job and job.nom or nil,
    grade   = job and job.grade or nil
  }
end

function Framework.TrouverParCle(key)
  if not key then return nil end
  for _, src in ipairs(GetPlayers()) do
    local ids = Framework.Identifiants(tonumber(src))
    if ids.license == key or ids.discord == key or ids.steam == key or ids.fivem == key then
      return tonumber(src)
    end
  end
  return nil
end

-- ============================================================
-- LIRE L'INVENTAIRE D'UN JOUEUR
-- ⚠️ IL N'EXISTE AUCUN CHEMIN UNIVERSEL. Chaque serveur choisit son
-- système d'inventaire, et ils ne se lisent pas de la même façon. On
-- essaie les plus répandus, du plus précis au plus général, et l'on rend
-- `nil` si AUCUN ne répond — le panneau affiche alors « aucun système
-- d'inventaire reconnu » plutôt qu'une liste vide trompeuse.
-- Chaque tentative est sous pcall : un export absent ne doit pas casser
-- l'action, juste passer au suivant.
-- ============================================================
local function normItem(nom, label, nombre)
  return { name = nom or '?', label = label or nom or '?', count = tonumber(nombre) or 1 }
end

function Framework.Inventaire(src)
  src = tonumber(src)
  if not src then return nil, 'joueur introuvable' end

  -- ox_inventory : de loin le plus courant aujourd'hui.
  if GetResourceState('ox_inventory') == 'started' then
    local ok, items = pcall(function() return exports.ox_inventory:GetInventoryItems(src) end)
    if not ok or type(items) ~= 'table' then
      ok, items = pcall(function() return exports.ox_inventory:GetInventory(src, false) end)
      if ok and type(items) == 'table' and items.items then items = items.items end
    end
    if ok and type(items) == 'table' then
      local out = {}
      for _, it in pairs(items) do
        if type(it) == 'table' and it.name then
          out[#out + 1] = normItem(it.name, it.label or it.metadata and it.metadata.label, it.count or it.amount)
        end
      end
      return out, 'ox_inventory'
    end
  end

  -- QBCore / QBox : les items vivent dans PlayerData.
  if (Framework.nom == 'qb' or Framework.nom == 'qbox') and Framework.core then
    local ok, p = pcall(function()
      if Framework.nom == 'qbox' then return exports.qbx_core:GetPlayer(src) end
      return Framework.core.Functions.GetPlayer(src)
    end)
    if ok and p and p.PlayerData and type(p.PlayerData.items) == 'table' then
      local out = {}
      for _, it in pairs(p.PlayerData.items) do
        if type(it) == 'table' and it.name then
          out[#out + 1] = normItem(it.name, it.label, it.amount or it.count)
        end
      end
      return out, (Framework.nom == 'qbox' and 'qbx_core' or 'qb-inventory')
    end
  end

  -- ESX : getInventory() rend une liste plate.
  if Framework.nom == 'esx' and Framework.core then
    local ok, x = pcall(function() return Framework.core.GetPlayerFromId(src) end)
    if ok and x then
      local ok2, inv = pcall(function() return x.getInventory() end)
      if ok2 and type(inv) == 'table' then
        local out = {}
        for _, it in pairs(inv) do
          if type(it) == 'table' and it.name and (it.count or 0) > 0 then
            out[#out + 1] = normItem(it.name, it.label, it.count)
          end
        end
        return out, 'es_extended'
      end
    end
  end

  return nil, 'aucun système d’inventaire reconnu'
end

-- RÉANIMER — on privilégie le système ambulancier du serveur (sinon le
-- framework continuerait de croire le joueur mort). À défaut, on rend
-- `false` : l'appelant bascule alors sur une réanimation générique
-- côté client. Rien n'est deviné — on n'appelle un export que si sa
-- ressource tourne.
function Framework.ReanimerParJob(src)
  src = tonumber(src)
  local systemes = {
    { 'esx_ambulancejob',  function() TriggerClientEvent('esx_ambulancejob:revive', src) end },
    { 'qb-ambulancejob',   function() TriggerClientEvent('hospital:client:Revive', src) end },
    { 'qbx_ambulancejob',  function() TriggerClientEvent('qbx_medical:client:playerRevived', src) end },
    { 'wasabi_ambulance',  function() TriggerEvent('wasabi_ambulance:revivePlayer', src) end },
    { 'ars_ambulancejob',  function() TriggerClientEvent('ars_ambulancejob:client:revive', src) end }
  }
  for _, s in ipairs(systemes) do
    if GetResourceState(s[1]) == 'started' then
      local ok = pcall(s[2])
      if ok then return s[1] end
    end
  end
  return false
end
