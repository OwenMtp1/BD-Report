fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'origin_logs'
author 'Origin Roleplay'
version '1.0.0'
description 'Journalisation serveur vers le panneau de logs Origin'

shared_script 'config.lua'

server_scripts {
  -- D'abord les réglages qui ne doivent pas partir chez les joueurs :
  -- tout le reste s'appuie dessus.
  'server/config_serveur.lua',
  'server/framework.lua',
  'server/logger.lua',
  'server/connexions.lua',
  'server/jeu.lua',
  'server/framework_hooks.lua',
  'server/anticheat.lua',
  'server/actions.lua',
  'server/captures.lua',
  'server/presence.lua',
  'server/inventaire.lua',
  'server/scan.lua',
  -- ⚠️ Les raccordements propres à CE serveur, générés par le panneau.
  -- Un motif plutôt qu'un fichier nommé : un motif qui ne correspond à
  -- rien est sans effet, alors qu'un fichier absent fait échouer le
  -- chargement de la ressource chez tous ceux qui n'en ont pas.
  'server/sur_mesure/*.lua'
}

client_script 'client/main.lua'
