from __future__ import annotations

import hashlib
import json
import time
import urllib.parse
import urllib.request
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


PORT = 8767


def json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def truncate_for_youdao(text: str) -> str:
    if len(text) <= 20:
        return text
    return text[:10] + str(len(text)) + text[-10:]


def fetch_text(url: str) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Yiyan local proxy)",
            "Accept": "text/html,text/plain;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read()
        content_type = response.headers.get("Content-Type", "")
    charset = "utf-8"
    if "charset=" in content_type:
        charset = content_type.split("charset=", 1)[1].split(";", 1)[0].strip() or "utf-8"
    return {"html": raw.decode(charset, errors="replace"), "contentType": content_type}


def youdao_translate(text: str, app_key: str, app_secret: str, from_lang: str, to_lang: str) -> dict[str, Any]:
    salt = uuid.uuid4().hex
    curtime = str(int(time.time()))
    sign_text = app_key + truncate_for_youdao(text) + salt + curtime + app_secret
    sign = hashlib.sha256(sign_text.encode("utf-8")).hexdigest()
    body = urllib.parse.urlencode(
        {
            "q": text,
            "from": from_lang or "auto",
            "to": to_lang or "zh-CHS",
            "appKey": app_key,
            "salt": salt,
            "sign": sign,
            "signType": "v3",
            "curtime": curtime,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://openapi.youdao.com/api",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read().decode("utf-8", errors="replace")
    data = json.loads(raw)
    if str(data.get("errorCode", "0")) != "0":
        return {"ok": False, "error": f"有道错误码 {data.get('errorCode')}", "raw": data}
    return {"ok": True, "translation": "\n".join(data.get("translation") or [])}


class Handler(BaseHTTPRequestHandler):
    server_version = "YiyanLocalProxy/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json({"ok": True, "service": "译言本地代理"})
        else:
            self.send_json({"ok": False, "error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        try:
            data = self.read_json()
            if self.path == "/fetch-url":
                self.send_json({"ok": True, **fetch_text(data.get("url", ""))})
            elif self.path == "/youdao":
                self.send_json(
                    youdao_translate(
                        data.get("text", ""),
                        data.get("appKey", ""),
                        data.get("appSecret", ""),
                        data.get("from", "auto"),
                        data.get("to", "zh-CHS"),
                    )
                )
            else:
                self.send_json({"ok": False, "error": "not found"}, HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_json(self, payload: Any, status: int = HTTPStatus.OK) -> None:
        raw = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"译言本地代理已启动：http://127.0.0.1:{PORT}")
    print("保持这个窗口开着，再回到译言工作台导入网页或调用有道翻译。")
    server.serve_forever()


if __name__ == "__main__":
    main()
