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
    cat = 'systeme', sev = 'info',
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
