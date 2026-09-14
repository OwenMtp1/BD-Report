-- ============================================================
-- Raccordements optionnels
-- Chacun est protégé : si la ressource n'est pas là, on ne
-- s'accroche pas, et rien ne casse. C'est ce qui permet de
-- poser origin_logs sur un serveur avant d'avoir tranché
-- entre ESX et QBCore.
-- ============================================================
CreateThread(function()
  Wait(2000)

  ---------------------------------------------------------------
  -- QBCore / QBox — argent, job, inventaire de base
  ---------------------------------------------------------------
  if Framework.nom == 'qb' or Framework.nom == 'qbox' then
    AddEventHandler('QBCore:Server:OnMoneyChange', function(src, compte, montant, operation, raison)
      local p = Framework.GetPlayer(src); if not p then return end
      local verbe = operation == 'add' and 'a reçu' or 'a perdu'
      Origin.Log({
        cat = 'economie', sev = montant >= 50000 and 'notice' or 'info', actor = p,
        msg = ('%s %s %s $ (%s)'):format(p.name, verbe, montant, compte),
        data = { kind = 'money', compte = compte, montant = montant,
                 operation = operation, motif = raison },
        res = 'qb-management'
      })
    end)
    AddEventHandler('QBCore:Server:OnJobUpdate', function(src, job)
      local p = Framework.GetPlayer(src); if not p then return end
      Origin.Info('jobs', ('%s a changé de métier — %s'):format(p.name, job.label or job.name),
        { kind = 'job', job = job.name, grade = job.grade and job.grade.level }, p)
    end)
  end

  ---------------------------------------------------------------
  -- ESX — job et chargement du personnage
  ---------------------------------------------------------------
  if Framework.nom == 'esx' then
    AddEventHandler('esx:setJob', function(src, job, ancien)
      local p = Framework.GetPlayer(src); if not p then return end
      Origin.Info('jobs', ('%s est passé de %s à %s'):format(p.name,
        ancien and ancien.label or '—', job.label or job.name),
        { kind = 'job', job = job.name, grade = job.grade, ancien = ancien and ancien.name }, p)
    end)
    -- ESX ne publie pas les mouvements d'argent. Ajoutez dans vos scripts :
    --   exports['origin_logs']:Log({ cat='economie', sev='info', actor=source,
    --     msg=('%s a retiré %s $'):format(nom, montant), data={ kind='money', montant=montant } })
  end

  ---------------------------------------------------------------
  -- ox_inventory — échanges, dépôts et retraits de coffres
  ---------------------------------------------------------------
  if GetResourceState('ox_inventory') == 'started' then
    local ok = pcall(function()
      exports.ox_inventory:registerHook('swapItems', function(donnees)
        local p = Framework.GetPlayer(donnees.source)
        if not p then return end
        local item = donnees.fromSlot and donnees.fromSlot.name or 'objet'
        local qte = donnees.count or 1
        local depuis = donnees.fromInventory
        local vers = donnees.toInventory
        local versJoueur = tonumber(vers) and Framework.GetPlayer(vers) or nil
        Origin.Log({
          cat = 'inventaire', sev = 'info', actor = p, target = versJoueur,
          msg = versJoueur
            and ('%s a donné %d× %s à %s'):format(p.name, qte, item, versJoueur.name)
            or  ('%s a déplacé %d× %s vers %s'):format(p.name, qte, item, tostring(vers)),
          data = { kind = 'swap', item = item, quantite = qte,
                   de = tostring(depuis), vers = tostring(vers) },
          res = 'ox_inventory'
        })
      end, { print = false })
    end)
    if not ok then print('[origin_logs] ox_inventory présent mais registerHook indisponible (version trop ancienne).') end
  end

  ---------------------------------------------------------------
  -- txAdmin — actions staff, sanctions et vie du serveur
  -- Ces évènements existent quel que soit le framework : c'est la
  -- source la plus fiable pour les catégories Administration,
  -- Sanctions et Serveur.
  ---------------------------------------------------------------
  AddEventHandler('txAdmin:events:playerKicked', function(d)
    Origin.Notice('sanctions', ('%s a expulsé %s — %s'):format(d.author or 'staff', d.target or '?', d.reason or 'sans motif'),
      { kind = 'kick', type = 'kick', cible = d.target, motif = d.reason, staff = d.author })
  end)
  AddEventHandler('txAdmin:events:playerBanned', function(d)
    local perm = not d.expiration
    Origin.Log({
      cat = 'bans', sev = perm and 'critique' or 'alerte',
      msg = ('%s a banni %s %s — %s'):format(d.author or 'staff', d.target or '?',
            perm and 'définitivement' or 'temporairement', d.reason or 'sans motif'),
      data = { kind = 'ban', type = 'ban', cible = d.target, motif = d.reason, staff = d.author,
               expireAt = d.expiration and (d.expiration * 1000) or nil },
      res = 'txAdmin'
    })
  end)
  AddEventHandler('txAdmin:events:playerWarned', function(d)
    Origin.Notice('sanctions', ('%s a averti %s — %s'):format(d.author or 'staff', d.target or '?', d.reason or 'sans motif'),
      { kind = 'warn', type = 'warn', cible = d.target, motif = d.reason, staff = d.author })
  end)
  AddEventHandler('txAdmin:events:playerWhitelisted', function(d)
    Origin.Info('whitelist', ('%s a whitelisté %s'):format(d.author or 'staff', d.target or '?'),
      { kind = 'whitelist', cible = d.target, staff = d.author })
  end)
  AddEventHandler('txAdmin:events:announcement', function(d)
    Origin.Info('admin', ('Annonce serveur — %s'):format(d.message or ''),
      { kind = 'announce', auteur = d.author, texte = d.message })
  end)
  AddEventHandler('txAdmin:events:scheduledRestart', function(d)
    Origin.Notice('systeme', ('Redémarrage programmé dans %s'):format(d.secondsRemaining and (d.secondsRemaining .. ' s') or '?'),
      { kind = 'restart', secondes = d.secondsRemaining })
  end)
  AddEventHandler('txAdmin:events:serverShuttingDown', function(d)
    Origin.Alerte('systeme', ('Arrêt du serveur — %s'):format(d.message or 'sans message'),
      { kind = 'shutdown', delai = d.delay, auteur = d.author })
  end)
end)

---------------------------------------------------------------
-- Santé du serveur : une chute de tickrate est un fait de jeu,
-- pas une curiosité technique — elle explique les plaintes.
---------------------------------------------------------------
CreateThread(function()
  local dernier = 0
  while true do
    Wait(60000)
    local joueurs = #GetPlayers()
    local ms = GetGameTimer()
    -- On ne signale qu'un franchissement de seuil, pas chaque minute.
    if joueurs >= 100 and dernier < 100 then
      Origin.Notice('systeme', ('Charge élevée — %d joueurs connectés'):format(joueurs),
        { kind = 'load', joueurs = joueurs, uptime = math.floor(ms / 60000) .. ' min' })
    end
    dernier = joueurs
  end
end)
