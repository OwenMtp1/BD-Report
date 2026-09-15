-- ============================================================
-- File d'envoi vers l'API
-- Une requête HTTP par ligne de log mettrait le serveur à genoux
-- un soir de forte affluence : on groupe, et si l'API tombe on
-- garde en mémoire au lieu de perdre.
-- ============================================================
Origin = Origin or {}

local file = {}
local envoiEnCours = false
local perdus = 0

local function entete()
  return { ['Content-Type'] = 'application/json', ['X-Origin-Key'] = Config.ServerKey }
end

local function vider()
  if envoiEnCours or #file == 0 then return end
  envoiEnCours = true
  local lot = {}
  for i = 1, math.min(#file, Config.BatchSize) do lot[i] = table.remove(file, 1) end

  PerformHttpRequest(Config.ApiUrl .. '/api/ingest', function(code, _, _)
    envoiEnCours = false
    if code ~= 200 then
      -- On remet le lot en tête : l'API redémarre, le serveur de jeu non.
      for i = #lot, 1, -1 do table.insert(file, 1, lot[i]) end
      while #file > Config.QueueMax do table.remove(file, #file); perdus = perdus + 1 end
      if perdus > 0 and perdus % 500 == 0 then
        print(('[origin_logs] API injoignable — %d évènements abandonnés (file pleine)'):format(perdus))
      end
    end
  end, 'POST', json.encode({ server = Config.ServerName, events = lot }), entete())
end

CreateThread(function()
  while true do
    Wait(Config.FlushMs)
    vider()
  end
end)

--- Enregistre un évènement.
--- @param o table {cat, sev, actor (src ou table), target (src ou table), msg, data, res}
function Origin.Log(o)
  if not o or not o.msg then return end
  local cat = o.cat or 'admin'   -- rubrique de repli : cf. CAT_FALLBACK côté API
  if Config.Categories[cat] == false then return end

  local acteur = o.actor
  if type(acteur) == 'number' or type(acteur) == 'string' then acteur = Framework.GetPlayer(acteur) end
  local cible = o.target
  if type(cible) == 'number' or type(cible) == 'string' then cible = Framework.GetPlayer(cible) end

  file[#file + 1] = {
    ts = math.floor(os.time() * 1000),
    cat = cat, sev = o.sev or 'info',
    actor = acteur, target = cible,
    msg = o.msg, data = o.data or {}, res = o.res or 'origin_logs'
  }
  if #file >= Config.BatchSize then vider() end
end

-- Raccourcis lisibles à l'appel.
function Origin.Info(cat, msg, data, actor, target)   Origin.Log({cat=cat,sev='info',    msg=msg,data=data,actor=actor,target=target}) end
function Origin.Notice(cat, msg, data, actor, target) Origin.Log({cat=cat,sev='notice',  msg=msg,data=data,actor=actor,target=target}) end
function Origin.Alerte(cat, msg, data, actor, target) Origin.Log({cat=cat,sev='alerte',  msg=msg,data=data,actor=actor,target=target}) end
function Origin.Critique(cat,msg, data, actor, target)Origin.Log({cat=cat,sev='critique',msg=msg,data=data,actor=actor,target=target}) end

-- Export pour vos autres ressources :
--   exports['origin_logs']:Log({ cat='casino', sev='alerte', actor=source,
--     msg=('%s a lancé le braquage de la Fleeca'):format(GetPlayerName(source)),
--     data={ kind='start', banque='Fleeca Legion' } })
exports('Log', function(o) Origin.Log(o) end)
exports('Info', function(cat, msg, data, actor) Origin.Info(cat, msg, data, actor) end)
exports('Alerte', function(cat, msg, data, actor) Origin.Alerte(cat, msg, data, actor) end)

AddEventHandler('onResourceStop', function(res)
  if res ~= GetCurrentResourceName() then return end
  vider()   -- dernier envoi avant l'arrêt : sinon la fin de soirée disparaît
end)
