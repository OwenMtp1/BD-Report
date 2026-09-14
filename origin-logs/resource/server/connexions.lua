-- ============================================================
-- Arrivées et départs, et refus des joueurs bannis
-- ============================================================
local sessions = {}   -- [src] = horodatage d'arrivée

local function enc(s) return (tostring(s or ''):gsub('[^%w%-%._~:]', function(c)
  return ('%%%02X'):format(c:byte()) end)) end

AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
  local src = source
  local ids = Framework.Identifiants(src)

  if not Config.BanCheck then
    Origin.Info('connexions', ('%s se connecte'):format(name),
      { kind = 'connecting', identifiants = ids })
    return
  end

  deferrals.defer()
  Wait(0)
  deferrals.update('Origin Roleplay — vérification de votre accès…')

  local repondu = false
  local url = ('%s/api/ban-check?key=%s&discord=%s&steam=%s&fivem=%s'):format(
    Config.ApiUrl, enc(ids.license), enc(ids.discord), enc(ids.steam), enc(ids.fivem))

  PerformHttpRequest(url, function(code, body)
    if repondu then return end
    repondu = true
    local ban = nil
    if code == 200 and body then
      local ok, res = pcall(json.decode, body)
      if ok and res then ban = res.ban end
    end
    if ban then
      local fin = ban.expires_at and
        ('Fin du bannissement : ' .. os.date('%d/%m/%Y à %H:%M', math.floor(ban.expires_at / 1000)))
        or 'Ce bannissement est définitif.'
      deferrals.done(Config.BanMessage:format(ban.reason or 'non précisé', fin))
      Origin.Alerte('connexions',
        ('Connexion refusée — %s est banni'):format(name),
        { kind = 'ban_refuse', banId = ban.id, motif = ban.reason, identifiants = ids })
    else
      deferrals.done()
      Origin.Info('connexions', ('%s se connecte'):format(name),
        { kind = 'connecting', identifiants = ids })
    end
  end, 'GET', '', { ['X-Origin-Key'] = Config.ServerKey })

  -- Si l'API ne répond pas, on LAISSE ENTRER : une panne du panneau de
  -- logs ne doit pas fermer le serveur à tout le monde.
  local attente = 0
  while not repondu and attente < 5000 do Wait(100); attente = attente + 100 end
  if not repondu then
    repondu = true
    deferrals.done()
    print('[origin_logs] API injoignable — vérification de bannissement ignorée pour ' .. name)
  end
end)

AddEventHandler('playerJoining', function()
  local src = source
  sessions[src] = os.time()
  local p = Framework.GetPlayer(src)
  if not p then return end
  Origin.Log({
    cat = 'connexions', sev = 'info', actor = p,
    msg = ('%s a rejoint le serveur'):format(p.name),
    data = { kind = 'join', serverId = src, ping = GetPlayerPing(src) .. ' ms',
             joueursEnLigne = #GetPlayers(), identifiants = {
               license = p.key, discord = p.discord, steam = p.steam, fivem = p.fivem } },
    res = 'origin_core'
  })
end)

AddEventHandler('playerDropped', function(reason)
  local src = source
  local p = Framework.GetPlayer(src)
  local debut = sessions[src]
  sessions[src] = nil
  if not p then return end
  Origin.Log({
    cat = 'connexions', sev = 'info', actor = p,
    msg = ('%s s\'est déconnecté'):format(p.name),
    data = { kind = 'leave', raison = reason, serverId = src,
             session = debut and (math.floor((os.time() - debut) / 60) .. ' min') or 'inconnue' },
    res = 'origin_core'
  })
end)
