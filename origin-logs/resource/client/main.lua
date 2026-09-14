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
