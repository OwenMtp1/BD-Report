-- ============================================================
-- Détections
-- Tout est mesuré CÔTÉ SERVEUR (GetEntityCoords, GetEntityHealth) :
-- un anticheat qui croit le client sur parole ne détecte que les
-- tricheurs qui ont oublié de mentir.
-- ============================================================
if not Config.Anticheat.enabled then return end

local AC = Config.Anticheat
local etat = {}   -- [src] = { pos, vie, t }

local function modeles()
  local m = {}
  for _, nom in ipairs(AC.entitesInterdites) do m[GetHashKey(nom)] = nom end
  return m
end
local INTERDITS = modeles()

CreateThread(function()
  while true do
    Wait(AC.heartbeatMs)
    for _, s in ipairs(GetPlayers()) do
      local src = tonumber(s)
      local ped = GetPlayerPed(src)
      if ped and ped ~= 0 then
        local pos = GetEntityCoords(ped)
        local vie = GetEntityHealth(ped)
        local prec = etat[src]
        local maintenant = GetGameTimer()

        if prec then
          local dt = (maintenant - prec.t) / 1000.0
          local d = #(pos - prec.pos)

          -- Téléportation : une distance qu'aucun véhicule ne couvre.
          if d > AC.positionDelta and dt > 0 and dt < 6 then
            local vehicule = GetVehiclePedIsIn(ped, false)
            local vitesse = d / dt * 3.6
            -- Un avion rapide monte à ~350 km/h : au-delà, ce n'est plus du jeu.
            if vitesse > AC.vehicleSpeed then
              local p = Framework.GetPlayer(src)
              if p then
                Origin.Log({
                  cat = 'anticheat', sev = (vehicule ~= 0) and 'notice' or 'alerte',
                  actor = p,
                  msg = ((vehicule ~= 0) and 'Vitesse véhicule anormale — %s' or 'Téléportation anormale — %s'):format(p.name),
                  data = { kind = 'flag', detection = (vehicule ~= 0) and 'vehicle_speed' or 'position_delta',
                           distance = ('%.0f m'):format(d), duree = ('%.1f s'):format(dt),
                           vitesse = ('%.0f km/h'):format(vitesse),
                           depart = ('vector3(%.2f, %.2f, %.2f)'):format(prec.pos.x, prec.pos.y, prec.pos.z),
                           arrivee = ('vector3(%.2f, %.2f, %.2f)'):format(pos.x, pos.y, pos.z),
                           enVehicule = vehicule ~= 0 },
                  res = 'origin_guard'
                })
              end
            end
          end

          -- Régénération brutale hors soin.
          if vie - prec.vie >= AC.healthJump and prec.vie > 0 then
            local p = Framework.GetPlayer(src)
            if p then
              Origin.Alerte('anticheat', ('Santé modifiée hors gameplay — %s'):format(p.name),
                { kind = 'flag', detection = 'health_regen', valeurAvant = prec.vie,
                  valeurApres = vie, fenetre = ('%.1f s'):format(dt) }, p)
            end
          end
        end
        etat[src] = { pos = pos, vie = vie, t = maintenant }
      end
    end
  end
end)

AddEventHandler('playerDropped', function() etat[source] = nil end)

-- Explosions qu'un joueur ne peut pas déclencher légitimement.
if AC.explosions then
  AddEventHandler('explosionEvent', function(sender, ev)
    if not AC.explosionsInterdites[ev.explosionType] then return end
    local src = tonumber(sender)
    local p = src and Framework.GetPlayer(src) or nil
    if not p then return end
    Origin.Critique('anticheat', ('Explosion non autorisée — %s'):format(p.name),
      { kind = 'flag', detection = 'explosion_owner', type = ev.explosionType,
        position = ('vector3(%.2f, %.2f, %.2f)'):format(ev.posX, ev.posY, ev.posZ),
        action = 'signalé' }, p)
  end)
end

-- Véhicules interdits : on refuse la création, on ne se contente pas
-- de la constater après coup.
if AC.entities then
  AddEventHandler('entityCreating', function(entite)
    local modele = GetEntityModel(entite)
    local nom = INTERDITS[modele]
    if not nom then return end
    CancelEvent()
    local proprio = NetworkGetEntityOwner(entite)
    local p = proprio and Framework.GetPlayer(proprio) or nil
    Origin.Alerte('anticheat', p and ('Véhicule interdit refusé — %s'):format(p.name)
                                 or 'Véhicule interdit refusé',
      { kind = 'flag', detection = 'entity_blacklist', entite = nom, action = 'création annulée' }, p)
  end)
end
