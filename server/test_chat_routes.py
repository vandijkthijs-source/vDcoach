import importlib.util
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
sys.path.insert(0, os.path.dirname(__file__))

class ChatRouteTests(unittest.TestCase):
    def test_routes_require_existing_token_and_do_not_mutate_progress(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, {"VDCOACH_DATA":root}):
            spec=importlib.util.spec_from_file_location("chat_route_server",os.path.join(os.path.dirname(__file__),"server.py"))
            mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
            server=ThreadingHTTPServer(("127.0.0.1",0),mod.Handler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            base=f"http://127.0.0.1:{server.server_port}"
            before=mod.STORE.read()
            def call(path,body=None,authorized=True):
                headers={"Content-Type":"application/json"}
                if authorized:headers["Authorization"]="Bearer "+mod.TOKEN
                req=Request(base+path,headers=headers,data=json.dumps(body).encode() if body is not None else None)
                try:
                    with urlopen(req) as response:return response.status,json.load(response)
                except HTTPError as error:
                    with error:return error.code,json.load(error)
            try:
                for path in ("/chat/status","/chat/history?date=2026-11-13","/chat/accounts","/chat/models"):
                    self.assertEqual(call(path,authorized=False)[0],401)
                self.assertEqual(call("/chat/send",{},False)[0],401)
                status=call("/chat/status");self.assertEqual(status[0],200);self.assertFalse(status[1]["connected"])
                self.assertNotIn("access_token",json.dumps(status))
                self.assertEqual(call("/chat/history?date=2026-11-13")[1]["messages"],[])
                self.assertEqual(call("/chat/models")[0],401)
                self.assertEqual(call("/chat/auth/confirm-included",{"confirmed":True})[0],401)
                self.assertEqual(call("/chat/auth/start",{"redirectUri":"http://other-host/auth/callback"})[0],400)
                attempt=call("/chat/auth/start",{"redirectUri":"http://127.0.0.1:32123/auth/callback"})
                self.assertEqual(attempt[0],200)
                self.assertEqual(call("/chat/auth/cancel",{"attemptId":attempt[1]["attemptId"]})[0],200)
                self.assertEqual(call("/chat/auth/finish",{"attemptId":attempt[1]["attemptId"],"state":attempt[1]["state"]})[0],401)
                self.assertEqual(mod.STORE.read(),before)
            finally:
                server.shutdown();server.server_close();thread.join()
