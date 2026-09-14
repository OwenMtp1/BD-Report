-- ============================================================
-- Évènements de jeu couverts nativement, sans framework
-- ============================================================

-- Chat de proximité / global. Les commandes (/me, /do) ne passent PAS
-- par ici : elles appartiennent à votre ressource de chat, qui peut
-- les journaliser via exports['origin_logs']:Log{...}.
AddEventHandler('chatMessage', function(src, name, message)
  local p = Framework.GetPlayer(src)
  if not p then return end
  local ped = GetPlayerPed(src)
  local c = ped and GetEntityCoords(ped) or nil
  Origin.Log({
    cat = 'chat', sev = 'info', actor = p,
    msg = ('%s : « %s »'):format(p.name, message),
    data = { kind = 'chat', texte = message,
             position = c and ('vector3(%.2f, %.2f, %.2f)'):format(c.x, c.y, c.z) or nil },
    res = 'origin_chat'
  })
end)

-- baseevents publie les morts et les éliminations. S'il n'est pas démarré,
-- on le dit une fois au lieu de laisser une catégorie vide sans explication.
CreateThread(function()
  Wait(3000)
  if GetResourceState('baseevents') ~= 'started' then
    print('[origin_logs] baseevents n\'est pas démarré : les morts et éliminations ne seront pas journalisées.')
    Origin.Notice('systeme', 'baseevents inactif — combats non journalisés',
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
      msg = ('%s a éliminé %s'):format(k.name, p.name),
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
RegisterNetEvent('origin_logs:tir', function()
  local src = source
  if #Config.ZonesProtegees == 0 then return end
  local ped = GetPlayerPed(src)
  if not ped then return end
  local c = GetEntityCoords(ped)
  for _, z in ipairs(Config.ZonesProtegees) do
    if #(c - z.coords) <= z.rayon then
      local p = Framework.GetPlayer(src)
      if p then
        Origin.Alerte('combat', ('Tir en zone protégée — %s'):format(p.name),
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
  Origin.Notice('systeme', 'Test de journalisation déclenché depuis la console',
    { kind = 'test', api = Config.ApiUrl, serveur = Config.ServerName })
  print('[origin_logs] évènement de test envoyé — il doit apparaître dans le panneau sous « Serveur ».')
end, true)
