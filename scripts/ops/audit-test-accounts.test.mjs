/** 青穗集 · 测试账号盘点回归：只读、精确匹配与隐私隔离。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditAccounts } from './audit-test-accounts.mjs';
test('only enumerates the selected account and never changes either database',()=>{
  const dir=mkdtempSync(join(tmpdir(),'suinai-account-audit-')),relayDb=join(dir,'relay.sqlite'),hubDb=join(dir,'agent.sqlite');
  const relay=new DatabaseSync(relayDb),hub=new DatabaseSync(hubDb);
  relay.exec("CREATE TABLE relay_accounts(id INTEGER PRIMARY KEY,username TEXT,status TEXT,created_at TEXT,password_hash TEXT);CREATE TABLE access_tokens(account_id INTEGER,revoked INTEGER);INSERT INTO relay_accounts VALUES(3,'test_one','active','2026-10-30','NEVER_EXPOSE'),(4,'real_user','active','2026-10-30','PRIVATE');INSERT INTO access_tokens VALUES(3,0),(4,0);");
  hub.exec("CREATE TABLE users(id INTEGER PRIMARY KEY);CREATE TABLE account_identities(user_id INTEGER,subject TEXT,username TEXT,issuer TEXT,secret TEXT);CREATE TABLE conversations(id TEXT,user_id INTEGER);CREATE TABLE messages(conversation_id TEXT,content TEXT);CREATE TABLE memory_nodes(id TEXT,user_id INTEGER,data TEXT);CREATE TABLE catalogue_jobs(id TEXT);INSERT INTO users VALUES(8),(9);INSERT INTO account_identities VALUES(8,'3','test_one','https://api.suinai.me/v1','SECRET'),(9,'4','real_user','https://api.suinai.me/v1','PRIVATE');INSERT INTO conversations VALUES('c1',8);INSERT INTO messages VALUES('c1','PRIVATE MESSAGE');INSERT INTO memory_nodes VALUES('m1',8,'PRIVATE MEMORY');INSERT INTO catalogue_jobs VALUES('j1');");
  relay.close();hub.close();
  const report=auditAccounts({relayDb,hubDb,usernames:['test_one','missing']});
  assert.equal(report.read_only,true);assert.equal(report.accounts.length,1);assert.equal(report.accounts[0].hub[0].owned_rows.memory_nodes,1);assert.equal(report.accounts[0].hub[0].dependent_rows.messages,1);assert.deepEqual(report.unmatched,['missing']);assert.equal(report.public_catalogue_jobs,1);
  const text=JSON.stringify(report);for(const secret of ['NEVER_EXPOSE','SECRET','PRIVATE MESSAGE','PRIVATE MEMORY','real_user'])assert.ok(!text.includes(secret));
  const after=new DatabaseSync(hubDb,{readOnly:true});assert.equal(after.prepare('SELECT count(*) n FROM users').get().n,2);assert.equal(after.prepare('SELECT content FROM messages').get().content,'PRIVATE MESSAGE');after.close();
});
