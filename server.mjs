import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const PUBLIC_DIR=path.join(__dirname,'public');
const PORT=Number(process.env.PORT||3000);
const PUBLIC_URL=String(process.env.PUBLIC_URL||'https://before-you.onrender.com').replace(/\/$/,'');
const TRACE_TTL_MS=24*60*60*1000;
const MAX_MESSAGE_LENGTH=10000;
const BODY_LIMIT=18*1024;

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SB_PUBLIC=String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'');
const SB_SECRET=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'');
const ADMIN_EMAIL=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const ADMIN_EMAILS=new Set([ADMIN_EMAIL,...String(process.env.ADMIN_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean)]);
const HAS_SUPABASE=Boolean(SUPABASE_URL&&SB_PUBLIC&&SB_SECRET);

const MIME={
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.mp3':'audio/mpeg','.svg':'image/svg+xml','.ico':'image/x-icon',
  '.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'
};
const metaByRoute={
  '/':{title:'BEFORE YOU — abandoned material',description:'BEFORE YOU is an abandoned-looking corner of the internet where strangers leave things for the next stranger.'},
  '/found':{title:'FOUND — BEFORE YOU',description:'Something a stranger left behind. Read it as it is, then decide what comes next.'},
  '/leave':{title:'LEAVE — BEFORE YOU',description:'Leave a plain-text note for a new stranger. No name. No reply.'}
};

const cooldowns=new Map();

