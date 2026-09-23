-- ============================================================
-- Les raccordements posés depuis le panneau
-- ============================================================
-- Le scan ne rend plus un fichier à déposer : la ressource vient LIRE ce
-- que le panneau a retenu et pose ses écouteurs elle-même. Décocher un
-- raccordement dans le panneau le coupe en moins d'une minute, sans que
-- personne n'ait à toucher au serveur de jeu. Un fichier aurait demandé
-- un aller-retour humain pour chaque correction — et c'est exactement
-- l'aller-retour qu'on cherche à supprimer.
--
-- ⚠️ ON N'UTILISE QUE `AddEventHandler`, jamais `RegisterNetEvent`.
-- Enregistrer en « net » un évènement qui ne l'était pas le rendrait
-- déclenchable PAR LES JOUEURS : n'importe qui pourrait alors appeler le
-- gestionnaire d'origine, celui qui donne l'argent. On écoute, on n'ouvre
-- rien.
--
-- ⚠️ FiveM NE SAIT PAS RETIRER UN ÉCOUTEUR. Un raccordement décoché
-- laisse donc le sien en place — il consulte `actifs` et se tait. C'est
-- pour cela que l'écouteur ne capture pas ses réglages : il les relit à
-- chaque déclenchement, sinon décocher n'aurait d'effet qu'au prochain
-- redémarrage du serveur.
-- ============================================================
Origin = Origin or {}

local actifs = {}          -- ev -> { cat, sev, res }
local poses  = {}          -- ev -> true (écouteur déjà en place)
local compte = {}          -- ev -> { n, minute } : garde-fou de débit
local MAX_PAR_MINUTE = 120

-- ⚠️ Les arguments d'un évènement inconnu peuvent contenir n'importe
-- quoi — une fonction, une entité, une table cyclique. `json.encode`
-- aurait échoué sur le LOT ENTIER, emportant des évènements parfaitement
-- valides avec lui. On ramène donc tout à du texte, des nombres et des
-- tables courtes, avant que cela n'entre dans la file.
local function sur(v, prof)
  local t = type(v)
  if t == 'number' or t == 'boolean' then return v end
  if t == 'string' then return #v > 200 and (v:sub(1, 200) .. '…') or v end
  if t == 'table' and (prof or 0) < 3 then
    local out, n = {}, 0
    for k, x in pairs(v) do
      n = n + 1
      if n > 40 then out['…'] = 'tronqué'; break end
      out[tostring(k)] = sur(x, (prof or 0) + 1)
    end
    return out
  end
  return tostring(v)
end

local function autorise(ev)
  local m = math.floor(os.time() / 60)
  local c = compte[ev]
  if not c or c.minute ~= m then compte[ev] = { n = 1, minute = m }; return true end
  c.n = c.n + 1
  if c.n == MAX_PAR_MINUTE + 1 then
    print(('^3[origin_logs] « %s » dépasse %d déclenchements/minute : mis en sourdine pour cette minute.^7')
      :format(ev, MAX_PAR_MINUTE))
  end
  return c.n <= MAX_PAR_MINUTE
end

local function ecouter(ev)
  if poses[ev] then return end
  poses[ev] = true
  AddEventHandler(ev, function(...)
    local d = actifs[ev]
    if not d then return end            -- décoché depuis le panneau
    if not autorise(ev) then return end
    local src = source
    if type(src) ~= 'number' or src <= 0 then src = nil end
    Origin.Log({
      cat = d.cat, sev = d.sev or 'info', actor = src,
      msg = d.ev,
      data = { kind = 'auto', evenement = ev, args = sur({ ... }) },
      res = d.res or 'sur mesure'
    })
  end)
end

function Origin.ChargerRaccordements(retour)
  if Config.ServerKey == '' then return end
  PerformHttpRequest(Config.ApiUrl .. '/api/hooks', function(code, body)
    if code ~= 200 or not body then if retour then retour(code) end return end
    local ok, r = pcall(json.decode, body)
    if not ok or not r or not r.hooks then if retour then retour(-1) end return end
    local vus = {}
    for _, h in ipairs(r.hooks) do
      if h.ev and h.ev ~= '' then
        vus[h.ev] = true
        actifs[h.ev] = h
        ecouter(h.ev)
      end
    end
    -- Ce qui n'est plus servi est coupé : l'écouteur demeure, muet.
    for ev in pairs(actifs) do if not vus[ev] then actifs[ev] = nil end end
    if retour then retour(200, #r.hooks) end
  end, 'GET', '', { ['Content-Type'] = 'application/json', ['X-Origin-Key'] = Config.ServerKey })
end

CreateThread(function()
  Wait(6000)
  while true do
    Origin.ChargerRaccordements()
    -- Une minute : assez court pour qu'un raccordement décoché s'arrête
    -- pendant qu'on regarde l'écran, assez long pour qu'une requête par
    -- minute ne compte pas.
    Wait(60000)
  end
end)

RegisterCommand('origin_logs_raccordements', function(src)
  if src ~= 0 then return end
  Origin.ChargerRaccordements(function(code, n)
    if code == 200 then print(('[origin_logs] %d raccordement(s) actif(s).'):format(n or 0))
    else print(('^1[origin_logs] raccordements illisibles (%s)^7'):format(code)) end
  end)
end, true)
