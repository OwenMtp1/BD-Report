-- ============================================================
-- Évènements de jeu couverts nativement, sans framework
-- ============================================================

-- ⚠️ LE CHAT N'EST PLUS JOURNALISÉ : il ne fait pas partie des rubriques
-- retenues par le serveur. Le bloc qui écoutait `chatMessage` a été retiré
-- plutôt que laissé à tourner vers une rubrique inexistante — écrire des
-- lignes que personne ne peut lire coûte de la base pour rien.
-- Pour le remettre un jour : une rubrique dans api/catalogue.js, puis un
-- handler qui appelle exports['origin_logs']:Log{...}.

-- baseevents publie les morts et les éliminations. S'il n'est pas démarré,
-- on le dit une fois au lieu de laisser une catégorie vide sans explication.
CreateThread(function()
  Wait(3000)
  if GetResourceState('baseevents') ~= 'started' then
    print('[origin_logs] baseevents n\'est pas démarré : les morts et éliminations ne seront pas journalisées.')
    Origin.Notice('admin', 'baseevents inactif — morts de joueurs non journalisées',
      { kind = 'config', remede = 'ensure baseevents dans server.cfg' })
  end
end)

RegisterNetEvent('baseevents:onPlayerDied', function(cause, coords)
  local p = Framework.GetPlayer(source)
  if not p then return end
  Origin.Log({
    cat = 'combat', sev = 'info', actor = p,
    msg = ('%s est mort'):format(p.name),
    data = { kind = 'death', cause = cause,
             position = coords and ('vector3(%.2f, %.2f, %.2f)'):format(coords[1], coords[2], coords[3]) or nil },
    res = 'origin_medical'
  })
end)

RegisterNetEvent('baseevents:onPlayerKilled', function(tueur, donnees)
  local p = Framework.GetPlayer(source)
  if not p then return end
  local k = Framework.GetPlayer(tueur)
  local arme = donnees and donnees.weaponhash or nil
  local dist = donnees and donnees.distance or nil
  if k then
    Origin.Log({
      cat = 'combat', sev = 'notice', actor = k, target = p,
      msg = ('%s est mort — tué par %s'):format(p.name, k.name),
      data = { kind = 'kill', arme = arme, distance = dist and (('%.0f m'):format(dist)) or nil,
               victime = p.name },
      res = 'origin_medical'
    })
  else
    Origin.Log({
      cat = 'combat', sev = 'info', actor = p,
      msg = ('%s est mort'):format(p.name),
      data = { kind = 'death', cause = arme }, res = 'origin_medical'
    })
  end
end)

-- Tir en zone protégée : signalé par le client, qui seul voit le tir,
-- mais la POSITION est relue côté serveur — le client ne décide de rien.
-- ⚠️ TOUT CLIENT PEUT DÉCLENCHER UN ÉVÈNEMENT RÉSEAU. Sans frein, un
-- tricheur envoie « origin_logs:tir » mille fois par seconde et noie la
-- rubrique Anticheat — ce qui est une façon très efficace de cacher une
-- vraie détection. Un signalement par joueur et par seconde suffit :
-- au-delà, ce n'est plus du jeu.
local dernierTir = {}
AddEventHandler('playerDropped', function() dernierTir[source] = nil end)

RegisterNetEvent('origin_logs:tir', function()
  local src = source
  local t = GetGameTimer()
  if dernierTir[src] and (t - dernierTir[src]) < 1000 then return end
  dernierTir[src] = t
  if #Config.ZonesProtegees == 0 then return end
  local ped = GetPlayerPed(src)
  if not ped then return end
  local c = GetEntityCoords(ped)
  for _, z in ipairs(Config.ZonesProtegees) do
    if #(c - z.coords) <= z.rayon then
      local p = Framework.GetPlayer(src)
      if p then
        -- Une détection automatique, pas une mort : elle va avec l'anticheat,
        -- là où le staff va chercher ce que le serveur a repéré tout seul.
        Origin.Alerte('anticheat', ('Tir en zone protégée — %s'):format(p.name),
          { kind = 'safezone', zone = z.nom,
            position = ('vector3(%.2f, %.2f, %.2f)'):format(c.x, c.y, c.z) }, p)
      end
      return
    end
  end
end)

-- Commande console de vérification : « origin_logs_test » depuis la
-- console du serveur dépose un évènement dans chaque catégorie active.
RegisterCommand('origin_logs_test', function(src)
  if src ~= 0 then return end   -- console uniquement
  Origin.Notice('admin', 'Test de journalisation déclenché depuis la console',
    { kind = 'test', api = Config.ApiUrl, serveur = Config.ServerName })
  print('[origin_logs] évènement de test envoyé — il doit apparaître dans le panneau sous « Action staff ».')
end, true)
