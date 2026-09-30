-- ============================================================
-- Réglages qui NE DOIVENT PAS partir chez les joueurs
-- ============================================================
-- ⚠️ `config.lua` est déclaré en `shared_script` : son contenu est
-- téléchargé par chaque client, et reste dans son cache. Une clé
-- d'ingestion posée là-bas est donc une clé PUBLIQUE — n'importe quel
-- joueur peut la lire et écrire ce qu'il veut dans vos journaux, ou les
-- noyer pour y cacher autre chose.
--
-- Ce fichier-ci est un `server_script` : il ne quitte jamais la machine.
-- Et même ici, la clé se lit d'abord dans une CONVAR, parce que beaucoup
-- de serveurs versionnent leurs `resources/` — parfois dans le dépôt de
-- quelqu'un d'autre, parfois public.
--
-- Dans `server.cfg` (ou mieux, un `secrets.cfg` non versionné qu'on
-- charge avec `exec secrets.cfg`) :
--
--     set origin_logs_url  "http://127.0.0.1:8080"
--     set origin_logs_key  "la clé affichée par npm run setup"
--     set origin_logs_name "origin-1"
--
-- ⚠️ `set`, PAS `setr` : `setr` réplique la convar chez les clients, ce
-- qui remettrait la clé exactement là d'où on vient de la sortir.
-- ============================================================

local function reglage(convar, repli)
  local v = GetConvar(convar, '')
  if v ~= nil and v ~= '' then return v end
  return repli
end

-- Adresse de l'API (le service Node du dossier api/). Depuis la machine
-- du serveur de jeu, c'est souvent 127.0.0.1 : n'exposez pas le port.
Config.ApiUrl = reglage('origin_logs_url', 'http://127.0.0.1:8080')

-- MÊME valeur que SERVER_KEY côté API. Sans elle, rien n'est accepté.
Config.ServerKey = reglage('origin_logs_key', '')

-- Nom de ce serveur, utile si vous en faites tourner plusieurs.
Config.ServerName = reglage('origin_logs_name', 'origin-1')

CreateThread(function()
  Wait(1000)
  if Config.ServerKey == '' then
    print('^1[origin_logs] Aucune clé d\'ingestion : rien ne sera journalisé.^7')
    print('^1                Posez « set origin_logs_key "…" » dans server.cfg.^7')
  elseif Config.ServerKey == 'CHANGEZ-MOI' then
    print('^1[origin_logs] La clé est restée « CHANGEZ-MOI » : l\'API refusera tout.^7')
  end
end)
