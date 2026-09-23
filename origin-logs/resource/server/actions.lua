-- ============================================================
-- Exécution des décisions prises depuis le panneau
-- Le panneau ne parle jamais au serveur de jeu : il dépose une
-- tâche, et c'est le serveur qui vient la chercher. Aucun port
-- de jeu à ouvrir, aucune commande à distance.
-- ============================================================
local function entete()
  return { ['Content-Type'] = 'application/json', ['X-Origin-Key'] = Config.ServerKey }
end

local function accuser(id, ok, resultat)
  PerformHttpRequest(Config.ApiUrl .. '/api/actions/ack', function() end, 'POST',
    json.encode({ id = id, ok = ok, result = resultat }), entete())
end

local function executer(a)
  local src = Framework.TrouverParCle(a.key)

  if a.type == 'kick' then
    if not src then return accuser(a.id, false, 'joueur hors ligne') end
    DropPlayer(src, ('Expulsé par %s\nMotif : %s'):format(a.by or 'le staff', a.reason or '—'))
    return accuser(a.id, true, 'expulsé')

  elseif a.type == 'ban' then
    -- Le bannissement vit dans l'API (il est vérifié à la connexion) ;
    -- ici on ne fait que sortir le joueur s'il est encore là.
    if src then
      DropPlayer(src, ('Banni par %s\nMotif : %s'):format(a.by or 'le staff', a.reason or '—'))
      return accuser(a.id, true, 'banni et déconnecté')
    end
    return accuser(a.id, true, 'banni (joueur hors ligne)')

  elseif a.type == 'unban' then
    return accuser(a.id, true, 'bannissement levé')

  elseif a.type == 'warn' then
    if not src then return accuser(a.id, false, 'joueur hors ligne') end
    TriggerClientEvent('chat:addMessage', src, {
      color = { 255, 176, 32 },
      multiline = true,
      args = { 'AVERTISSEMENT', ('%s — %s'):format(a.by or 'staff', a.reason or '') }
    })
    TriggerClientEvent('origin_logs:avertissement', src, a.reason, a.by)
    return accuser(a.id, true, 'averti en jeu')

  elseif a.type == 'screenshot' then
    -- Le résultat n'arrive pas tout de suite : c'est le client qui
    -- dessine, puis l'API qui accuse en enregistrant la capture.
    return DemanderCapture(a, accuser)

  elseif a.type == 'scan' then
    -- ⚠️ Demandé DEPUIS LE PANNEAU, exécuté ici. Le panneau ne parle
    -- jamais au serveur de jeu : il dépose la tâche, on vient la
    -- chercher. Le scan relit tous les scripts serveur — il n'a donc
    -- aucune raison de tourner tout seul en boucle.
    Origin.EnvoyerInventaire()
    CreateThread(function()
      Origin.Scanner(function(code, _, ressources, protegees, lus)
        local total = 0
        for _, r in ipairs(ressources or {}) do total = total + #r.evenements end
        if code == 200 then
          -- Les raccordements sont posés par le panneau à la réception :
          -- on les relit tout de suite plutôt que d'attendre le tour
          -- suivant, sinon « lancer le scan » semblerait sans effet.
          Origin.ChargerRaccordements()
          accuser(a.id, true, ('%d évènement(s) dans %d ressource(s), %d fichier(s) lu(s), %d protégée(s)')
            :format(total, #(ressources or {}), lus or 0, #(protegees or {})))
        else
          accuser(a.id, false, 'le panneau a refusé le scan (' .. tostring(code) .. ')')
        end
      end)
    end)
    return

  elseif a.type == 'give' then
    if not src then return accuser(a.id, false, 'joueur hors ligne') end
    -- Rendre un item ou de l'argent dépend de votre framework : on
    -- publie l'intention, votre ressource la réalise.
    --   RegisterNetEvent('origin_logs:rendre', function(src, payload) ... end)
    TriggerEvent('origin_logs:rendre', src, a.payload or {}, a.by, a.reason)
    return accuser(a.id, true, 'transmis à origin_logs:rendre')
  end

  accuser(a.id, false, 'type d\'action inconnu : ' .. tostring(a.type))
end

CreateThread(function()
  Wait(4000)
  while true do
    Wait(Config.ActionPollMs)
    PerformHttpRequest(Config.ApiUrl .. '/api/actions/pending', function(code, body)
      if code ~= 200 or not body then return end
      local ok, res = pcall(json.decode, body)
      if not ok or not res or not res.actions then return end
      for _, a in ipairs(res.actions) do
        local fait, err = pcall(executer, a)
        if not fait then accuser(a.id, false, tostring(err)) end
      end
    end, 'GET', '', entete())
  end
end)
