import express from 'express';import cookie from 'cookie-parser';import pg from 'pg';import bcrypt from 'bcryptjs';import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';import multer from 'multer';import pdf from 'pdf-parse';import mammoth from 'mammoth';import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';import fs from 'fs';import dns from 'dns/promises';import net from 'net';import {fileURLToPath} from 'url';import path from 'path';
const E=process.env,db=new pg.Pool({connectionString:E.DATABASE_URL}),q=(s,a)=>db.query(s,a).then(r=>r.rows),MODEL=E.CLAUDE_MODEL||'claude-sonnet-5-5';
const EK=(()=>{const k=String(E.KEY_ENC||'').trim();if(/^[0-9a-fA-F]{64}$/.test(k))return Buffer.from(k,'hex');try{const b=Buffer.from(k,'base64');if(b.length===32)return b}catch{}throw new Error('KEY_ENC must decode to exactly 32 bytes (64 hex characters or base64)');})();
const seal=x=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',EK,iv),d=Buffer.concat([c.update(x,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),d]).toString('base64')};
const unseal=x=>{const b=Buffer.from(x,'base64'),d=crypto.createDecipheriv('aes-256-gcm',EK,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')};
const clientFor=async uid=>{const [u]=await q('SELECT api_key_enc FROM users WHERE id=$1',[uid]);if(u&&u.api_key_enc)return new Anthropic({apiKey:unseal(u.api_key_enc)});if(E.ALLOW_SERVER_KEY=='1'&&E.ANTHROPIC_API_KEY)return new Anthropic({apiKey:E.ANTHROPIC_API_KEY});throw new Error('no_api_key')};
const up=multer({storage:multer.memoryStorage(),limits:{fileSize:50e6}}),app=express(),mail=nodemailer.createTransport(E.SMTP_URL||{jsonTransport:true});
app.use(express.json({limit:'2mb'}),cookie());const A=fn=>(a,b,c)=>fn(a,b,c).catch(e=>{const nk=e.message=='no_api_key'||e.status==401;if(!nk)console.error(e);b.status(nk?402:500).json({error:nk?'no_api_key':'server_error'})});
const SYM='!@$*+=~',rid=n=>{const S=['abcdefghjkmnpqrstuvwxyz','ABCDEFGHJKLMNPQRSTUVWXYZ','23456789',SYM];return [...Array(n)].map((_,i)=>{const s=i<4?S[i]:S[crypto.randomInt(4)];return s[crypto.randomInt(s.length)]}).sort(()=>crypto.randomInt(3)-1).join('')};
const pub=u=>({id:u.id,email:u.email,name:u.name,dob:u.dob,country:u.country,phone:u.phone,photo:u.photo});
const login=(res,u)=>{res.cookie('t',jwt.sign({id:u.id},E.JWT_SECRET,{expiresIn:'30d'}),{httpOnly:true,sameSite:'lax',secure:E.NODE_ENV=='production'});res.json({user:{...pub(u),hasKey:!!u.api_key_enc,last4:u.key_last4}})};
const auth=(req,res,next)=>{try{req.uid=jwt.verify(req.cookies.t,E.JWT_SECRET).id;next()}catch{res.status(401).json({error:'auth'})}};
app.get('/api/health',(_,r)=>r.json({ok:1}));
app.post('/api/auth/signup',A(async(req,res)=>{const{email,password,name}=req.body;if(!email||!name||(password||'').length<8)return res.status(400).json({error:'invalid'});
 const [u]=await q('INSERT INTO users(email,name,pw) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',[email.toLowerCase(),name,await bcrypt.hash(password,12)]);u?login(res,u):res.status(409).json({error:'exists'})}));
app.post('/api/auth/login',A(async(req,res)=>{const [u]=await q('SELECT * FROM users WHERE email=$1',[(req.body.email||'').toLowerCase()]);u&&await bcrypt.compare(req.body.password||'',u.pw)?login(res,u):res.status(401).json({error:'bad_credentials'})}));
app.post('/api/auth/otp',A(async(req,res)=>{const [u]=await q('SELECT * FROM users WHERE email=$1 AND dob=$2',[(req.body.email||'').toLowerCase(),req.body.dob]);if(!u)return res.status(404).json({error:'no_match'});
 const otp=String(crypto.randomInt(1e5,1e6));await q('UPDATE users SET otp_hash=$1,otp_exp=now()+interval \'10 minutes\' WHERE id=$2',[await bcrypt.hash(otp,8),u.id]);
 await mail.sendMail({from:E.MAIL_FROM,to:u.email,subject:'Your Learn&Share code',text:`Your 6-digit code is ${otp}. It expires in 10 minutes.`});res.json({ok:1})}));
app.post('/api/auth/reset',A(async(req,res)=>{const{email,otp,password}=req.body,[u]=await q('SELECT * FROM users WHERE email=$1 AND otp_exp>now()',[(email||'').toLowerCase()]);
 if(!u||(password||'').length<8||!await bcrypt.compare(otp||'',u.otp_hash||''))return res.status(400).json({error:'invalid'});await q('UPDATE users SET pw=$1,otp_hash=NULL WHERE id=$2',[await bcrypt.hash(password,12),u.id]);res.json({ok:1})}));
app.put('/api/me',auth,A(async(req,res)=>{const b=req.body;await q('UPDATE users SET name=$1,dob=$2,country=$3,phone=$4,photo=$5,lang=$6,theme=$7 WHERE id=$8',[b.name,b.dob||null,b.country,b.phone,b.photo,b.lang,b.theme,req.uid]);res.json({ok:1})}));
// ---- spaces
app.post('/api/spaces',auth,A(async(req,res)=>{const{name,password}=req.body;if(!name||(password||'').length<4)return res.status(400).json({error:'invalid'});const id=rid(10);await q('INSERT INTO spaces(id,owner,name,pw) VALUES($1,$2,$3,$4)',[id,req.uid,name,await bcrypt.hash(password,10)]);res.json({id,name})}));
app.get('/api/spaces',auth,A(async(req,res)=>res.json(await q('SELECT id,name,created,(SELECT count(*)::int FROM sources WHERE space=spaces.id) ns,(SELECT count(*)::int FROM outputs WHERE space=spaces.id) no FROM spaces WHERE owner=$1 ORDER BY created DESC',[req.uid]))));
app.post('/api/spaces/:id/unlock',auth,A(async(req,res)=>{const [s]=await q('SELECT * FROM spaces WHERE id=$1 AND owner=$2',[req.params.id,req.uid]);if(!s||!await bcrypt.compare(req.body.password||'',s.pw))return res.status(403).json({error:'wrong_password'});res.json({token:jwt.sign({space:s.id,uid:req.uid},E.JWT_SECRET,{expiresIn:'8h'})})}));
const unlock=(req,res,next)=>{try{const t=jwt.verify(req.get('x-space-token'),E.JWT_SECRET);if(t.space!=req.params.id||t.uid!=req.uid)throw 0;next()}catch{res.status(403).json({error:'locked'})}};
const ask=async(content,max=8000,uid)=>(await (await clientFor(uid)).messages.create({model:MODEL,max_tokens:max,messages:[{role:'user',content}]})).content.map(b=>b.text||'').join('');
const json=t=>JSON.parse(t.slice(t.indexOf('{'),t.lastIndexOf('}')+1));
async function transcribe(buf,name,type){if(!E.TRANSCRIBE_URL)throw new Error('transcription_not_configured');const fd=new FormData();fd.append('file',new Blob([buf],{type}),name);fd.append('model','whisper-1');const r=await fetch(E.TRANSCRIBE_URL,{method:'POST',headers:{authorization:'Bearer '+E.TRANSCRIBE_KEY},body:fd});if(!r.ok)throw new Error('transcribe_failed');return (await r.json()).text}
async function extract(f,uid){const n=f.originalname.toLowerCase(),t=f.mimetype;
 if(n.endsWith('.pdf')){const d=await pdf(f.buffer);if(d.text.trim().length>50)return d.text;return ask([{type:'document',source:{type:'base64',media_type:'application/pdf',data:f.buffer.toString('base64')}},{type:'text',text:'Transcribe all text in this scanned document (OCR), and describe figures.'}],8000,uid)}
 if(n.endsWith('.docx'))return (await mammoth.extractRawText({buffer:f.buffer})).value;
 if(t.startsWith('image/'))return ask([{type:'image',source:{type:'base64',media_type:t,data:f.buffer.toString('base64')}},{type:'text',text:'OCR all text and describe any diagrams or charts in detail, for study use.'}],8000,uid);
 if(/^(audio|video)\//.test(t))return transcribe(f.buffer,f.originalname,t);
 return f.buffer.toString('utf8')}
async function safeFetch(u){const h=new URL(u);if(!/^https?:$/.test(h.protocol))throw new Error('bad_url');const ips=await dns.lookup(h.hostname,{all:true});
 if(ips.some(i=>net.isIP(i.address)&&/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1|f[cd])/i.test(i.address)))throw new Error('blocked');
 const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(15000)});return (await r.text()).replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')}
app.get('/api/fetch-url',auth,A(async(req,res)=>{try{res.json({text:(await safeFetch(String(req.query.url))).slice(0,60000)})}catch{res.status(400).json({error:'fetch_failed'})}}));
app.post('/api/transcribe',auth,up.single('file'),A(async(req,res)=>{try{res.json({text:await transcribe(req.file.buffer,req.file.originalname,req.file.mimetype)})}catch(e){res.status(501).json({error:e.message})}}));
app.post('/api/spaces/:id/sources',auth,unlock,up.single('file'),A(async(req,res)=>{if(!req.body.trusted)await clientFor(req.uid);let name,raw;if(req.file){name=req.file.originalname;raw=await extract(req.file,req.uid)}else if(req.body.url){name=req.body.url;raw=await safeFetch(req.body.url)}else{name=req.body.name;raw=req.body.text}
 if(!raw||raw.trim().length<20)return res.status(422).json({error:'no_text'});raw=raw.slice(0,200000);
 if(req.body.trusted){const [c]=await q('INSERT INTO sources(space,name,raw,clean,keep,note) VALUES($1,$2,$3,$3,true,$4) RETURNING id,name,keep,note',[req.params.id,name,raw,'Copied from a shared space']);return res.json(c)}
 const r=json(await ask(`You curate study material. Return only JSON {"keep":boolean,"note":"one short sentence","cleaned":"learning-relevant content, cleaned and structured"}.\n\nSOURCE ${name}:\n${raw.slice(0,60000)}`,6000,req.uid));
 const [s]=await q('INSERT INTO sources(space,name,raw,clean,keep,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,keep,note',[req.params.id,name,raw,r.cleaned||raw,!!r.keep,r.note]);res.json(s)}));
app.get('/api/spaces/:id/sources',auth,unlock,A(async(req,res)=>res.json(await q('SELECT id,name,keep,note'+(req.query.full?',clean':'')+' FROM sources WHERE space=$1 ORDER BY id',[req.params.id]))));
app.post('/api/spaces/:id/sources/:sid/keep',auth,unlock,A(async(req,res)=>{await q('UPDATE sources SET keep=true,clean=raw WHERE id=$1 AND space=$2',[req.params.sid,req.params.id]);res.json({ok:1})}));
const SCH={mindmap:'{"root":string,"children":[{"t":string,"children":[...]}]}',video:'{"title":string,"scenes":[{"visual":string,"narration":string,"seconds":number,"svg":"flat SVG illustration for the scene, viewBox 0 0 960 540, no scripts, no text"}]}',podcast:'{"title":string,"lines":[{"voice":number,"text":string}]}',quiz:'{"title":string,"questions":[{"q":string,"options":[4 strings],"answer":0-3,"why":string}]}',ppt:'{"title":string,"slides":[{"title":string,"bullets":[string],"svg":"simple flat SVG illustration, viewBox 0 0 400 240, no scripts"}]}',summary:'{"title":string,"text":string}'};
app.post('/api/spaces/:id/generate',auth,unlock,A(async(req,res)=>{const{feature,options={},language='English',focus='',sourceIds=[]}=req.body;if(!SCH[feature]||!sourceIds.length)return res.status(400).json({error:'invalid'});await clientFor(req.uid);
 if(feature=='podcast'&&options.Format=='Debate'&&+options.Voices<2)return res.status(400).json({error:'debate_needs_2_voices'});
 const src=await q('SELECT name,clean FROM sources WHERE space=$1 AND keep AND id=ANY($2)',[req.params.id,sourceIds]),[job]=await q('INSERT INTO jobs(space) VALUES($1) RETURNING id',[req.params.id]);res.json({job:job.id});
 const extra=feature=='video'?` Scene durations must add up to the requested duration (Short about 1 minute, Medium about 3, Long about 6, Custom as given), with at most 20 scenes. Illustration style: ${options.Type=='Animation'?'cartoon animation':'realistic, natural colours'}.`:'',sch=feature=='ppt'&&options.Images!='Add images'?'{"title":string,"slides":[{"title":string,"bullets":[string]}]}':SCH[feature];
 try{const d=json(await ask(`You are an expert learning-material designer. Using ONLY the sources, create a ${feature}. Settings: ${JSON.stringify(options)}. Language: ${language}. Areas to focus: ${focus||'none'}. Where a setting is "Default", choose what suits the sources and other settings. ${extra} Return only JSON like ${sch}.\n\n`+src.map(s=>`SOURCE ${s.name}:\n${s.clean.slice(0,30000)}`).join('\n\n'),16000,req.uid));
  d._opts=options;const [o]=await q('INSERT INTO outputs(space,feature,title,data,lang) VALUES($1,$2,$3,$4,$5) RETURNING id',[req.params.id,feature,d.title||d.root,d,language]);await q("UPDATE jobs SET status='done',output=$1 WHERE id=$2",[o.id,job.id])}catch(e){await q("UPDATE jobs SET status='failed',error=$1 WHERE id=$2",[e.message,job.id])}}));
app.get('/api/jobs/:jid',auth,A(async(req,res)=>res.json((await q('SELECT j.* FROM jobs j JOIN spaces s ON s.id=j.space WHERE j.id=$1 AND s.owner=$2',[req.params.jid,req.uid]))[0]||{})));
app.get('/api/spaces/:id/outputs',auth,unlock,A(async(req,res)=>res.json(await q('SELECT * FROM outputs WHERE space=$1 ORDER BY created DESC',[req.params.id]))));
// ---- groups
app.post('/api/groups',auth,A(async(req,res)=>{const{name,password}=req.body;if(!name||(password||'').length<8)return res.status(400).json({error:'invalid'});const id=rid(15);await q('INSERT INTO groups(id,name,pw) VALUES($1,$2,$3)',[id,name,await bcrypt.hash(password,10)]);await q('INSERT INTO members(grp,uid) VALUES($1,$2)',[id,req.uid]);res.json({id,name})}));
app.post('/api/groups/join',auth,A(async(req,res)=>{const [g]=await q('SELECT * FROM groups WHERE id=$1',[req.body.id]);if(!g||!await bcrypt.compare(req.body.password||'',g.pw))return res.status(403).json({error:'bad_credentials'});await q('INSERT INTO members(grp,uid) VALUES($1,$2) ON CONFLICT DO NOTHING',[g.id,req.uid]);res.json({id:g.id,name:g.name})}));
app.get('/api/groups',auth,A(async(req,res)=>res.json(await q('SELECT g.id,g.name,m.joined FROM groups g JOIN members m ON m.grp=g.id WHERE m.uid=$1',[req.uid]))));
app.get('/api/groups/:id/messages',auth,A(async(req,res)=>res.json(await q('SELECT x.id,u.name,x.uid,x.kind,x.body,x.file_name,x.file_type,x.space,x.ts FROM messages x JOIN members m ON m.grp=x.grp AND m.uid=$2 JOIN users u ON u.id=x.uid WHERE x.grp=$1 AND x.ts>=m.joined AND x.id>$3 ORDER BY x.id',[req.params.id,req.uid,+req.query.after||0]))));
app.post('/api/groups/:id/messages',auth,up.single('file'),A(async(req,res)=>{if(!(await q('SELECT 1 FROM members WHERE grp=$1 AND uid=$2',[req.params.id,req.uid])).length)return res.status(403).json({error:'not_member'});const f=req.file,b=req.body;
 await q('INSERT INTO messages(grp,uid,kind,body,file_name,file_type,file_data,space) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[req.params.id,req.uid,f?'file':b.space?'space':'text',b.text,f?.originalname,f?.mimetype,f?.buffer,b.space||null]);res.json({ok:1})}));
app.get('/api/messages/:mid/file',auth,A(async(req,res)=>{const [m]=await q('SELECT x.* FROM messages x JOIN members k ON k.grp=x.grp AND k.uid=$2 WHERE x.id=$1 AND x.ts>=k.joined',[req.params.mid,req.uid]);if(!m?.file_data)return res.sendStatus(404);res.type(m.file_type).set('content-disposition','attachment; filename="'+encodeURIComponent(m.file_name)+'"').send(m.file_data)}));
app.get('/api/me',auth,A(async(req,res)=>{const [u]=await q('SELECT * FROM users WHERE id=$1',[req.uid]);u?res.json({...pub(u),lang:u.lang,theme:u.theme,hasKey:!!u.api_key_enc,last4:u.key_last4}):res.status(401).json({error:'auth'})}));
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('t');res.json({ok:1})});
app.delete('/api/spaces/:id/sources/:sid',auth,unlock,A(async(req,res)=>{await q('DELETE FROM sources WHERE id=$1 AND space=$2',[req.params.sid,req.params.id]);res.json({ok:1})}));
app.delete('/api/spaces/:id/outputs/:oid',auth,unlock,A(async(req,res)=>{await q('DELETE FROM outputs WHERE id=$1 AND space=$2',[req.params.oid,req.params.id]);res.json({ok:1})}));
app.put('/api/me/key',auth,A(async(req,res)=>{const k=String(req.body.key||'').trim();if(!/^sk-ant-[\w-]{20,}$/.test(k))return res.status(400).json({error:'bad_key'});
 try{await new Anthropic({apiKey:k}).messages.create({model:MODEL,max_tokens:1,messages:[{role:'user',content:'hi'}]})}catch(e){return res.status(e.status==401?400:502).json({error:'key_rejected'})}
 await q('UPDATE users SET api_key_enc=$1,key_last4=$2 WHERE id=$3',[seal(k),k.slice(-4),req.uid]);res.json({ok:1,last4:k.slice(-4)})}));
app.delete('/api/me/key',auth,A(async(req,res)=>{await q('UPDATE users SET api_key_enc=NULL,key_last4=NULL WHERE id=$1',[req.uid]);res.json({ok:1})}));
app.use(express.static(path.dirname(fileURLToPath(import.meta.url))+'/public'));

async function initDatabase(){
  const schemaPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'schema.sql');
  const sql=fs.readFileSync(schemaPath,'utf8').replace(/--.*$/gm,'');
  await db.query(sql);
}
const port=Number(E.PORT||10000);
initDatabase().then(()=>app.listen(port,'0.0.0.0',()=>console.log('Learn&Share on :'+port)))
  .catch(e=>{console.error('Database initialization failed',e);process.exit(1)});

