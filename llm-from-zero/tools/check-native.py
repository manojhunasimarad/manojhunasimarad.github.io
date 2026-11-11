"""Native-layout and runner regressions; all writes go to a temporary directory."""
import http.client
import json
import pathlib
import sys
import tempfile
import threading
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'py'))
import runner
import server

class NativeTests(unittest.TestCase):
    def test_progress_roundtrip_is_idempotent_and_paths_stay_local(self):
        import sync
        with tempfile.TemporaryDirectory(prefix='lfz-sync-') as tmp:
            source=server.sqlite3.connect(':memory:');target=server.sqlite3.connect(':memory:')
            try:
                for con in (source,target):con.row_factory=server.sqlite3.Row;con.executescript(server.SCHEMA)
                source.execute("insert into attempts values('py-celsius',1000,3,3,1)")
                source.execute("insert into lessons values('py-01',1000)")
                source.execute("insert into settings values('agent_url','private-device-address')")
                data=sync.export(source,tmp,'4.1.0')
                self.assertFalse(any(r['k']=='agent_url' for r in data['tables']['settings']))
                data['work']={'python/py-celsius.py':{'code':'pass\n','mtime':1000},'python/D:escape.py':{'code':'bad','mtime':1000},'../escape.py':{'code':'bad','mtime':1000}}
                added=sync.merge(target,data,tmp);again=sync.merge(target,data,tmp)
                self.assertEqual(added['solution files'],1);self.assertEqual(again,{})
                self.assertEqual(target.execute('select count(*) from attempts').fetchone()[0],1)
                self.assertEqual(list(pathlib.Path(tmp).rglob('*.py')),[pathlib.Path(tmp)/'python/py-celsius.py'])
            finally:source.close();target.close()

    def test_output_then_crash_fails(self):
        r=runner.run_tests("print('right')\nraise RuntimeError('failed')",[{'test':'','expected_output':'right'}])[0]
        self.assertFalse(r['ok'])
        self.assertIn('RuntimeError',r['error'])

    def test_timeout_never_passes(self):
        r=runner.result_for(1,{'test':'','expected_output':'right'},'right','',True)
        self.assertFalse(r['ok'])

    def test_native_layout_and_token(self):
        self.assertEqual(pathlib.Path(server.CONTENT),ROOT/'content')
        with tempfile.TemporaryDirectory(prefix='lfz-native-') as tmp:
            server.DATA=tmp;server.WORK=str(pathlib.Path(tmp)/'work');server.PAPERS=str(pathlib.Path(tmp)/'papers');server.DB=str(pathlib.Path(tmp)/'progress.db')
            server.init_db();server.C=server.Content();server.migrate()
            app=server.http.server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            thread=threading.Thread(target=app.serve_forever,daemon=True);thread.start()
            client=http.client.HTTPConnection('127.0.0.1',app.server_port)
            try:
                client.request('GET','/');response=client.getresponse();html=response.read().decode()
                self.assertEqual(response.status,200);self.assertIn('content="'+server.TOKEN+'"',html);self.assertNotIn('src="boot.js"',html);self.assertIn('src="app.js"',html)
                client.request('GET','/api/learn',headers={'X-Token':server.TOKEN});response=client.getresponse();response.read();self.assertEqual(response.status,200)
                client.request('GET','/py/data/progress.db');response=client.getresponse();response.read();self.assertEqual(response.status,404)
            finally:client.close();app.shutdown();app.server_close();thread.join()

if __name__=='__main__':unittest.main()
