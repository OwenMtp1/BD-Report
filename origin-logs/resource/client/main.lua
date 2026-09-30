-- ============================================================
-- Partie client — le strict minimum
-- Le client ne signale qu'une chose que le serveur ne peut pas
-- voir seul : le moment où le joueur tire. La position, elle,
-- est relue côté serveur (cf. server/jeu.lua).
-- ============================================================
CreateThread(function()
  if #Config.ZonesProtegees == 0 then return end
  local dernier = 0
  while true do
    Wait(250)
    local ped = PlayerPedId()
    if IsPedShooting(ped) then
      local t = GetGameTimer()
      if t - dernier > 4000 then      -- une rafale n'est pas dix alertes
        dernier = t
        TriggerServerEvent('origin_logs:tir')
      end
    end
  end
end)

RegisterNetEvent('origin_logs:avertissement', function(motif, par)
  SetNotificationTextEntry('STRING')
  AddTextComponentString(('~y~AVERTISSEMENT~s~ (%s)~n~%s'):format(par or 'staff', motif or ''))
  DrawNotification(true, true)
end)

-- ============================================================
-- Gestes « en jeu » demandés depuis le panneau
-- ⚠️ Ce sont des NATIVES CLIENT : seul le joueur concerné peut agir sur
-- son propre ped. Le serveur ne fait que déclencher l'évènement sur lui.
-- Aucun framework requis — c'est ce qui les rend universels.
-- ============================================================

-- Soigner : vie et armure au maximum.
RegisterNetEvent('origin_logs:soigner', function()
  local ped = PlayerPedId()
  SetEntityHealth(ped, GetEntityMaxHealth(ped))
  SetPedArmour(ped, 100)
  ClearPedBloodDamage(ped)
end)

-- Réanimer, version GÉNÉRIQUE (quand aucun système ambulancier n'est
-- reconnu). Relève le corps là où il est, remet la vie. ⚠️ Le framework,
-- lui, peut continuer de croire le joueur mort : c'est pour ça que le
-- serveur essaie d'abord le vrai système médical.
RegisterNetEvent('origin_logs:reanimer', function()
  local ped = PlayerPedId()
  local x, y, z = table.unpack(GetEntityCoords(ped))
  NetworkResurrectLocalPlayer(x, y, z, GetEntityHeading(ped), true, false)
  SetEntityHealth(ped, GetEntityMaxHealth(ped))
  ClearPedTasksImmediately(ped)
  SetPlayerControl(PlayerId(), true, 0)
end)

-- Geler / dégeler sur place.
RegisterNetEvent('origin_logs:geler', function(geler)
  local ped = PlayerPedId()
  FreezeEntityPosition(ped, geler and true or false)
  if geler then
    SetNotificationTextEntry('STRING')
    AddTextComponentString('~b~Vous avez été gelé par le staff.')
    DrawNotification(true, true)
  end
end)

-- Un message du staff, en notification (le chat le montre déjà ; ceci
-- s'affiche même quand le chat est masqué).
RegisterNetEvent('origin_logs:message', function(texte, par)
  SetNotificationTextEntry('STRING')
  AddTextComponentString(('~p~MESSAGE STAFF~s~ (%s)~n~%s'):format(par or 'staff', texte or ''))
  DrawNotification(true, true)
end)
