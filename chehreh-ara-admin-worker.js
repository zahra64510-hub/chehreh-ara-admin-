
const KEY = "products", COOKIE = "chehreh_session";

const GH_OWNER = "zahra64510-hub";
const GH_REPO = "chehreh-ara-admin-";
const GH_BRANCH = "main";
const IMAGE_FOLDER = "product-images";
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {
  status,
  headers: {"content-type":"application/json; charset=utf-8", ...headers}
});

const cors = {
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET, OPTIONS",
  "access-control-allow-headers":"Content-Type"
};

async function sign(v,s) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(s), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const b = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

async function session(s) {
  const p = String(Date.now()+28800000);
  return p+"."+await sign(p,s);
}

async function authorized(req,s) {
  const c = (req.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));
  if(!c) return false;
  const t = decodeURIComponent(c.slice(COOKIE.length+1)), i = t.indexOf(".");
  if(i<1) return false;
  const p = t.slice(0,i);
  return /^\d+$/.test(p) && Number(p)>Date.now() && t.slice(i+1)===await sign(p,s);
}

const setCookie = t => ({
  "Set-Cookie":`${COOKIE}=${encodeURIComponent(t)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
});

const clearCookie = {
  "Set-Cookie":`${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
};

async function products(env) {
  return await env.PRODUCTS.get(KEY,"json") || [];
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for(let i=0; i<bytes.length; i+=chunk) {
    binary += String.fromCharCode(...bytes.subarray(i,i+chunk));
  }
  return btoa(binary);
}

function githubHeaders(env, accept="application/vnd.github+json") {
  return {
    "Authorization":"Bearer "+env.GH_TOKEN,
    "Accept":accept,
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"ChehrehAra-Store"
  };
}

async function uploadImage(request,env) {
  if(!env.GH_TOKEN)
    return json({error:"تنظیمات آپلود عکس کامل نیست. GH_TOKEN را بررسی کن."},500);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({error:"فایل عکس دریافت نشد."},400);
  }

  const file = form.get("file");

  if(!file || typeof file.arrayBuffer !== "function")
    return json({error:"لطفاً یک عکس انتخاب کن."},400);

  const types = {
    "image/jpeg":"jpg",
    "image/png":"png",
    "image/webp":"webp",
    "image/gif":"gif"
  };

  const ext = types[file.type];

  if(!ext)
    return json({error:"فرمت مجاز: JPG، PNG، WEBP یا GIF."},400);

  if(file.size > MAX_IMAGE_SIZE)
    return json({error:"حجم عکس نباید بیشتر از ۴ مگابایت باشد."},400);

  if(file.size === 0)
    return json({error:"فایل عکس خالی است."},400);

  const filename = crypto.randomUUID()+"."+ext;
  const path = IMAGE_FOLDER+"/"+filename;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const apiUrl = "https://api.github.com/repos/"
    +GH_OWNER+"/"+GH_REPO+"/contents/"+path;

  let response;

  try {
    response = await fetch(apiUrl,{
      method:"PUT",
      headers:{
        ...githubHeaders(env),
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        message:"Upload product image",
        branch:GH_BRANCH,
        content:bytesToBase64(bytes)
      })
    });
  } catch {
    return json({error:"ارتباط با گیت‌هاب برقرار نشد."},502);
  }

  if(!response.ok) {
    let detail={};
    try { detail=await response.json(); } catch {}

    return json({
      error:"آپلود عکس انجام نشد. وضعیت گیت‌هاب: "+response.status,
      detail:detail.message||"لطفاً تنظیمات توکن و دسترسی مخزن را بررسی کن."
    },502);
  }

  return json({
    ok:true,
    filename,
    image:new URL("/images/"+filename,request.url).toString()
  });
}