function securityHeaders(){
  const connect=HAS_SUPABASE?`'self' https://nominatim.openstreetmap.org ${SUPABASE_URL}`:"'self' https://nominatim.openstreetmap.org";
  return {
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin','X-DNS-Prefetch-Control':'off',
    'Permissions-Policy':'geolocation=(self), microphone=(), camera=(), payment=(), usb=()',
    'Content-Security-Policy':`default-src 'self'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; media-src 'self'; img-src 'self' data:; font-src 'self'; connect-src ${connect}`
  };
}
function json(res,status,payload,extra={}){const body=JSON.stringify(payload);res.writeHead(status,{...securityHeaders(),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body),...extra});res.end(body);}
async function readBody(req){return new Promise((resolve,reject)=>{let raw='';let size=0;req.setEncoding('utf8');req.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>BODY_LIMIT){reject(Object.assign(new Error('too large'),{code:'PAYLOAD_TOO_LARGE'}));req.destroy();return;}raw+=chunk;});req.on('end',()=>resolve(raw));req.on('error',reject);});}
function normalizeIp(value){
  let ip=String(value||'').trim();
  if(!ip) return 'UNKNOWN';
  if(ip.startsWith('[') && ip.includes(']')) ip=ip.slice(1,ip.indexOf(']'));
  if(ip.startsWith('::ffff:')) ip=ip.slice(7);
  const portMatch=ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if(portMatch) ip=portMatch[1];
  return ip || 'UNKNOWN';
}
function ipOf(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',').map(v=>normalizeIp(v)).filter(Boolean);
  if(forwarded.length && forwarded[0]!=='UNKNOWN') return forwarded[0];
  for(const key of ['cf-connecting-ip','true-client-ip','x-real-ip']){
    const candidate=normalizeIp(req.headers[key]);
    if(candidate!=='UNKNOWN') return candidate;
  }
  return normalizeIp(req.socket.remoteAddress||'UNKNOWN');
}
function isPrivateIp(ip){
  if(ip==='UNKNOWN'||ip==='127.0.0.1'||ip==='::1') return true;
  if(/^10\./.test(ip)||/^192\.168\./.test(ip)||/^169\.254\./.test(ip)) return true;
  const m=ip.match(/^172\.(\d+)\./); if(m){const n=Number(m[1]);if(n>=16&&n<=31)return true;}
  if(ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:')) return true;
  return false;
}
function requesterKey(req){return crypto.createHash('sha256').update(`${ipOf(req)}|${String(req.headers['user-agent']||'').slice(0,180)}`).digest('hex');}
function sanitiseMessage(v){if(typeof v!=='string')return null;const s=v.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim();if(!s||s.length>MAX_MESSAGE_LENGTH)return null;if(/https?:\/\//i.test(s)||/www\./i.test(s))return null;return s;}

async function ipRegion(req){
  const ip=ipOf(req);
  if(isPrivateIp(ip)) return 'UNKNOWN';
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3500);
  try{
    const r=await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`,{signal:controller.signal,headers:{'User-Agent':'BEFORE-YOU/7.0'}});
    if(!r.ok) throw new Error('ip lookup failed');
    const d=await r.json();
    return [d.city,d.region,d.country_name].filter(Boolean).join(', ') || 'UNKNOWN';
  }catch{return 'UNKNOWN';}finally{clearTimeout(timer);}
}

async function reverseRegion(lat,lon){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6500);
  try{const u=new URL('https://nominatim.openstreetmap.org/reverse');u.searchParams.set('format','jsonv2');u.searchParams.set('lat',String(lat));u.searchParams.set('lon',String(lon));u.searchParams.set('zoom','10');u.searchParams.set('addressdetails','1');const r=await fetch(u,{signal:controller.signal,headers:{'User-Agent':'BEFORE-YOU/7.0'}});if(!r.ok)throw new Error('lookup failed');const d=await r.json();const a=d.address||{};return [a.city||a.town||a.village||a.municipality||a.county,a.state||a.region,a.country].filter(Boolean).join(', ')||'UNKNOWN';}finally{clearTimeout(timer);}}

function sbHeaders(secret=false,extra={}){const key=secret?SB_SECRET:SB_PUBLIC;return {...extra,apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};}
async function sbFetch(pathname,options={},secret=true){if(!HAS_SUPABASE)throw new Error('Supabase not configured');const url=`${SUPABASE_URL}/rest/v1/${pathname}`;const response=await fetch(url,{...options,headers:sbHeaders(secret,options.headers||{})});const text=await response.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data=text;}if(!response.ok){const err=new Error(typeof data==='string'?data:(data?.message||data?.error||`Supabase ${response.status}`));err.status=response.status;throw err;}return {response,data};}
async function sbCount(pathname){const {response}=await sbFetch(pathname,{method:'HEAD',headers:{Prefer:'count=exact'}},true);const range=response.headers.get('content-range')||'';const m=/\/(\d+)$/.exec(range);return m?Number(m[1]):0;}

async function randomSupabaseNote(exclude){
  const {data}=await sbFetch('notes?select=id,message,seeded,status,created_at&status=eq.published&seeded=eq.false&order=created_at.desc&limit=500',{method:'GET'},true);
  const pool=(data||[]).filter(x=>x.id!==exclude);
  if(pool.length) return pool[Math.floor(Math.random()*pool.length)];
  if(data?.length) return data[Math.floor(Math.random()*data.length)];
  throw new Error('No published notes');
}
async function specificSupabaseNote(id){
  const params=new URLSearchParams({select:'id,message,seeded,status,created_at',id:`eq.${id}`,status:'eq.published',seeded:'eq.false',limit:'1'});
  const {data}=await sbFetch(`notes?${params.toString()}`,{method:'GET'},true);
  return data?.[0]||null;
}
async function insertSupabaseNote(message){
  const {data}=await sbFetch('notes',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({message,seeded:false,status:'published'})},true);
  return data?.[0]||null;
}
async function logSupabaseVisit({sessionId,path,region,ip,userAgent}){
  const enc=encodeURIComponent(sessionId);
  const existing=await sbFetch(`visits?select=id&session_id=eq.${enc}&order=visited_at.desc&limit=1`,{method:'GET'},true).then(x=>x.data?.[0]).catch(()=>null);
  const payload={region:region||'UNKNOWN',path,ip_address:ip||'UNKNOWN',user_agent:String(userAgent||'').slice(0,300)};
  if(existing){await sbFetch(`visits?id=eq.${existing.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)},true);return;}
  await sbFetch('visits',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({session_id:sessionId,visited_at:new Date().toISOString(),...payload})},true);
}

