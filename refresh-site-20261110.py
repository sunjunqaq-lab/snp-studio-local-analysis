"""Refresh only SNP website static routing. Keep all model files and APIs."""
import argparse, ast, hashlib, http.server, json, os, signal, socket, subprocess, tempfile, threading, time, urllib.request
from functools import partial
from pathlib import Path

ROOT=Path('/home/hnadmin/data/syj/snp-studio-20261018')
SERVER=Path('/home/hnadmin/data/syj/cattle-api-20261109-full10/server.py')
PYTHON='/home/hnadmin/data/anaconda3/bin/python3'
CONFIG='/home/hnadmin/data/syj/cattle-api-20261108-6d647cafa9/config.json'
BEFORE='e70202e37266f1ffc2e5a12cd31015c4934274d00580e79f5fcd0bc28b62ceb9'
AFTER='413bd565012976433b5962c795234fda791ac4833f321db1fa959accc667429f'
OLD=b'directory=str(Path(args.static).resolve())'
NEW=b'directory=os.path.abspath(args.static)'
ENV=dict(os.environ,PYTHONPATH='/home/hnadmin/data/syj/cattle-api-20261108-6d647cafa9/deps',PYTHONNOUSERSITE='1',OMP_NUM_THREADS='2',OPENBLAS_NUM_THREADS='2')

def fetch(port,path):
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open('http://127.0.0.1:'+str(port)+path,timeout=3) as response:
        return response.read(2*1024*1024)

def check(port):
    try:
        models=json.loads(fetch(port,'/api/cattle/models'))
        return models.get('ready') and len(models.get('models',[]))==41 and b'CattleInput' in fetch(port,'/cattle-input.js')
    except Exception:
        return False

def dynamic_directory_test():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_): pass
    with tempfile.TemporaryDirectory(prefix='snp-static-check-') as temp:
        root=Path(temp);a=root/'a';b=root/'b';a.mkdir();b.mkdir()
        (a/'probe.txt').write_text('A');(b/'probe.txt').write_text('B')
        current=root/'current';current.symlink_to(a,target_is_directory=True)
        httpd=http.server.ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=os.path.abspath(current)))
        thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
        try:
            assert fetch(httpd.server_port,'/probe.txt')==b'A'
            current.unlink();current.symlink_to(b,target_is_directory=True)
            assert fetch(httpd.server_port,'/probe.txt')==b'B'
        finally:
            httpd.shutdown();httpd.server_close();thread.join()

def start(port,record):
    command=[PYTHON,str(SERVER),'--static',str(ROOT/'current'),'--config',CONFIG,'--port',str(port),'--instance-root',str(ROOT)]
    if record:command.append('--record-state')
    with (SERVER.parent/'live-static-20261110.log').open('ab') as log:
        return subprocess.Popen(command,env=ENV,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)

def wait(port,child):
    for _ in range(60):
        if check(port):return True
        if child.poll() is not None:return False
        time.sleep(.5)
    return False

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--activate',action='store_true');args=parser.parse_args()
    if not args.activate:raise RuntimeError('Use --activate to apply this reviewed static-routing fix.')
    for path in [SERVER,Path(PYTHON),Path(CONFIG),ROOT/'current/cattle-input.js']:
        if not path.is_file():raise RuntimeError('Required file missing: '+str(path)+'; service unchanged.')
    source=SERVER.read_bytes();digest=hashlib.sha256(source).hexdigest()
    if digest not in (BEFORE,AFTER):raise RuntimeError('Server source changed unexpectedly; no files or services changed.')
    state=json.loads((ROOT/'.runtime/server.json').read_text());port=int(state['port']);pid=int(state['pid'])
    if port!=8080:raise RuntimeError('Expected existing website port 8080; no change.')
    command=(Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0')
    if str(SERVER).encode() not in command:raise RuntimeError('Recorded PID is not this model service; no process stopped.')
    dynamic_directory_test()
    if digest==AFTER and check(port):
        print(json.dumps(dict(already_active=True,port=port,models_available=41)));return
    changed=source.replace(OLD,NEW,1) if digest==BEFORE else source
    ast.parse(changed.decode('utf-8'));assert hashlib.sha256(changed).hexdigest()==AFTER
    backup=SERVER.with_name('server.before-live-static-20261110.py')
    if not backup.exists():backup.write_bytes(source)
    elif hashlib.sha256(backup.read_bytes()).hexdigest()!=BEFORE:raise RuntimeError('Backup differs; no service changed.')
    SERVER.write_bytes(changed)
    probe=None;live=None;stopped=False
    try:
        for probe_port in range(8081,8102):
            with socket.socket() as sock:
                if sock.connect_ex(('127.0.0.1',probe_port))!=0:break
        else:raise RuntimeError('No free probe port.')
        probe=start(probe_port,False)
        if not wait(probe_port,probe):raise RuntimeError('New service probe failed; see live-static-20261110.log.')
        probe.terminate();probe.wait(timeout=10);probe=None
        # Recheck process ownership immediately before stopping only this website.
        if (Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0')!=command:raise RuntimeError('PID changed during preflight.')
        os.kill(pid,signal.SIGTERM);stopped=True
        for _ in range(30):
            with socket.socket() as sock:
                if sock.connect_ex(('127.0.0.1',port))!=0:break
            time.sleep(.2)
        else:raise RuntimeError('Original website did not release its port.')
        live=start(port,True)
        if not wait(port,live):raise RuntimeError('Website activation failed.')
        receipt=dict(activated=True,port=port,pid=live.pid,live_static_symlink=True,models_available=41,source_sha256=AFTER,model_weights_changed=False,private_genotypes_uploaded=False,static_release=(ROOT/'current').resolve().name)
        (SERVER.parent/'live-static-20261110.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
        print(json.dumps(receipt,indent=2))
    except Exception:
        if probe and probe.poll() is None:probe.terminate()
        if live and live.poll() is None:live.terminate();live.wait(timeout=10)
        SERVER.write_bytes(source)
        if stopped:start(port,True)
        raise

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps(dict(activated=False,error=str(error))));raise SystemExit(1)
