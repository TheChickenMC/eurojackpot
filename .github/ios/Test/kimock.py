"""Attrappe der KI-Anbieter fuer den Test (Browser und iPhone-Simulator) (nur 127.0.0.1, mit CORS wie die echten Server).
/claude/v1/models, /claude/v1/messages (SSE), /openai/v1/models, /openai/v1/chat/completions (SSE).
Speichert jede Anfrage (Pfad, Kopfzeilen, Inhalt) in <protokollordner>/anfragen.txt.
Aufruf: python -I kimock.py <port> <protokollordner>"""
import http.server
import json
import os
import sys
import time

port, ordner = int(sys.argv[1]), sys.argv[2]
os.makedirs(ordner, exist_ok=True)
PROTOKOLL = os.path.join(ordner, "anfragen.txt")
ANTWORT = "Hallo! Ich bin die Online-KI aus dem Test. Umlaute: äöü ß – „Zitat“."


def claude_sse(text):
    teile = [text[: len(text) // 2], text[len(text) // 2:]]
    s = 'event: message_start\ndata: {"type":"message_start","message":{"id":"m","content":[]}}\n\n'
    s += 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
    for t in teile:
        s += 'event: content_block_delta\ndata: ' + json.dumps(
            {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": t}}, ensure_ascii=False) + "\n\n"
    s += 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n'
    s += 'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    return teile, s


def openai_sse(text):
    teile = [text[: len(text) // 2], text[len(text) // 2:]]
    s = 'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}\n\n'
    for t in teile:
        s += "data: " + json.dumps({"choices": [{"index": 0, "delta": {"content": t}}]}, ensure_ascii=False) + "\n\n"
    s += 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
    return teile, s


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def protokoll(self, inhalt):
        with open(PROTOKOLL, "a", encoding="utf-8") as f:
            kopf = {k.lower(): v for k, v in self.headers.items()}
            f.write(json.dumps({"methode": self.command, "pfad": self.path, "kopf": kopf, "inhalt": inhalt}, ensure_ascii=False) + "\n")

    def senden(self, code, typ, text, stueckweise=None):
        daten = text.encode("utf-8")
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(daten)))
        self.end_headers()
        if stueckweise:
            # in zwei Teilen mit Pause, damit die Seite Zwischenstaende sieht
            mitte = len(daten) // 2
            self.wfile.write(daten[:mitte])
            self.wfile.flush()
            time.sleep(0.4)
            self.wfile.write(daten[mitte:])
        else:
            self.wfile.write(daten)

    def do_OPTIONS(self):
        self.protokoll(None)
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self.protokoll(None)
        if self.path.startswith("/claude/v1/models") and "sk-ant-falsch" in (self.headers.get("x-api-key") or ""):
            self.senden(401, "application/json", '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')
        elif self.path.startswith("/claude/v1/models"):
            self.senden(200, "application/json", '{"data":[{"id":"claude-haiku-4-5"},{"id":"claude-opus-5-5"},{"id":"claude-sonnet-5-5"}],"has_more":false}')
        elif self.path.startswith("/openai/v1/models"):
            self.senden(200, "application/json", '{"object":"list","data":[{"id":"gpt-4o-mini"},{"id":"gpt-5-mini"}]}')
        else:
            self.senden(404, "application/json", '{"error":"nicht da"}')

    def do_POST(self):
        laenge = int(self.headers.get("Content-Length", "0"))
        inhalt = self.rfile.read(laenge).decode("utf-8")
        self.protokoll(inhalt)
        if self.path.startswith("/claude/v1/messages"):
            if "sk-ant-falsch" in (self.headers.get("x-api-key") or ""):
                self.senden(401, "application/json", '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')
                return
            self.senden(200, "text/event-stream", claude_sse(ANTWORT)[1], stueckweise=True)
        elif self.path.startswith("/openai/v1/chat/completions"):
            self.senden(200, "text/event-stream", openai_sse(ANTWORT)[1], stueckweise=True)
        else:
            self.senden(404, "application/json", '{"error":"nicht da"}')

    def log_message(self, format, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
