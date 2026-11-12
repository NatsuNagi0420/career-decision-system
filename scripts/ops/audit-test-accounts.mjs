/** 青穗集 · 测试账号只读盘点：只输出账号标识和数量，不读取正文、密码、密钥或文件内容。 */
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const identifier = value => '"' + value.replaceAll('"','""') + '"';
function hasTable(db, name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function count(db, table, where, params) {
  if (!hasTable(db, table)) return 0;
  return Number(db.prepare("SELECT count(*) AS n FROM " + identifier(table) + " WHERE " + where).get(...params).n);
}
export function auditAccounts({ relayDb, hubDb, usernames }) {
  const relay = new DatabaseSync(relayDb,{readOnly:true});
  let hub;
  try {
    hub = new DatabaseSync(hubDb,{readOnly:true});
    const rows = usernames.length ? usernames.flatMap(username => relay.prepare("SELECT id,username,status,created_at FROM relay_accounts WHERE username=?").all(username)) : relay.prepare("SELECT id,username,status,created_at FROM relay_accounts ORDER BY id").all();
    const tables = hub.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
    const owned = tables.filter(table=>hub.prepare("PRAGMA table_info("+identifier(table)+")").all().some(column=>column.name==='user_id'));
    return {
      read_only:true,
      accounts:rows.map(account=>{
        const links=hasTable(hub,"account_identities") ? hub.prepare("SELECT user_id,issuer FROM account_identities WHERE subject=? AND username=?").all(String(account.id),account.username) : [];
        const users=links.map(link=>{
          const userId=Number(link.user_id), ids=hasTable(hub,"conversations")?hub.prepare("SELECT id FROM conversations WHERE user_id=?").all(userId).map(row=>row.id):[];
          const dependent={};
          for(const table of ["messages","artifacts","events"]) if(ids.length) dependent[table]=count(hub,table,"conversation_id IN ("+ids.map(()=>"?").join(",")+")",ids); else dependent[table]=0;
          return {hub_user_id:userId,issuer:link.issuer,owned_rows:Object.fromEntries(owned.map(table=>[table,count(hub,table,'user_id=?',[userId])])),dependent_rows:dependent};
        });
        return {...account,active_tokens:count(relay,"access_tokens","account_id=? AND revoked=0",[account.id]),hub:users};
      }),
      unmatched:usernames.filter(username=>!rows.some(row=>row.username===username)),
      public_catalogue_jobs:count(hub,"catalogue_jobs","1=1",[]),
    };
  } finally { hub?.close(); relay.close(); }
}
function argumentsFor(argv) {
  const result={relayDb:"",hubDb:"",usernames:[]};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(!["--relay-db","--hub-db","--username"].includes(key)||!argv[i+1])throw Error("Usage: node audit-test-accounts.mjs --relay-db <relay.sqlite> --hub-db <agent.sqlite> [--username <exact-name>]...");
    const value=argv[++i];
    if(key==="--relay-db")result.relayDb=value;
    if(key==="--hub-db")result.hubDb=value;
    if(key==="--username")result.usernames.push(value);
  }
  if(!result.relayDb||!result.hubDb)throw Error("必须明确指定两个 SQLite 数据库路径；该工具不读取 .env，也不支持生产 PostgreSQL。");
  return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(auditAccounts(argumentsFor(process.argv.slice(2))),null,2));}
  catch(error){console.error(error instanceof Error?error.message:"只读盘点未完成");process.exitCode=1;}
}
