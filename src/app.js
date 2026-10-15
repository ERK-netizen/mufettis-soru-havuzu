/* ================= uygulama ================= */
(function(){
"use strict";
var SECS=["a","b","c","d"], LET=["A","B","C","D"];
var SEC_SHORT={a:"a) Genel",b:"b) MEB",c:"c) Mali-Adli",d:"ç) Diğer"};
var LS_KEY="mufyrd_app_v3", LS_SES="mufyrd_ses_v3", LS_OLD="mufyrd_havuz_v2";

/* --- kararlı soru kimlikleri --- */
function hid(s){var h=5381;for(var i=0;i<s.length;i++){h=((h<<5)+h+s.charCodeAt(i))|0;}return (h>>>0).toString(36);}
var BYID={};
Q.forEach(function(x,i){var id="k"+hid(x.q+"|"+x.o[x.a]);while(BYID[id])id+="x";x.id=id;x.n=i;BYID[id]=x;});
var KONU={};SECS.forEach(function(b){KONU[b]=[];});
Q.forEach(function(x){if(KONU[x.b].indexOf(x.k)<0)KONU[x.b].push(x.k);});

/* --- durum --- */
function now(){return Date.now();}
function lsGet(k){try{var r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
var S=lsGet(LS_KEY);
if(!S||!S.ans){
  S={ans:{},mark:{},exams:[]};
  var old=lsGet(LS_OLD);
  if(old&&old.res){var t=now();Object.keys(old.res).forEach(function(k){var i=parseInt(k.slice(1),10)-1;var x=Q[i];if(x){var r=old.res[k]===1?1:0;S.ans[x.id]={r:r,n:1,w:r?0:1,t:t};}});}
}
S.mark=S.mark||{};S.exams=S.exams||[];
var SES=lsGet(LS_SES);
if(SES&&(!SES.ids||!SES.ids.every(function(id){return BYID[id];})))SES=null;

function save(){lsSet(LS_KEY,S);scheduleSync();}
function saveSes(){lsSet(LS_SES,SES);}
function isMarked(id){return (S.mark[id]||0)>0;}
function record(x,ok){var a=S.ans[x.id]||{n:0,w:0};a.n++;if(!ok)a.w++;a.r=ok?1:0;a.t=now();S.ans[x.id]=a;}

/* --- hesap eşitleme (db) --- */
var syncEl=document.getElementById("sync"), DB=null, REF=null, syncTimer=null, writing=false, dirty=false;
function syncState(cls,txt){syncEl.className="sync "+cls;syncEl.textContent=txt;}
function merge(R){
  if(!R)return false;var ch=false;
  if((R.resetAt||0)>(S.resetAt||0)){S.resetAt=R.resetAt;Object.keys(S.ans).forEach(function(id){if((S.ans[id].t||0)<R.resetAt)delete S.ans[id];});S.exams=S.exams.filter(function(e){return e.t>R.resetAt;});ch=true;}
  var cut=S.resetAt||0;
  Object.keys(R.ans||{}).forEach(function(id){var a=R.ans[id],b=S.ans[id];if(BYID[id]&&(a.t||0)>cut&&(!b||(a.t||0)>(b.t||0))){S.ans[id]=a;ch=true;}});
  Object.keys(R.mark||{}).forEach(function(id){var a=R.mark[id],b=S.mark[id]||0;if(Math.abs(a)>Math.abs(b)){S.mark[id]=a;ch=true;}});
  var seen={};S.exams.forEach(function(e){seen[e.t]=1;});
  (R.exams||[]).forEach(function(e){if(!seen[e.t]&&e.t>cut){S.exams.push(e);ch=true;}});
  S.exams.sort(function(p,q){return q.t-p.t;});S.exams=S.exams.slice(0,30);
  return ch;
}
function scheduleSync(){if(!REF)return;dirty=true;clearTimeout(syncTimer);syncTimer=setTimeout(pushSync,1200);}
function pushSync(){
  if(!REF||writing||!dirty)return;writing=true;dirty=false;syncState("busy","Eşitleniyor");
  REF.set({ans:S.ans,mark:S.mark,exams:S.exams,resetAt:S.resetAt||0,u:now()}).then(function(){writing=false;syncState("on","Hesapta kayıtlı");if(dirty)pushSync();},
    function(e){writing=false;syncState("err","Bu cihazda");if(e&&e.code==="unavailable"){dirty=true;setTimeout(pushSync,3000+Math.random()*2000);}});
}
(async function(){
  try{
    if(!window.claude||!window.claude.use){syncState("","Bu cihazda");return;}
    var db=await window.claude.use("db"), user=await window.claude.use("user");
    if(!db||!user){syncState("","Bu cihazda");return;}
    var uid=await user.id();if(!uid){syncState("","Bu cihazda");return;}
    DB=db;REF=db.doc("data/users/"+uid+"/havuz");
    syncState("busy","Eşitleniyor");
    var snap=await REF.get();
    var remote=snap.exists?snap.data():null;
    var changed=merge(remote);
    lsSet(LS_KEY,S);
    var needPush=!remote||JSON.stringify([remote.ans,remote.mark,(remote.exams||[]).length,remote.resetAt||0])!==JSON.stringify([S.ans,S.mark,S.exams.length,S.resetAt||0]);
    if(needPush){dirty=true;pushSync();}else syncState("on","Hesapta kayıtlı");
    if(changed)refresh();
    REF.onSnapshot(function(sn){if(sn.metadata&&sn.metadata.hasPendingWrites)return;if(sn.exists&&merge(sn.data())){lsSet(LS_KEY,S);refresh();}},function(){syncState("err","Bu cihazda");});
  }catch(e){syncState("err","Bu cihazda");}
})();

/* --- Claude'a açıklatma (sample) --- */
var SAMPLE=null;
(async function(){try{if(window.claude&&window.claude.use){SAMPLE=await window.claude.use("sample");if(SAMPLE&&route.screen==="play")refresh();}}catch(e){SAMPLE=null;}})();
var askState={};

/* --- yardımcılar --- */
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function qhtml(s){return esc(s).replace(/&lt;br&gt;/g,"<br>");}
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
function pct(a,b){return b?Math.round(a/b*100):0;}
function fmtDate(t){var d=new Date(t);return d.toLocaleDateString("tr-TR",{day:"numeric",month:"short"})+" "+d.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});}
function fmtDur(ms){var s=Math.round(ms/1000),m=Math.floor(s/60);return (m>=60?Math.floor(m/60)+" sa ":"")+(m%60)+" dk "+(s%60)+" sn";}
function statsOf(list){var n=list.length,seen=0,ok=0;list.forEach(function(x){var a=S.ans[x.id];if(a){seen++;if(a.r)ok++;}});return {n:n,seen:seen,ok:ok,bad:seen-ok};}
function meter(st){return "<span class=\"meter\"><i class=\"g\" style=\"width:"+pct(st.ok,st.n)+"%\"></i><i class=\"r\" style=\"width:"+pct(st.bad,st.n)+"%\"></i></span>";}
function wrongList(){return Q.filter(function(x){var a=S.ans[x.id];return a&&a.r===0;});}
function markList(){return Q.filter(function(x){return isMarked(x.id);});}
function newList(){return Q.filter(function(x){return !S.ans[x.id];});}

/* --- yönlendirme --- */
var view=document.getElementById("view"), ttl=document.getElementById("ttl"), backBtn=document.getElementById("back");
var route={tab:"study",screen:"home"};
var ui={sec:"all",filter:"all",order:"seq",examN:40,confirmReset:false,result:null};
var tabs=[].slice.call(document.querySelectorAll(".tabbar button"));
tabs.forEach(function(b){b.onclick=function(){go(b.getAttribute("data-tab"),"home");};});
backBtn.onclick=function(){
  if(route.screen==="play"&&SES&&SES.kind==="exam"&&!SES.done){go("exam","home");return;}
  go(route.tab,"home");
};
function go(tab,screen){route.tab=tab;route.screen=screen||"home";ui.confirmReset=false;refresh();view.scrollTop=0;}
function refresh(){
  tabs.forEach(function(b){if(b.getAttribute("data-tab")===route.tab)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
  var w=wrongList().length,rd=document.getElementById("revDot");if(w)rd.setAttribute("data-n",w>99?"99+":w);else rd.removeAttribute("data-n");
  backBtn.hidden=route.screen==="home";
  var h="";
  if(route.screen==="play")h=renderPlay();
  else if(route.screen==="result")h=renderResult();
  else if(route.tab==="study")h=renderStudy();
  else if(route.tab==="exam")h=renderExam();
  else if(route.tab==="review")h=renderReview();
  else if(route.tab==="stats")h=renderStats();
  else h=renderInfo();
  view.innerHTML="<div class=\"col gut page\">"+h+"</div>";
  bind();
}

/* --- oturum başlatma --- */
function startSession(kind,title,list,opts){
  opts=opts||{};
  if(!list.length)return;
  var ids=list.map(function(x){return x.id;});
  if(opts.shuffle)ids=shuffle(ids);
  var orders={};ids.forEach(function(id){orders[id]=shuffle([0,1,2,3]);});
  SES={kind:kind,title:title,ids:ids,i:0,picks:{},orders:orders,start:now(),done:false};
  saveSes();route.tab=kind==="exam"?"exam":(kind==="review"?"review":"study");route.screen="play";askState={};refresh();view.scrollTop=0;
}
function studyPool(){
  return Q.filter(function(x){
    if(ui.sec!=="all"&&x.b!==ui.sec)return false;
    var a=S.ans[x.id];
    if(ui.filter==="new"&&a)return false;
    if(ui.filter==="wrong"&&!(a&&a.r===0))return false;
    if(ui.filter==="mark"&&!isMarked(x.id))return false;
    return true;});
}

/* --- Çalış --- */
function renderStudy(){
  ttl.textContent="Soru Havuzu";
  var h="";
  if(SES&&!SES.done&&SES.kind!=="exam"&&SES.i<SES.ids.length){
    h+="<button class=\"resume\" data-act=\"resume\"><small>Kaldığın yerden devam</small><b>"+esc(SES.title)+"</b><span>Soru "+(SES.i+1)+" / "+SES.ids.length+"</span></button>";
  }
  var secs=[["all","Tümü"]].concat(SECS.map(function(b){return [b,SEC_SHORT[b]];}));
  h+="<div class=\"seg\" role=\"group\" aria-label=\"Bölüm\">"+secs.map(function(s){return "<button data-sec=\""+s[0]+"\" aria-pressed=\""+(ui.sec===s[0])+"\">"+s[1]+"</button>";}).join("")+"</div>";
  var fl=[["all","Tümü"],["new","Çözmediklerim"],["wrong","Yanlışlarım"],["mark","İşaretliler"]];
  h+="<div class=\"chips\">"+fl.map(function(f){return "<button class=\"chip\" data-filter=\""+f[0]+"\" aria-pressed=\""+(ui.filter===f[0])+"\">"+f[1]+"</button>";}).join("")
    +"<button class=\"chip\" data-order aria-pressed=\""+(ui.order==="rand")+"\">Karışık sıra</button></div>";
  var pool=studyPool();
  h+="<button class=\"btn primary block\" data-act=\"startAll\""+(pool.length?"":" disabled")+">"+(pool.length?pool.length+" soruyla başla":"Bu seçimde soru yok")+"</button>";
  var secList=ui.sec==="all"?SECS:[ui.sec];
  secList.forEach(function(b){
    h+="<div class=\"group\"><h3>"+esc(BOL[b])+"</h3><div class=\"list\">";
    KONU[b].forEach(function(k){
      var all=Q.filter(function(x){return x.b===b&&x.k===k;}),st=statsOf(all);
      var inPool=pool.filter(function(x){return x.b===b&&x.k===k;}).length;
      h+="<button class=\"row\" data-konu=\""+esc(b+"|"+k)+"\""+(inPool?"":" disabled style=\"opacity:.45\"")+"><span class=\"t\">"+esc(k)+"</span><span class=\"n\">"+inPool+"</span>"
        +meter(st)+"<span class=\"s\">"+st.seen+"/"+st.n+" çözüldü"+(st.seen?" · %"+pct(st.ok,st.seen)+" doğru":"")+"</span></button>";
    });
    h+="</div></div>";
  });
  return h;
}

/* --- Soru ekranı --- */
function curQ(){return SES?BYID[SES.ids[SES.i]]:null;}
function renderPlay(){
  if(!SES){route.screen="home";return renderStudy();}
  var x=curQ(),exam=SES.kind==="exam",pick=SES.picks[x.id],ord=SES.orders[x.id],reveal=!exam&&pick!=null;
  ttl.textContent=SES.title;
  var a=S.ans[x.id];
  var h="<div class=\"qhead\"><div class=\"qmeta\"><span class=\"no\">"+(SES.i+1)+" / "+SES.ids.length+"</span><span>"+esc(SEC_SHORT[x.b])+"</span><span>"+esc(x.k)+"</span>"
    +(a&&a.r===0&&!reveal?"<span class=\"flag\">Daha önce yanlış</span>":"")
    +(exam?"<span class=\"timer\" id=\"timer\"></span>":"")+"</div>"
    +"<div class=\"progress\"><i style=\"width:"+pct(SES.i+1,SES.ids.length)+"%\"></i></div></div>";
  h+="<article class=\"sheet\" id=\"card\"><p class=\"q\">"+qhtml(x.q)+"</p><ul class=\"opts\">";
  ord.forEach(function(oi,pos){
    var cls="opt";
    if(reveal){if(oi===x.a)cls+=" right";else if(oi===pick)cls+=" wrong";}
    else if(pick===oi)cls+=" sel";
    h+="<li><button class=\""+cls+"\" data-oi=\""+oi+"\""+(reveal?" disabled":"")+"><span class=\"L\">"+LET[pos]+"</span><span>"+esc(x.o[oi])+"</span></button></li>";
  });
  h+="</ul>";
  if(reveal){
    var ok=pick===x.a,s=SRC[x.s];
    h+="<div class=\"explain\"><div class=\"verdict "+(ok?"ok":"no")+"\">"+(ok?"Doğru.":"Yanlış. Doğru cevap "+LET[ord.indexOf(x.a)]+".")+"</div><p>"+esc(x.e)+"</p>"
      +"<div class=\"ref\"><span class=\"madde\">"+esc(x.d)+"</span><span class=\"vb "+s.v+"\">"+VLAB[s.v]+"</span></div>"
      +"<div class=\"src\">Kaynak: "+(s.u?"<a href=\""+esc(s.u)+"\" target=\"_blank\" rel=\"noopener\">"+esc(s.t)+"</a>":esc(s.t))+"</div>";
    if(SAMPLE){
      var as=askState[x.id];
      h+="<div class=\"ask\">";
      if(as&&as.text)h+="<div class=\"askbox\"><span class=\"who\">Claude'un açıklaması</span><span id=\"askText\">"+esc(as.text)+"</span></div>";
      if(as&&as.err)h+="<p class=\"lead\">"+esc(as.err)+"</p>";
      if(!as||(!as.busy&&!as.text))h+="<button class=\"linkbtn\" data-act=\"ask\">Claude'a daha ayrıntılı açıklat</button>";
      if(as&&as.busy&&!as.text)h+="<p class=\"lead\" id=\"askText\">Claude düşünüyor…</p>";
      h+="</div>";
    }
    h+="</div>";
  }
  h+="</article>";
  var last=SES.i===SES.ids.length-1;
  h+="<div class=\"actionbar\"><button class=\"mark\" data-act=\"mark\" aria-label=\"Soruyu işaretle\" aria-pressed=\""+isMarked(x.id)+"\"><svg viewBox=\"0 0 24 24\" fill=\""+(isMarked(x.id)?"currentColor":"none")+"\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linejoin=\"round\"><path d=\"M6 3h12v18l-6-4-6 4z\"/></svg></button>"
    +"<button class=\"btn\" data-act=\"prev\""+(SES.i===0?" disabled":"")+">Önceki</button>";
  if(exam&&last)h+="<button class=\"btn primary\" data-act=\"finish\">Bitir</button>";
  else if(!exam&&last&&reveal)h+="<button class=\"btn primary\" data-act=\"finish\">Bitir</button>";
  else h+="<button class=\"btn primary\" data-act=\"next\""+(last?" disabled":"")+">Sonraki</button>";
  h+="</div><p class=\"hint\">Kartı sağa-sola kaydırarak da geçebilirsin.</p>";
  return h;
}
function answer(oi){
  var x=curQ();if(!x)return;
  if(SES.kind==="exam"){SES.picks[x.id]=oi;saveSes();refresh();return;}
  if(SES.picks[x.id]!=null)return;
  SES.picks[x.id]=oi;record(x,oi===x.a);save();saveSes();refresh();
}
function move(d){if(!SES)return;var n=SES.i+d;if(n<0||n>=SES.ids.length)return;SES.i=n;saveSes();refresh();view.scrollTop=0;}
function finish(){
  if(!SES)return;
  var exam=SES.kind==="exam",res={kind:SES.kind,title:SES.title,t:now(),dur:now()-SES.start,n:SES.ids.length,ok:0,blank:0,sec:{},wrong:[]};
  SES.ids.forEach(function(id){
    var x=BYID[id],p=SES.picks[id];
    if(!res.sec[x.b])res.sec[x.b]=[0,0];res.sec[x.b][1]++;
    if(p==null){res.blank++;return;}
    var ok=p===x.a;if(ok){res.ok++;res.sec[x.b][0]++;}else res.wrong.push(id);
    if(exam)record(x,ok);
  });
  if(exam){S.exams.unshift({t:res.t,n:res.n,ok:res.ok,blank:res.blank,dur:res.dur,sec:res.sec});S.exams=S.exams.slice(0,30);}
  save();SES.done=true;saveSes();ui.result=res;route.screen="result";refresh();view.scrollTop=0;
}
function renderResult(){
  var r=ui.result;if(!r){route.screen="home";return route.tab==="exam"?renderExam():renderStudy();}
  ttl.textContent=r.kind==="exam"?"Deneme sonucu":"Oturum sonucu";
  var net=r.ok-(r.n-r.ok-r.blank)/4;
  var h="<div class=\"card\"><h3>"+esc(r.title)+"</h3><div class=\"score\">"+r.ok+"<small> / "+r.n+" doğru · %"+pct(r.ok,r.n)+"</small></div>"
    +"<p class=\"lead\">"+(r.n-r.ok-r.blank)+" yanlış, "+r.blank+" boş · süre "+fmtDur(r.dur)+(r.kind==="exam"?" · net (4 yanlış 1 doğruyu götürür varsayımıyla) "+net.toFixed(2):"")+"</p></div>";
  h+="<div class=\"card tbl\"><table><thead><tr><th>Bölüm</th><th class=\"num\">Doğru</th><th class=\"num\">%</th></tr></thead><tbody>";
  SECS.forEach(function(b){var s=r.sec[b];if(s)h+="<tr><td>"+esc(BOL[b])+"</td><td class=\"num\">"+s[0]+" / "+s[1]+"</td><td class=\"num\">"+pct(s[0],s[1])+"</td></tr>";});
  h+="</tbody></table></div>";
  if(r.wrong.length){
    h+="<div class=\"group\"><h3>Yanlış cevaplanan sorular</h3><ul class=\"wrongs\">";
    r.wrong.slice(0,40).forEach(function(id){var x=BYID[id];h+="<li><span>"+qhtml(x.q)+"</span><span class=\"ans\">"+esc(x.o[x.a])+"</span><span class=\"src\">"+esc(x.d)+"</span></li>";});
    h+="</ul><button class=\"btn primary block\" data-act=\"redoWrong\">Bu yanlışları tekrar çöz</button></div>";
  }
  h+="<button class=\"btn block\" data-act=\"home\">Tamam</button>";
  return h;
}

/* --- Deneme --- */
function drawExam(n){
  var per=Math.floor(n/4),out=[];
  SECS.forEach(function(b){out=out.concat(shuffle(Q.filter(function(x){return x.b===b;})).slice(0,per));});
  var rest=shuffle(Q.filter(function(x){return out.indexOf(x)<0;}));
  while(out.length<n&&rest.length)out.push(rest.pop());
  return out;
}
function renderExam(){
  ttl.textContent="Deneme sınavı";
  var h="";
  if(SES&&SES.kind==="exam"&&!SES.done){
    var answered=Object.keys(SES.picks).length;
    h+="<button class=\"resume\" data-act=\"resume\"><small>Devam eden deneme</small><b>"+esc(SES.title)+"</b><span>"+answered+" / "+SES.ids.length+" işaretlendi · başlangıç "+fmtDate(SES.start)+"</span></button>";
  }
  h+="<div class=\"card\"><h2>Yeni deneme</h2><p class=\"lead\">Sorular dört bölümden eşit sayıda (%25) rastgele seçilir. Cevaplar sonda gösterilir; boş bırakılan sorular yanlış sayılmaz.</p>"
    +"<div class=\"seg\" role=\"group\" aria-label=\"Soru sayısı\">"+[20,40,80,100].map(function(n){return "<button data-examn=\""+n+"\" aria-pressed=\""+(ui.examN===n)+"\">"+n+" soru</button>";}).join("")+"</div>"
    +"<button class=\"btn primary block\" data-act=\"startExam\">Denemeyi başlat</button></div>";
  if(S.exams.length){
    h+="<div class=\"group\"><h3>Önceki denemeler</h3><div class=\"card tbl\"><table><thead><tr><th>Tarih</th><th class=\"num\">Doğru</th><th class=\"num\">%</th><th class=\"num\">Süre</th></tr></thead><tbody>";
    S.exams.slice(0,12).forEach(function(e){h+="<tr><td>"+fmtDate(e.t)+"</td><td class=\"num\">"+e.ok+" / "+e.n+"</td><td class=\"num\">"+pct(e.ok,e.n)+"</td><td class=\"num\">"+Math.round(e.dur/60000)+" dk</td></tr>";});
    h+="</tbody></table></div></div>";
  }
  return h;
}

/* --- Tekrar --- */
function weakKonu(){
  var out=[];SECS.forEach(function(b){KONU[b].forEach(function(k){var l=Q.filter(function(x){return x.b===b&&x.k===k;}),s=statsOf(l);if(s.seen>=3)out.push({b:b,k:k,st:s,acc:s.ok/s.seen});});});
  return out.filter(function(o){return o.acc<0.8;}).sort(function(p,q){return p.acc-q.acc;}).slice(0,6);
}
function renderReview(){
  ttl.textContent="Tekrar";
  var w=wrongList(),m=markList(),nw=newList();
  var h="<p class=\"lead\">Son cevabı yanlış olan sorular burada toplanır; doğru cevapladığında listeden çıkar.</p><div class=\"tiles\">"
    +"<button class=\"tile bad\" data-act=\"revWrong\""+(w.length?"":" disabled")+"><span class=\"big\">"+w.length+"</span><span class=\"lab\">Yanlışlarım</span><span class=\"sub\">Karışık sırayla tekrar</span></button>"
    +"<button class=\"tile mark\" data-act=\"revMark\""+(m.length?"":" disabled")+"><span class=\"big\">"+m.length+"</span><span class=\"lab\">İşaretlediklerim</span><span class=\"sub\">Kitap simgesiyle işaretlenenler</span></button>"
    +"<button class=\"tile new\" data-act=\"revNew\""+(nw.length?"":" disabled")+"><span class=\"big\">"+nw.length+"</span><span class=\"lab\">Hiç çözmediklerim</span><span class=\"sub\">Rastgele 20 soru</span></button></div>";
  var wk=weakKonu();
  h+="<div class=\"group\"><h3>Zayıf konular</h3>";
  if(wk.length){h+="<div class=\"list\">";wk.forEach(function(o){h+="<button class=\"row\" data-weak=\""+esc(o.b+"|"+o.k)+"\"><span class=\"t\">"+esc(o.k)+"</span><span class=\"n\">%"+Math.round(o.acc*100)+"</span>"+meter(o.st)+"<span class=\"s\">"+o.st.seen+" soruda "+o.st.ok+" doğru</span></button>";});h+="</div>";}
  else h+="<p class=\"lead\">En az üç soru çözdüğün konularda başarı %80'in altına düşerse burada listelenir.</p>";
  h+="</div>";
  return h;
}

/* --- İlerleme --- */
function renderStats(){
  ttl.textContent="İlerleme";
  var all=statsOf(Q);
  var h="<div class=\"card\"><h3>Genel durum</h3><div class=\"score\">"+all.seen+"<small> / "+all.n+" soru çözüldü</small></div><p class=\"lead\">Son cevaplara göre "+all.ok+" doğru, "+all.bad+" yanlış"+(all.seen?" · başarı %"+pct(all.ok,all.seen):"")+"</p>"+meter(all)+"</div>";
  h+="<div class=\"card\"><h3>Bölümler</h3><div class=\"bars\">";
  SECS.forEach(function(b){var s=statsOf(Q.filter(function(x){return x.b===b;}));h+="<div class=\"b\"><div><b>"+esc(BOL[b])+"</b><span>"+s.seen+"/"+s.n+(s.seen?" · %"+pct(s.ok,s.seen):"")+"</span></div>"+meter(s)+"</div>";});
  h+="</div></div>";
  h+="<div class=\"card tbl\"><h3>Konular</h3><table><thead><tr><th>Konu</th><th class=\"num\">Çözülen</th><th class=\"num\">Başarı</th></tr></thead><tbody>";
  SECS.forEach(function(b){KONU[b].forEach(function(k){var s=statsOf(Q.filter(function(x){return x.b===b&&x.k===k;}));h+="<tr><td>"+esc(k)+"</td><td class=\"num\">"+s.seen+" / "+s.n+"</td><td class=\"num\">"+(s.seen?"%"+pct(s.ok,s.seen):"–")+"</td></tr>";});});
  h+="</tbody></table></div>";
  h+="<div class=\"card\"><h3>İlerlemeyi sıfırla</h3><p class=\"lead\">Tüm cevaplar, işaretler ve deneme geçmişi silinir. Hesaba bağlıysan diğer cihazlarda da silinir.</p>";
  if(ui.confirmReset)h+="<div class=\"confirm\"><span>Emin misin?</span><button class=\"btn danger\" data-act=\"resetYes\">Evet, sıfırla</button><button class=\"btn\" data-act=\"resetNo\">Vazgeç</button></div>";
  else h+="<button class=\"btn danger\" data-act=\"reset\">Sıfırla</button>";
  h+="</div>";
  return h;
}

/* --- Bilgi --- */
var DL=null;
(async function(){try{if(window.claude&&window.claude.use){DL=await window.claude.use("downloads");if(DL&&route.tab==="info")refresh();}}catch(e){DL=null;}})();
function renderInfo(){
  ttl.textContent="Bilgi";
  var BI=window.BUILD_INFO||{};
  if(BI.web){
    var h="<div class=\"card prose\"><h2>Uygulama</h2><p>Son içerik güncellemesi: <b>"+esc(BI.tarih||"")+"</b> · "+(BI.soru||Q.length)+" soru.</p><p>Uygulama her açılışta internet varsa yeni soruları kendiliğinden alır; internet yoksa son indirilen sürümle çalışır.</p></div>";
    h+="<div class=\"card prose\"><h2>İlerleme yedeği</h2><p>Cevapların, işaretlerin ve deneme geçmişin yalnızca bu telefonda tutulur. Uygulamayı silmeden önce yedeği kopyalayıp bir yere (ör. kendine mesaj) yapıştır; geri yüklemek için aşağıdaki kutuya yapıştırıp yükle.</p>"
      +"<button class=\"btn\" data-act=\"bkCopy\">Yedeği kopyala</button><textarea id=\"bkTxt\" rows=\"3\" style=\"width:100%;margin-top:10px;font:12px/1.4 monospace\" placeholder=\"Yedek metnini buraya yapıştır\"></textarea><button class=\"btn\" data-act=\"bkLoad\" style=\"margin-top:8px\">Yedeği yükle</button><p class=\"lead\" id=\"bkMsg\"></p></div>";
  } else {
  var h="<div class=\"card prose\"><h2>Telefona uygulama gibi ekle</h2>"
    +"<p><b>iPhone (Safari):</b></p><ol><li>Bu sayfayı Safari'de aç.</li><li>Alttaki Paylaş düğmesine dokun.</li><li>“Ana Ekrana Ekle”yi seç.</li></ol>"
    +"<p><b>Android (Chrome):</b></p><ol><li>Bu sayfayı Chrome'da aç.</li><li>Sağ üstteki üç noktaya dokun.</li><li>“Ana ekrana ekle”yi seç.</li></ol>"
    +"<p>Simge, her zaman aynı bağlantıyı açar; havuz güncellendiğinde yeni sorular otomatik gelir.</p></div>";
  h+="<div class=\"card prose\"><h2>İlerlemenin kaydı</h2><p>Hesabına girişliyken cevapların, işaretlerin ve deneme geçmişin hesabında saklanır; telefonda kaldığın yerden bilgisayarda devam edebilirsin. Üstteki etiket “Hesapta kayıtlı” yazıyorsa eşitleme açıktır, “Bu cihazda” yazıyorsa kayıt yalnızca bu tarayıcıdadır.</p></div>";
  h+="<div class=\"card prose\"><h2>İnternetsiz kopya</h2><p>Sayfanın tek dosyalık kopyasını telefona veya bilgisayara kaydedebilirsin. Kopya internet olmadan açılır; ancak ilerlemesi yalnızca o dosyanın açıldığı tarayıcıda tutulur ve havuz güncellemelerini almaz.</p>"
    +(DL?"<button class=\"btn\" data-act=\"download\">Kopyayı indir</button><p class=\"lead\" id=\"dlMsg\"></p>":"<p class=\"lead\">Bu görünümde dosya indirme kullanılamıyor.</p>")+"</div>";
  }
  h+="<div class=\"card prose\"><h2>Kapsam ve doğrulama</h2>"+document.getElementById("kapsamTpl").innerHTML+"</div>";
  h+="<div class=\"card prose\"><h2>Kaynaklar</h2><ul class=\"srclist\">"+Object.keys(SRC).map(function(k){var s=SRC[k];return "<li><span class=\"vb "+s.v+"\">"+VLAB[s.v]+"</span> "+(s.u?"<a href=\""+esc(s.u)+"\" target=\"_blank\" rel=\"noopener\">"+esc(s.t)+"</a>":esc(s.t))+"</li>";}).join("")+"</ul></div>";
  h+="<p class=\"lead\" style=\"text-align:center\">"+Q.length+" soru · 4 bölüm · "+SECS.reduce(function(n,b){return n+KONU[b].length;},0)+" konu</p>";
  return h;
}

/* --- olay bağlama --- */
var timerInt=null;
function bind(){
  clearInterval(timerInt);
  view.querySelectorAll("[data-sec]").forEach(function(b){b.onclick=function(){ui.sec=b.getAttribute("data-sec");refresh();};});
  view.querySelectorAll("[data-filter]").forEach(function(b){b.onclick=function(){ui.filter=b.getAttribute("data-filter");refresh();};});
  view.querySelectorAll("[data-order]").forEach(function(b){b.onclick=function(){ui.order=ui.order==="rand"?"seq":"rand";refresh();};});
  view.querySelectorAll("[data-examn]").forEach(function(b){b.onclick=function(){ui.examN=+b.getAttribute("data-examn");refresh();};});
  view.querySelectorAll("[data-konu]").forEach(function(b){b.onclick=function(){var p=b.getAttribute("data-konu").split("|"),bb=p[0],k=p.slice(1).join("|");
    startSession("study",k,studyPool().filter(function(x){return x.b===bb&&x.k===k;}),{shuffle:ui.order==="rand"});};});
  view.querySelectorAll("[data-weak]").forEach(function(b){b.onclick=function(){var p=b.getAttribute("data-weak").split("|"),bb=p[0],k=p.slice(1).join("|");
    startSession("review",k+" · tekrar",Q.filter(function(x){return x.b===bb&&x.k===k;}),{shuffle:true});};});
  view.querySelectorAll(".opt[data-oi]").forEach(function(b){b.onclick=function(){answer(+b.getAttribute("data-oi"));};});
  view.querySelectorAll("[data-act]").forEach(function(b){b.onclick=function(){act(b.getAttribute("data-act"),b);};});
  var card=document.getElementById("card");
  if(card){var sx=null,sy=null;
    card.addEventListener("touchstart",function(e){var t=e.touches[0];sx=t.clientX;sy=t.clientY;},{passive:true});
    card.addEventListener("touchend",function(e){if(sx==null)return;var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;sx=null;
      if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5)move(dx<0?1:-1);},{passive:true});}
  var tm=document.getElementById("timer");
  if(tm&&SES){var upd=function(){tm.textContent=fmtDur(now()-SES.start);};upd();timerInt=setInterval(upd,1000);}
}
function act(a,el){
  if(a==="resume"){route.screen="play";askState={};refresh();view.scrollTop=0;}
  else if(a==="startAll"){var t=ui.sec==="all"?"Tüm bölümler":BOL[ui.sec];startSession("study",t,studyPool(),{shuffle:ui.order==="rand"});}
  else if(a==="startExam"){startSession("exam",ui.examN+" soruluk deneme",drawExam(ui.examN),{shuffle:true});}
  else if(a==="prev")move(-1);
  else if(a==="next")move(1);
  else if(a==="finish")finish();
  else if(a==="mark"){var x=curQ();S.mark[x.id]=isMarked(x.id)?-now():now();save();refresh();}
  else if(a==="home"){ui.result=null;SES=null;saveSes();go(route.tab,"home");}
  else if(a==="redoWrong"){var r=ui.result;ui.result=null;startSession("review","Oturum yanlışları",r.wrong.map(function(id){return BYID[id];}),{shuffle:true});}
  else if(a==="revWrong")startSession("review","Yanlışlarım",wrongList(),{shuffle:true});
  else if(a==="revMark")startSession("review","İşaretlediklerim",markList(),{shuffle:false});
  else if(a==="revNew")startSession("review","Yeni sorular",shuffle(newList()).slice(0,20),{shuffle:false});
  else if(a==="reset"){ui.confirmReset=true;refresh();}
  else if(a==="resetNo"){ui.confirmReset=false;refresh();}
  else if(a==="resetYes"){var t=now();Object.keys(S.mark).forEach(function(id){S.mark[id]=-t;});S.ans={};S.exams=[];S.resetAt=t;SES=null;saveSes();ui.confirmReset=false;
    if(REF){dirty=true;clearTimeout(syncTimer);pushSync();}lsSet(LS_KEY,S);refresh();}
  else if(a==="ask")askClaude();
  else if(a==="download")downloadCopy();
  else if(a==="bkCopy")bkCopy();
  else if(a==="bkLoad")bkLoad();
}
function askClaude(){
  var x=curQ();if(!x||!SAMPLE)return;
  var pick=SES.picks[x.id];
  var st=askState[x.id]={busy:true,text:""};refresh();
  var prompt="Sen MEB Müfettiş Yardımcılığı sınavına hazırlanan bir adaya mevzuat öğreten bir eğitmensin. Aşağıdaki çoktan seçmeli soruyu Türkçe, en fazla 150 kelimeyle açıkla.\n"
    +"Kurallar: Doğru cevabın neden doğru olduğunu ve adayın seçtiği yanlış seçeneğin (varsa) neden yanlış olduğunu açıkla. Yalnızca aşağıda verilen dayanak madde ve açıklamaya dayan; madde numarası, süre, oran veya tutar uydurma. Emin olmadığın bir ayrıntıyı söyleme. Sonuna hatırlamayı kolaylaştıran tek cümlelik bir ipucu ekle. Başlık veya madde imi kullanma.\n\n"
    +"Konu: "+x.k+"\nSoru: "+x.q.replace(/<br>/g," ")+"\nSeçenekler:\n"+x.o.map(function(o,i){return "- "+o+(i===x.a?" (doğru cevap)":"")+(i===pick&&i!==x.a?" (adayın seçtiği)":"");}).join("\n")
    +"\nDayanak: "+x.d+"\nHavuzdaki açıklama: "+x.e;
  SAMPLE(prompt,{onText:function(u){st.text=u.text;var el=document.getElementById("askText");if(el&&curQ()===x&&el.parentNode.className==="askbox")el.textContent=u.text;else if(curQ()===x)refresh();}})
    .then(function(r){st.busy=false;st.text=r.text;if(curQ()===x)refresh();},
      function(e){st.busy=false;if(e&&e.text)st.text=e.text;
        if(e&&(e.code==="not_granted"||e.code==="sampling_disabled")){SAMPLE=null;}
        else if(e&&e.code!=="cancelled")st.err=e.code==="rate_limited"?"Şu anda çok fazla istek var; biraz sonra tekrar dene.":"Açıklama alınamadı; daha sonra tekrar dene.";
        if(curQ()===x)refresh();});
}
function bkCopy(){var o={v:1,app:lsGet("mufyrd_app_v3"),ses:lsGet("mufyrd_ses_v3")};var t="SH1:"+btoa(unescape(encodeURIComponent(JSON.stringify(o))));var m=document.getElementById("bkMsg"),ta=document.getElementById("bkTxt");
  function man(x){if(ta){ta.value=t;ta.select();}if(m)m.textContent=x;}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){if(m)m.textContent="Yedek panoya kopyalandı.";},function(){man("Kopyalanamadı; kutudaki metni elle kopyala.");});}else man("Kutudaki metni elle kopyala.");}