async function serveImage(filename,env) {
  if(!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/.test(filename))
    return new Response("Not found",{status:404});

  if(!env.GH_TOKEN)
    return new Response("Image service unavailable",{status:503});

  const path = IMAGE_FOLDER+"/"+filename;
  const apiUrl = "https://api.github.com/repos/"
    +GH_OWNER+"/"+GH_REPO+"/contents/"+path;

  let response;

  try {
    response = await fetch(apiUrl,{
      headers:githubHeaders(env,"application/vnd.github.raw+json")
    });
  } catch {
    return new Response("Image service unavailable",{status:502});
  }

  if(!response.ok)
    return new Response("Image not found",{status:404});

  const mime = {
    jpg:"image/jpeg",
    png:"image/png",
    webp:"image/webp",
    gif:"image/gif"
  }[filename.split(".").pop()];

  return new Response(response.body,{
    status:200,
    headers:{
      "Content-Type":mime,
      "Cache-Control":"public, max-age=3600",
      "X-Content-Type-Options":"nosniff"
    }
  });
}

function page() {
return `<!doctype html>
<html lang="fa" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>مدیریت چهره‌آرا</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#fff5f2;color:#49333b;font-family:Tahoma,Arial;padding:16px}
main{max-width:760px;margin:auto}
h1{color:#b94d78;font-size:24px}
.card{background:white;border:1px solid #f0d6df;border-radius:16px;padding:16px;margin:14px 0}
input,textarea,button{font:inherit;width:100%;padding:12px;border-radius:10px;border:1px solid #e6c8d2;margin:6px 0}
button{background:#c65380;color:white;border:0;font-weight:bold}
.secondary{background:#f4dce5;color:#71334c}
.del{background:#a9324c}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.item{border-top:1px solid #f0d6df;padding:12px 0}
.muted{font-size:12px;color:#886d78}
.password-row{display:flex;direction:ltr;align-items:stretch;gap:6px}
.password-row input{direction:ltr;text-align:left;unicode-bidi:plaintext;flex:1;min-width:0}
.password-row button{flex:0 0 auto}
.preview{display:block;max-width:220px;max-height:220px;object-fit:contain;margin:10px auto;border-radius:12px;border:1px solid #f0d6df}
.file-label{display:block;margin-top:12px;font-weight:bold;color:#71334c}
@media(max-width:520px){.grid{grid-template-columns:1fr}}
</style>

<main>
<h1>🌸 مدیریت فروشگاه چهره‌آرا</h1>
<p>محصولات را از اینجا اضافه، ویرایش یا حذف کن. برای نمایش در سایت اصلی، باید سایت به API عمومی همین Worker وصل شود.</p>

<section id="login" class="card" lang="en" dir="ltr">
<h3 style="text-align:left">Admin Login</h3>
<div class="password-row">
<input id="password" type="password" placeholder="Admin password" autocomplete="current-password">
<button type="button" class="secondary" style="width:auto;min-width:56px" onclick="togglePassword()" aria-label="Show or hide password">👁️</button>
</div>
<button onclick="login()">Login</button>
<p id="loginMsg" class="muted" style="text-align:left"></p>
</section>

<section id="app" hidden>
<section class="card">
<h3 id="title">افزودن محصول</h3>
<input id="id" type="hidden">
<input id="name" placeholder="نام محصول">
<div class="grid">
<input id="price" placeholder="قیمت">
<input id="category" placeholder="دسته‌بندی">
</div>

<input id="image" placeholder="لینک عکس محصول (اختیاری)" oninput="showImageUrl()">

<label class="file-label" for="imageFile">📷 انتخاب عکس از گالری گوشی</label>
<input id="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange="selectImage()">

<img id="imagePreview" class="preview" hidden alt="پیش‌نمایش عکس محصول">

<button type="button" class="secondary" onclick="uploadSelectedImage()">بارگذاری عکس انتخاب‌شده</button>
<p id="uploadMsg" class="muted"></p>

<p class="muted">حداکثر حجم عکس: ۴ مگابایت. فرمت‌های JPG، PNG، WEBP و GIF مجاز هستند.</p>

<textarea id="description" rows="3" placeholder="توضیحات محصول"></textarea>
<button onclick="save()">ذخیره محصول</button>
<button class="secondary" onclick="resetForm()">پاک کردن فرم</button>
<p id="msg" class="muted"></p>
</section>

<section class="card">
<h3>محصولات ثبت‌شده</h3>
<div id="list"></div>
<button class="secondary" onclick="logout()">خروج</button>
</section>
</section>
</main>

<script>
const $=x=>document.getElementById(x);
let cache=[];
let selectedImage=null;
let previewObjectUrl=null;

function togglePassword(){
  const p=$('password');
  p.type=p.type==='password'?'text':'password';
}

async function api(path,opt={}){
  let r=await fetch(path,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});
  let d={};
  try{d=await r.json()}catch{}
  if(!r.ok)throw Error(d.error||'خطا');
  return d;
}

function esc(s){
  return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function setPreview(src){
  const img=$('imagePreview');
  if(src){
    img.src=src;
    img.hidden=false;
  }else{
    img.removeAttribute('src');
    img.hidden=true;
  }
}

function selectImage(){
  const file=$('imageFile').files[0];
  selectedImage=file||null;

  if(previewObjectUrl){
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl=null;
  }

  if(!file){
    setPreview($('image').value.trim());
    return;
  }

  previewObjectUrl=URL.createObjectURL(file);
  setPreview(previewObjectUrl);
  $('uploadMsg').textContent='عکس انتخاب شد. برای ذخیره در گیت‌هاب، دکمه بارگذاری را بزن.';
}

function showImageUrl(){
  if(!selectedImage)
    setPreview($('image').value.trim());
}

async function uploadSelectedImage(){
  if(!selectedImage){
    $('uploadMsg').textContent='اول یک عکس از گالری انتخاب کن.';
    return;
  }

  const form=new FormData();
  form.append('file',selectedImage);

  $('uploadMsg').textContent='در حال بارگذاری عکس...';

  try{
    const r=await fetch('/api/upload',{
      method:'POST',
      body:form
    });

    let d={};
    try{d=await r.json()}catch{}

    if(!r.ok)throw Error(d.error||'بارگذاری ناموفق بود.');

    $('image').value=d.image;
    selectedImage=null;
    $('imageFile').value='';

    if(previewObjectUrl){
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl=null;
    }

    setPreview(d.image);
    $('uploadMsg').textContent='عکس با موفقیت بارگذاری شد. حالا محصول را ذخیره کن.';
  }catch(e){
    $('uploadMsg').textContent=e.message;
  }
}

async function login(){
  $('loginMsg').textContent='Checking...';
  try{
    await api('/api/login',{
      method:'POST',
      body:JSON.stringify({password:$('password').value})
    });
    $('login').hidden=true;
    $('app').hidden=false;
    load();
  }catch(e){
    $('loginMsg').textContent=e.message;
  }
}

async function load(){
  try{
    cache=(await api('/api/products')).products||[];
    $('list').innerHTML=cache.length
      ?cache.map(p=>'<div class="item"><b>'+esc(p.name)+'</b><div>'+esc(p.price||'قیمت ثبت نشده')+' · '+esc(p.category||'بدون دسته‌بندی')+'</div><div class="muted">'+esc(p.description)+'</div><button class="secondary" onclick="edit('+JSON.stringify(p.id)+')">ویرایش</button><button class="del" onclick="del('+JSON.stringify(p.id)+')">حذف</button></div>').join('')
      :'هنوز محصولی ثبت نشده است.';
  }catch(e){
    $('msg').textContent=e.message;
  }
}

function edit(id){
  let p=cache.find(x=>x.id===id);
  if(!p)return;

  ['id','name','price','category','image','description'].forEach(k=>$(k).value=p[k]||'');

  selectedImage=null;
  $('imageFile').value='';
  $('uploadMsg').textContent='';
  setPreview(p.image||'');

  $('title').textContent='ویرایش محصول';
}

function resetForm(){
  ['id','name','price','category','image','description'].forEach(k=>$(k).value='');

  selectedImage=null;
  $('imageFile').value='';
  $('uploadMsg').textContent='';

  if(previewObjectUrl){
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl=null;
  }

  setPreview('');
  $('title').textContent='افزودن محصول';
}

async function save(){
  let p={
    id:$('id').value||crypto.randomUUID(),
    name:$('name').value.trim(),
    price:$('price').value.trim(),
    category:$('category').value.trim(),
    image:$('image').value.trim(),
    description:$('description').value.trim()
  };

  if(!p.name){
    $('msg').textContent='نام محصول را وارد کن.';
    return;
  }

  if(selectedImage){
    $('msg').textContent='اول عکس انتخاب‌شده را بارگذاری کن.';
    return;
  }

  try{
    await api('/api/products',{method:'POST',body:JSON.stringify(p)});
    $('msg').textContent='محصول ذخیره شد.';
    resetForm();
    load();
  }catch(e){
    $('msg').textContent=e.message;
  }
}

async function del(id){
  if(!confirm('محصول حذف شود؟'))return;
  try{
    await api('/api/products/'+encodeURIComponent(id),{method:'DELETE'});
    load();
  }catch(e){
    $('msg').textContent=e.message;
  }
}

async function logout(){
  await api('/api/logout',{method:'POST'});
  $('app').hidden=true;
  $('login').hidden=false;
  $('password').value='';
}
</script>
</html>`;
}