async function authenticateAdmin(req){
  if(!HAS_SUPABASE||ADMIN_EMAILS.size===0)return null;
  const header=String(req.headers.authorization||'');if(!header.startsWith('Bearer '))return null;const token=header.slice(7);
  const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SB_PUBLIC,Authorization:`Bearer ${token}`}});if(!response.ok)return null;const user=await response.json();
  const provider=user?.app_metadata?.provider || user?.identities?.[0]?.provider;
  if(!ADMIN_EMAILS.has(String(user?.email||'').toLowerCase()))return null;
  if(provider&&provider!=='google')return null;
  return user;
}
async function adminStats(){
  const [notesPublished,humanNotes,visitorRows,rows24,recent] = await Promise.all([
    sbCount('notes?select=id&status=eq.published&seeded=eq.false'),
    sbCount('notes?select=id&status=eq.published&seeded=eq.false'),
    sbCount('visits?select=id'),
    sbCount(`visits?select=id&visited_at=gte.${encodeURIComponent(new Date(Date.now()-24*60*60*1000).toISOString())}`),
    sbFetch('visits?select=id,visited_at,region,ip_address,path&order=visited_at.desc&limit=250',{method:'GET'},true).then(x=>x.data||[])
  ]);
  const uniqueIps=new Set(recent.map(x=>x.ip_address).filter(Boolean));
  const regionMap=new Map();for(const row of recent){const k=row.region||'UNKNOWN';regionMap.set(k,(regionMap.get(k)||0)+1);}const regions=[...regionMap.entries()].map(([region,count])=>({region,count})).sort((a,b)=>b.count-a.count);
  return {notesPublished,humanNotes,visitorRows,visitsLast24h:rows24,uniqueIps:uniqueIps.size,regions,recent:recent.slice(0,100),adminEmail:ADMIN_EMAIL,adminEmails:[...ADMIN_EMAILS].filter(Boolean)};
}

