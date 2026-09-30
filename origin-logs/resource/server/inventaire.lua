-- ============================================================
-- Niveau 1 — l'inventaire : « qu'est-ce qui tourne ici ? »
-- ============================================================
-- Une liste de NOMS, envoyée une fois au démarrage. Elle ne découvre
-- rien de neuf, mais elle répond à la question qu'on se posait à chaque
-- livraison : pourquoi la rubrique Banque reste-t-elle vide chez ce
-- client ? Parce qu'il fait tourner `Renewed-Banking`, que le panneau
-- connaît mais qui n'est pas raccordée.
--
-- ⚠️ Des NOMS, rien d'autre : ni code, ni chemins, ni contenu de
-- fichier. Beaucoup de ressources FiveM sont payantes et sous licence.
-- ============================================================
Origin = Origin or {}

local function liste()
  local out = {}
  for i = 0, GetNumResources() - 1 do
    local nom = GetResourceByFindIndex(i)
    if nom and nom ~= '' then
      out[#out + 1] = {
        nom = nom,
        etat = GetResourceState(nom),
        -- `version` est facultative dans un fxmanifest : son absence
        -- n'est pas une anomalie, juste une information en moins.
        version = GetResourceMetadata(nom, 'version', 0) or ''
      }
    end
  end
  return out
end

function Origin.EnvoyerInventaire(retour)
  if Config.ServerKey == '' then return end
  local corps = json.encode({
    framework = Framework and Framework.nom or 'standalone',
    ressources = liste()
  })
  PerformHttpRequest(Config.ApiUrl .. '/api/inventory', function(code, texte)
    if retour then retour(code, texte) end
    if code ~= 200 and Config.Debug then
      print(('[origin_logs] inventaire refusé (%s) %s'):format(code, texte or ''))
    end
  end, 'POST', corps, { ['Content-Type'] = 'application/json', ['X-Origin-Key'] = Config.ServerKey })
end

CreateThread(function()
  -- ⚠️ Après les autres ressources, pas avant. `origin_logs` démarre
  -- souvent tôt : un inventaire pris à la seconde zéro ne verrait qu'un
  -- serveur à moitié allumé, et conclurait à l'absence de la moitié des
  -- ressources.
  Wait(15000)
  Origin.EnvoyerInventaire()
end)

RegisterCommand('origin_logs_inventaire', function(src)
  if src ~= 0 then return end   -- console uniquement
  Origin.EnvoyerInventaire(function(code)
    print(('[origin_logs] inventaire envoyé (%s ressources) — réponse %s')
      :format(#liste(), code))
  end)
end, true)
