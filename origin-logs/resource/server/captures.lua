-- ============================================================
-- Captures de l'écran d'un joueur
-- Le panneau ne commande jamais le serveur de jeu : il dépose une
-- tâche, on vient la chercher (server/actions.lua), on prend la
-- capture et on la RENVOIE à l'API. Rien n'est stocké ici.
--
-- Dépendance : la ressource officielle « screenshot-basic ».
--   https://github.com/citizenfx/screenshot-basic
-- Elle n'est PAS nécessaire au reste du panneau : sans elle, la
-- demande échoue avec un message qui dit quoi installer, au lieu de
-- rester sans réponse.
-- ============================================================

local function screenshotDispo()
  return GetResourceState('screenshot-basic') == 'started'
end

-- ⚠️ On passe par `requestClientScreenshot` (qui rend une data-uri) et on
-- POSTE nous-mêmes, plutôt que par `requestClientScreenshotUpload`.
-- Celui-ci envoie un multipart/form-data : il faudrait un analyseur de
-- multipart côté API — une pièce de plus à écrire et à maintenir pour
-- transporter un seul fichier. Ici le corps est le base64 de l'image, et
-- l'API le décode puis reconnaît le format dans ses premiers octets.
function DemanderCapture(a, accuser)
  if not Config.Screenshots or not Config.Screenshots.enabled then
    return accuser(a.id, false, 'captures désactivées dans config.lua')
  end
  if not screenshotDispo() then
    return accuser(a.id, false, 'ressource screenshot-basic absente — ajoutez-la puis « ensure screenshot-basic »')
  end

  local src = Framework.TrouverParCle(a.key)
  if not src then return accuser(a.id, false, 'joueur hors ligne') end

  -- Prévenir le joueur, ou non : c'est un choix de serveur, pas le nôtre.
  -- Le règlement de certains l'impose ; d'autres perdraient tout intérêt
  -- à la capture en prévenant.
  if Config.Screenshots.notifierJoueur then
    TriggerClientEvent('chat:addMessage', src, {
      color = { 180, 140, 255 }, multiline = true,
      args = { 'STAFF', 'Une capture de votre écran vient d\'être prise par le staff.' }
    })
  end

  local opts = {
    encoding = Config.Screenshots.format or 'jpg',
    quality  = Config.Screenshots.quality or 0.7
  }

  local lance = pcall(function()
    exports['screenshot-basic']:requestClientScreenshot(src, opts, function(err, data)
      if err or type(data) ~= 'string' then
        return accuser(a.id, false, 'capture refusée par le client : ' .. tostring(err or 'aucune donnée'))
      end
      -- data = « data:image/jpg;base64,…… » : on ne garde que la charge.
      local b64 = data:match('^data:[^;]+;base64,(.+)$') or data
      if #b64 > (Config.Screenshots.maxKo or 4096) * 1400 then
        return accuser(a.id, false, 'capture trop lourde — baissez Config.Screenshots.quality')
      end
      PerformHttpRequest(Config.ApiUrl .. '/api/screens', function(code, body)
        if code ~= 200 then
          accuser(a.id, false, 'dépôt refusé par l\'API (' .. tostring(code) .. ')')
        end
        -- Succès : l'API a déjà passé l'action à « done » en enregistrant
        -- la capture, avec son numéro. Accuser une seconde fois ici
        -- écraserait ce numéro par un message plus pauvre.
      end, 'POST', b64, {
        ['Content-Type']      = 'application/octet-stream',
        ['X-Origin-Key']      = Config.ServerKey,
        ['X-Screen-Encoding'] = 'base64',
        ['X-Screen-Action']   = tostring(a.id)
      })
    end)
  end)
  if not lance then accuser(a.id, false, 'screenshot-basic a refusé la demande') end
end

CreateThread(function()
  Wait(2000)
  if Config.Screenshots and Config.Screenshots.enabled and not screenshotDispo() then
    print('[origin_logs] screenshot-basic n\'est pas démarré : les demandes de capture échoueront.')
    Origin.Notice('admin', 'screenshot-basic inactif — captures d\'écran indisponibles',
      { kind = 'config', remede = 'ensure screenshot-basic dans server.cfg' })
  end
end)
