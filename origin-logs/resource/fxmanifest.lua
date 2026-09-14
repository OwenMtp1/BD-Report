fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'origin_logs'
author 'Origin Roleplay'
version '1.0.0'
description 'Journalisation serveur vers le panneau de logs Origin'

shared_script 'config.lua'

server_scripts {
  'server/framework.lua',
  'server/logger.lua',
  'server/connexions.lua',
  'server/jeu.lua',
  'server/framework_hooks.lua',
  'server/anticheat.lua',
  'server/actions.lua'
}

client_script 'client/main.lua'