function bkLoad(){var ta=document.getElementById("bkTxt"),m=document.getElementById("bkMsg");try{var t=(ta.value||"").trim();if(t.indexOf("SH1:")!==0)throw 0;var o=JSON.parse(decodeURIComponent(escape(atob(t.slice(4)))));if(!o||o.v!==1)throw 0;if(o.app)lsSet("mufyrd_app_v3",o.app);if(o.ses)lsSet("mufyrd_ses_v3",o.ses);if(m)m.textContent="Yedek yüklendi, uygulama yenileniyor…";setTimeout(function(){location.reload();},600);}catch(e){if(m)m.textContent="Geçersiz yedek metni.";}}
function downloadCopy(){
  var msg=document.getElementById("dlMsg");
  var html="<!doctype html>\n"+document.documentElement.outerHTML.replace(/<main class="view" id="view">[\s\S]*?<\/main>/,"<main class=\"view\" id=\"view\"><div class=\"col gut page\"><p class=\"empty\">Yükleniyor…</p></div></main>");
  DL.save({filename:"mufettis-soru-havuzu.html",data:html}).then(function(){if(msg)msg.textContent="Kaydedildi.";},function(e){if(msg)msg.textContent=e&&e.code==="cancelled"?"":"Kopya kaydedilemedi.";});
}
document.addEventListener("keydown",function(e){
  if(route.screen!=="play"||e.target.tagName==="INPUT")return;
  var k=e.key.toUpperCase(),i=LET.indexOf(k);if(i<0&&"1234".indexOf(e.key)>=0&&e.key.length===1)i=+e.key-1;
  var x=curQ();if(i>=0&&x){answer(SES.orders[x.id][i]);}
  else if(e.key==="ArrowRight")move(1);else if(e.key==="ArrowLeft")move(-1);
});
refresh();
})();

