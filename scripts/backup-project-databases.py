"""青穗集 · 迁移前完整备份项目数据库，保留可恢复SQL与带类型的历史归档，不删除任何库。"""
from pathlib import Path
from datetime import datetime,date,time,timedelta
from decimal import Decimal
import base64,gzip,hashlib,json,os,shutil,sqlite3,subprocess,sys
from urllib.parse import urlsplit,unquote

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'legacy/server-python/.venv/Lib/site-packages'))
from dotenv import dotenv_values
import pymysql

ALLOWED=('career_v2','career_decision_system','career_db','career_v2_test','career_v2_eval')
LOG=ROOT/'logs/database-consolidation-20261024'
BACKUP=ROOT/'backups/database-consolidation-20261024'
BACKUP.mkdir(parents=True,exist_ok=True)

def sha(data):return hashlib.sha256(data).hexdigest()
def encode(value):
 if isinstance(value,bytes):return {'$type':'bytes','base64':base64.b64encode(value).decode()}
 if isinstance(value,Decimal):return {'$type':'decimal','value':str(value)}
 if isinstance(value,(datetime,date,time)):return {'$type':type(value).__name__,'value':value.isoformat()}
 if isinstance(value,timedelta):return {'$type':'timedelta','microseconds':round(value.total_seconds()*1_000_000)}
 raise TypeError(type(value).__name__)
def dump(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),default=encode).encode()
def file_info(path):return {'file':str(path),'bytes':path.stat().st_size,'sha256':sha(path.read_bytes())}

def main():
 manifest={'started_at':datetime.now().astimezone().isoformat(),'mysql':{},'sqlite':{},'deleted_databases':[]}
 source=ROOT/'agent/var/agent.sqlite'; target=BACKUP/'agent-before.sqlite'
 if target.exists():raise ValueError('Backup exists; refuse overwrite')
 original=sqlite3.connect(source.as_uri()+'?mode=ro',uri=True,timeout=30)
 copy=sqlite3.connect(target)
 try:
  original.backup(copy,pages=256,sleep=0.05)
  if copy.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('sqlite backup invalid')
  names=[x[0] for x in copy.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
  counts={t:copy.execute('SELECT COUNT(*) FROM "'+t+'"').fetchone()[0] for t in names}
 finally:copy.close();original.close()
 manifest['sqlite']={**file_info(target),'integrity':'ok','table_counts':counts}
 settings={k.lower():v for k,v in dotenv_values(ROOT/'legacy/server-python/.env').items()}
 u=urlsplit(settings.get('db_url') or 'mysql+pymysql://root:root@127.0.0.1:3306/career_v2')
 credentials={'host':u.hostname or '127.0.0.1','port':u.port or 3306,'user':unquote(u.username or 'root'),'password':unquote(u.password or '')}
 conn=pymysql.connect(**credentials,charset='utf8mb4',connect_timeout=5,read_timeout=60,write_timeout=30,autocommit=False)
 cnf=BACKUP/'.temporary-mysqldump.cnf'
 try:
  def quote(value):return '"'+str(value).replace('\\','\\\\').replace('"','\\"').replace('\n','\\n').replace('\r','\\r')+'"'
  with cnf.open('x',encoding='utf-8') as f:
   f.write('[client]\n'+''.join(k+'='+quote(v)+'\n' for k,v in credentials.items()))
  with conn.cursor() as c:
   c.execute('SET SESSION TRANSACTION READ ONLY')
   c.execute('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ')
   c.execute('START TRANSACTION WITH CONSISTENT SNAPSHOT')
   c.execute('SHOW DATABASES'); available={row[0] for row in c.fetchall()}
   for name in ALLOWED:
    if name not in available:continue
    output=BACKUP/(name+'.sql.gz')
    if output.exists():raise ValueError('SQL backup exists; refuse overwrite')
    args=[shutil.which('mysqldump') or r'D:\IDE\MySQL\8.0.12\bin\mysqldump.exe','--defaults-extra-file='+str(cnf),'--single-transaction','--routines','--events','--triggers','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--column-statistics=0','--databases',name]
    with gzip.open(output,'wb') as out:
     process=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=0x08000000 if os.name=='nt' else 0)
     shutil.copyfileobj(process.stdout,out)
     _,err=process.communicate()
    if process.returncode:raise RuntimeError('mysqldump failed; exit='+str(process.returncode))
    with gzip.open(output,'rb') as f:sql=f.read()
    if b'Dump completed on' not in sql:raise ValueError('SQL dump missing completion marker')
    c.execute('SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s ORDER BY TABLE_NAME',(name,))
    tables=c.fetchall(); archived=[]
    for table,tabletype in tables:
     if not table.replace('_','').isalnum():raise ValueError('Unsafe table identifier')
     c.execute(f'SHOW CREATE TABLE `{name}`.`{table}`'); ddl=c.fetchone()[1]
     c.execute('SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s AND CONSTRAINT_NAME=%s ORDER BY ORDINAL_POSITION',(name,table,'PRIMARY')); pk=[x[0] for x in c.fetchall()]
     order=' ORDER BY '+','.join('`'+x+'`' for x in pk) if pk else ''
     c.execute(f'SELECT * FROM `{name}`.`{table}`'+order); columns=[x[0] for x in c.description]; values=c.fetchall()
     if not pk:values=sorted(values,key=dump)
     row_bytes=dump(values)
     archived.append({'table':table,'table_type':tabletype,'create_sql':ddl,'columns':columns,'primary_key':pk,'rows':json.loads(row_bytes),'row_count':len(values),'rows_sha256':sha(row_bytes)})
    archive={'schema_version':1,'database':name,'purpose':'retired_history_not_active_accounts','tables':archived}
    typed=BACKUP/(name+'.archive.json.gz')
    with gzip.open(typed,'wb') as f:f.write(dump(archive))
    with gzip.open(typed,'rb') as f:check=json.load(f)
    for t in check['tables']:
     if len(t['rows'])!=t['row_count'] or sha(dump(t['rows']))!=t['rows_sha256']:raise ValueError('Archive roundtrip mismatch')
    manifest['mysql'][name]={'sql_backup':file_info(output),'typed_archive':file_info(typed),'tables':{t['table']:t['row_count'] for t in archived},'typed_roundtrip_verified':True,'live_restore_tested':False}
    print(json.dumps({'backed_up':name,'tables':len(tables),'rows':sum(t['row_count'] for t in archived),'verified':True},ensure_ascii=False),flush=True)
  conn.rollback()
 finally:
  conn.close()
  if cnf.exists():cnf.unlink()
 manifest['completed_at']=datetime.now().astimezone().isoformat()
 (BACKUP/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf-8')
 (LOG/'backup-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf-8')
 print(json.dumps({'backup_directory':str(BACKUP),'mysql_backups':len(manifest['mysql']),'sqlite_backup_integrity':'ok','deleted_databases':[]},ensure_ascii=False))

if __name__=='__main__':main()

