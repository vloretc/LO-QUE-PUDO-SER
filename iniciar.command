#!/bin/zsh
cd -- "${0:A:h}"
RUNTIME_PYTHON="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
# Servidor local; musica.mpeg se sirve como audio MP3 para que Safari y Chrome la reproduzcan
SERVER="import http.server as h; h.SimpleHTTPRequestHandler.extensions_map['.mpeg']='audio/mpeg'; h.test(HandlerClass=h.SimpleHTTPRequestHandler, port=8765, bind='127.0.0.1')"
print 'Abre http://localhost:8765 en Chrome o Edge. Ctrl+C para terminar.'
if [[ -x "$RUNTIME_PYTHON" ]]; then
  "$RUNTIME_PYTHON" -c "$SERVER"
else
  python3 -c "$SERVER"
fi
