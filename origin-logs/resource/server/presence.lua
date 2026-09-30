-- ============================================================
-- Battement de présence — « qui est en ligne »
--
-- ⚠️ ON ENVOIE LA LISTE ENTIÈRE, PAS LES CHANGEMENTS.
-- Déduire la présence des connexions et des départs paraît plus économe,
-- et c'est faux : un serveur de jeu qui redémarre, qui plante ou qu'on
-- met à jour n'émet aucun « playerDropped ». Tout le monde resterait
-- « en ligne » pour l'éternité, et le seul écran qu'un modérateur ouvre
-- en prenant son service deviendrait celui auquel il ne peut pas se fier.
-- Une photo complète toutes les 45 secondes coûte une requête et ne peut
-- pas dériver : ce qui n'est plus dans la liste est parti, point.
--
-- ⚠️ C'est la MÊME clé que les journaux : le battement vient du serveur
-- de jeu, comme le reste. Le bot Discord, lui, en a une autre.
-- ============================================================

local INTERVALLE = 45000   -- doit rester sous la moitié du TTL de l'API (95 s)

local function battre()
  local joueurs = {}
  for _, src in ipairs(GetPlayers()) do
    local s = tonumber(src)
    local p = Framework.GetPlayer(s)
    if p then
      local emploi = Framework.Job(s)
      joueurs[#joueurs + 1] = {
        key     = p.key,
        name    = p.name,
        sid     = s,
        -- Le Discord sert à reconnaître le staff EN JEU : c'est le seul
        -- identifiant que le panneau et le serveur partagent.
        discord = p.discord,
        job     = emploi and emploi.nom or p.job,
        ping    = GetPlayerPing(s)
      }
    end
  end

  PerformHttpRequest(Config.ApiUrl .. '/api/presence', function(code, _, _)
    -- ⚠️ On ne réessaie PAS un battement manqué : il serait périmé avant
    -- d'arriver, et le suivant part dans quarante-cinq secondes. Une
    -- photo ratée se remplace, elle ne se rattrape pas.
    if code ~= 200 and code ~= 0 and Config.Debug then
      print(('[origin_logs] battement de présence refusé (%s)'):format(tostring(code)))
    end
  end, 'POST', json.encode({ joueurs = joueurs }),
     { ['Content-Type'] = 'application/json', ['X-Origin-Key'] = Config.ServerKey })
end

if Config.Presence == false then
  print('[origin_logs] présence désactivée (Config.Presence = false) — l’écran « En ligne » restera vide.')
  return
end

CreateThread(function()
  -- Un premier battement peu après le démarrage : c'est justement le
  -- moment où la liste de l'API est périmée.
  Wait(6000)
  while true do
    local ok, err = pcall(battre)
    if not ok and Config.Debug then print('[origin_logs] présence : ' .. tostring(err)) end
    Wait(INTERVALLE)
  end
end)

-- Un départ ne fait pas attendre le battement suivant : quarante-cinq
-- secondes de retard sur « il vient de partir » se remarquent.
AddEventHandler('playerDropped', function()
  SetTimeout(500, function() pcall(battre) end)
end)