async function sendFile(res,file,req,status=200,extra={}){const stat=await fs.stat(file);const type=MIME[path.extname(file).toLowerCase()]||'application/octet-stream';const headers={...securityHeaders(),'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':type.startsWith('audio/')?'public,max-age=31536000,immutable':'no-cache',...extra};if(req.method==='HEAD'){res.writeHead(status,{...headers,'Content-Length':stat.size});res.end();return;}
  if(type.startsWith('audio/')&&req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range));if(m){let start=m[1]?Number(m[1]):Math.max(0,stat.size-Number(m[2]||0));let end=m[2]?Number(m[2]):stat.size-1;if(Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&start<stat.size&&start<=end){end=Math.min(end,stat.size-1);const length=end-start+1;const handle=await fs.open(file,'r');const buf=Buffer.allocUnsafe(length);try{await handle.read(buf,0,length,start);}finally{await handle.close();}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':length});res.end(buf);return;}}}
  const body=await fs.readFile(file);res.writeHead(status,{...headers,'Content-Length':body.byteLength});res.end(body);
}
async function sendHtml(res,route){let html=await fs.readFile(path.join(PUBLIC_DIR,'index.html'),'utf8');const meta=metaByRoute[route]||metaByRoute['/'];html=html.replace(/<title>[^<]*<\/title>/,`<title>${meta.title}</title>`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${meta.description}">`).replace(/(<meta property="og:url" content=")[^"]*(">)/,`$1${PUBLIC_URL}${route}$2`).replace(/(<link rel="canonical" href=")[^"]*(">)/,`$1${PUBLIC_URL}${route}$2`).replace('data-route="/"',`data-route="${route}"`);res.writeHead(200,{...securityHeaders(),'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(html);}

async function api(req,res,url){
  if(req.method==='OPTIONS'){res.writeHead(204,{...securityHeaders(),'Access-Control-Allow-Origin':'self','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'});res.end();return true;}
  if(req.method==='GET'&&url.pathname==='/api/health'){json(res,200,{ok:true,service:'before-you',supabase:HAS_SUPABASE,audio:'/audio/constant_entry.mp3',singleAudio:true});return true;}
  if(req.method==='GET'&&url.pathname==='/api/config'){json(res,200,{supabaseUrl:HAS_SUPABASE?SUPABASE_URL:'',supabasePublishableKey:HAS_SUPABASE?SB_PUBLIC:''});return true;}
  if(req.method==='GET'&&url.pathname==='/api/visitor'){json(res,200,{ok:true,region:await ipRegion(req)});return true;}
  if(req.method==='POST'&&url.pathname==='/api/region'){
    try{const body=JSON.parse(await readBody(req));const lat=Number(body.latitude),lon=Number(body.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180){json(res,400,{ok:false,error:'Invalid coordinates'});return true;}json(res,200,{ok:true,region:await reverseRegion(lat,lon)});}catch{json(res,503,{ok:false,error:'Precise region lookup unavailable'});}return true;
  }
  if(req.method==='POST'&&url.pathname==='/api/visit'){
    try{
      const body=JSON.parse(await readBody(req));
      const sessionId=String(body.sessionId||'').slice(0,120);
      const pathName=String(body.path||'/').slice(0,100);
      if(!sessionId){json(res,400,{ok:false,error:'Missing session'});return true;}
      const lat=Number(body.latitude),lon=Number(body.longitude);
      const hasCoords=body.latitude!==null&&body.latitude!==undefined&&body.longitude!==null&&body.longitude!==undefined&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180;
      const region=hasCoords?await reverseRegion(lat,lon):await ipRegion(req);
      const ip=ipOf(req);
      if(HAS_SUPABASE)await logSupabaseVisit({sessionId,path:pathName,region,ip,userAgent:req.headers['user-agent']});
      json(res,201,{ok:true,region,ipRecorded:ip!=='UNKNOWN',regionSource:hasCoords?'browser-location':'ip-geolocation'});
    }catch(e){console.error('[visit]',e.message);json(res,500,{ok:false,error:'visit logging failed'});}return true;
  }
  if(req.method==='GET'&&url.pathname==='/api/found'){
    try{
      if(!HAS_SUPABASE) throw new Error('Supabase unavailable');
      const id=String(url.searchParams.get('id')||'');
      const exclude=String(url.searchParams.get('exclude')||'');
      const note=id?await specificSupabaseNote(id):await randomSupabaseNote(exclude);
      if(!note)throw new Error('No genuine note');
      json(res,200,{ok:true,trace:{id:note.id,text:note.message,seeded:false,createdAt:note.created_at||new Date().toISOString()}});
    }catch(e){json(res,503,{ok:false,error:'Nothing genuine has been left here yet.'});}return true;
  }
  if(req.method==='POST'&&url.pathname==='/api/trace'){
    let body;try{body=JSON.parse(await readBody(req));}catch(e){json(res,e.code==='PAYLOAD_TOO_LARGE'?413:400,{ok:false,error:'The note could not be read'});return true;}
    const message=sanitiseMessage(body?.message);if(!message){json(res,400,{ok:false,error:'Plain text only. Maximum 10,000 characters. Links are not accepted.'});return true;}
    const key=requesterKey(req),until=cooldowns.get(key),now=Date.now();if(until&&until>now){json(res,429,{ok:false,error:'You already passed something on. Come back later.',retryAfterMs:until-now});return true;}cooldowns.set(key,now+TRACE_TTL_MS);
    try{if(!HAS_SUPABASE)throw new Error('Supabase unavailable');const note=await insertSupabaseNote(message);if(!note?.id)throw new Error('Note insert failed');json(res,201,{ok:true,trace:{id:note.id,createdAt:note.created_at||new Date().toISOString()}});}catch(e){cooldowns.delete(key);json(res,503,{ok:false,error:'The note could not be passed yet.'});}
    return true;
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/stats'){
    const user=await authenticateAdmin(req);if(!user){json(res,401,{ok:false,error:'ADMIN ACCESS DENIED'});return true;}
    try{json(res,200,{ok:true,...await adminStats()});}catch(e){json(res,500,{ok:false,error:'Admin report unavailable'});}return true;
  }
  return false;
}

async function start(){
  setInterval(()=>{const now=Date.now();for(const [k,v] of cooldowns)if(v<=now)cooldowns.delete(k);},30*60*1000);
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
      if(await api(req,res,url))return;
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{...securityHeaders(),'Allow':'GET,HEAD,POST,OPTIONS'});res.end();return;}
      if(url.pathname==='/'||url.pathname==='/found'||url.pathname==='/leave'){await sendHtml(res,url.pathname);return;}
      if(url.pathname==='/admin'||url.pathname==='/admin/'){await sendFile(res,path.join(PUBLIC_DIR,'admin.html'),req,200,{'X-Robots-Tag':'noindex, nofollow'});return;}
      if(url.pathname==='/404'){await sendFile(res,path.join(PUBLIC_DIR,'404.html'),req,404);return;}
      const relative=decodeURIComponent(url.pathname).replace(/^\//,'');const normalized=path.normalize(relative);const file=path.resolve(PUBLIC_DIR,normalized);if(file.startsWith(PUBLIC_DIR)&&file!==PUBLIC_DIR){try{await sendFile(res,file,req);return;}catch{}}
      await sendFile(res,path.join(PUBLIC_DIR,'404.html'),req,404);
    }catch(error){console.error('[before-you]',error);if(!res.headersSent){res.writeHead(500,{...securityHeaders(),'Content-Type':'text/plain; charset=utf-8'});res.end('BEFORE YOU / the file did not open.');}}
  });
  server.listen(PORT,()=>console.log(`BEFORE YOU listening on http://localhost:${PORT} / supabase=${HAS_SUPABASE}`));
}
start();