export default {
async fetch(request,env){
  const u=new URL(request.url),p=u.pathname;

  if(request.method==='OPTIONS'&&p==='/api/public-products')
    return new Response(null,{status:204,headers:cors});

  if(p==='/')
    return Response.redirect(u.origin+'/admin',302);

  if(p==='/admin')
    return new Response(page(),{headers:{'content-type':'text/html; charset=utf-8'}});

  if(p.startsWith('/images/')&&request.method==='GET'){
    return serveImage(p.slice('/images/'.length),env);
  }

  if(p==='/api/public-products'&&request.method==='GET')
    return json({products:await products(env)},200,cors);

  if(p==='/api/login'&&request.method==='POST'){
    if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET||!env.PRODUCTS)
      return json({
        error:'Settings check: ADMIN_PASSWORD='+Boolean(env.ADMIN_PASSWORD)+', SESSION_SECRET='+Boolean(env.SESSION_SECRET)+', PRODUCTS='+Boolean(env.PRODUCTS)
      },500);

    let b={};
    try{b=await request.json()}catch{}

    if(b.password!==env.ADMIN_PASSWORD)
      return json({error:'Password does not match ADMIN_PASSWORD.'},401);

    return json({ok:true},200,setCookie(await session(env.SESSION_SECRET)));
  }

  if(p==='/api/logout'&&request.method==='POST')
    return json({ok:true},200,clearCookie);

  if(p==='/api/upload'&&request.method==='POST'){
    if(!env.SESSION_SECRET||!env.PRODUCTS)
      return json({error:'Server settings are incomplete.'},500);

    if(!await authorized(request,env.SESSION_SECRET))
      return json({error:'Please log in first.'},401);

    return uploadImage(request,env);
  }

  if(p.startsWith('/api/products')){
    if(!env.PRODUCTS||!env.SESSION_SECRET)
      return json({error:'Server settings are incomplete.'},500);

    if(!await authorized(request,env.SESSION_SECRET))
      return json({error:'Please log in first.'},401);

    if(p==='/api/products'&&request.method==='GET')
      return json({products:await products(env)});

    if(p==='/api/products'&&request.method==='POST'){
      let b={};
      try{b=await request.json()}catch{}

      if(!b.name||typeof b.name!=='string')
        return json({error:'Product name is required.'},400);

      let a=await products(env);
      let x={
        id:String(b.id||crypto.randomUUID()),
        name:String(b.name).slice(0,160),
        price:String(b.price||'').slice(0,80),
        category:String(b.category||'').slice(0,100),
        image:String(b.image||'').slice(0,1000),
        description:String(b.description||'').slice(0,2000)
      };

      let i=a.findIndex(v=>v.id===x.id);
      if(i<0)a.unshift(x);
      else a[i]=x;

      await env.PRODUCTS.put(KEY,JSON.stringify(a));
      return json({ok:true,product:x});
    }

    let m=p.match(/^\/api\/products\/([^/]+)$/);
    if(m&&request.method==='DELETE'){
      let id=decodeURIComponent(m[1]);
      let a=(await products(env)).filter(x=>x.id!==id);
      await env.PRODUCTS.put(KEY,JSON.stringify(a));
      return json({ok:true});
    }
  }

  return json({error:'Route not found.'},404);
}
};
