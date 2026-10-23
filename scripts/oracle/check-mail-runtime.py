#!/usr/bin/env python3
"""Read-only production Stalwart diagnostic. Never print secrets or response bodies."""
import json
import os
import subprocess
import urllib.error
import urllib.request
from urllib.parse import urlsplit

def output(label, value):
    print(f"{label}: {value}", flush=True)

def request(url, key, method='GET', body=None):
    headers = {'Authorization': 'Bearer ' + key, 'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, headers=headers, method=method, data=body)
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            return res.status, json.loads(res.read(1024 * 1024))
    except urllib.error.HTTPError as exc:
        return exc.code, None
    except Exception as exc:
        output('Transport error class', type(exc).__name__)
        return None, None

pid = subprocess.check_output(['systemctl','show','metadrive-api.service','--property=MainPID','--value'],text=True).strip()
if not pid.isdigit() or int(pid) < 1:
    raise SystemExit('API service has no running MainPID')
env = {}
with open(f'/proc/{pid}/environ','rb') as handle:
    for item in handle.read().split(b'\0'):
        if b'=' in item:
            k,v = item.split(b'=',1)
            if k in (b'STALWART_API_KEY',b'STALWART_BASE_URL',b'STALWART_ALLOWED_DOMAINS'):
                env[k.decode()] = v.decode(errors='replace')
# Drop elevated privileges immediately after reading the live process environment.
# All JMAP network requests run as the original unprivileged runner identity.
uid = int(os.environ.get('SUDO_UID', '-1'))
gid = int(os.environ.get('SUDO_GID', '-1'))
if uid <= 0 or gid <= 0:
    raise SystemExit('Refusing to diagnose without an unprivileged invoking identity')
os.setgroups([])
os.setgid(gid)
os.setuid(uid)
if os.geteuid() != uid:
    raise SystemExit('Failed to drop elevated privileges')

key = env.get('STALWART_API_KEY', '')
url = env.get('STALWART_BASE_URL', '')
output('Running process key loaded', bool(key))
output('Running process base URL set', bool(url))
output('API service active', subprocess.run(['systemctl','is-active','--quiet','metadrive-api.service']).returncode == 0)
if not url or not key:
    raise SystemExit('Missing live configuration')
parsed = urlsplit(url)
if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1','localhost','::1'):
    raise SystemExit('Diagnostic refuses non-loopback or non-HTTP Stalwart destination')
base = f"{parsed.scheme}://{parsed.netloc}"
output('Loopback Stalwart port', parsed.port)
status,session = request(base+'/.well-known/jmap',key)
output('JMAP session HTTP', status)
if isinstance(session,dict):
    advertised = session.get('apiUrl','')
    output('Advertised JMAP pathname', urlsplit(advertised).path if isinstance(advertised,str) else 'invalid')
for path in ('/jmap', '/jmap/'):
    for name,args in (('x:Domain/query',{'filter':{},'limit':200}),):
        payload = json.dumps({'using':['urn:ietf:params:jmap:core','urn:stalwart:jmap'],
            'methodCalls':[[name,args,'diag-1']]}).encode()
        status,data = request(base+path,key,'POST',payload)
        output(f'{path} {name} HTTP',status)
        if isinstance(data,dict):
            responses = data.get('methodResponses', [])
            if responses and isinstance(responses[0],list):
                result = responses[0]
                output(f'{path} method', result[0])
                if result[0]=='error' and isinstance(result[1],dict):
                    output(f'{path} JMAP error type',str(result[1].get('type','unknown'))[:100])
                if result[0]==name and isinstance(result[1],dict):
                    ids=result[1].get('ids',[])
                    output(f'{path} Domain query count',len(ids) if isinstance(ids,list) else 'invalid')
                    if isinstance(ids,list) and ids:
                        get_body = json.dumps({'using':['urn:ietf:params:jmap:core','urn:stalwart:jmap'],
                            'methodCalls':[['x:Domain/get',{'ids':ids[:10]},'diag-2']]}).encode()
                        get_status,got=request(base+path,key,'POST',get_body)
                        output(f'{path} x:Domain/get HTTP',get_status)
                        if isinstance(got,dict):
                            res=got.get('methodResponses',[])
                            if res and isinstance(res[0],list):
                                output(f'{path} x:Domain/get method',res[0][0])
                                if res[0][0]=='error' and isinstance(res[0][1],dict):
                                    output(f'{path} x:Domain/get error type',str(res[0][1].get('type','unknown'))[:100])
output('Diagnostic', 'finished (read-only)')
