/** 睡眠日誌 v0.1.0 (2026-11-02) | © 2021–2026 Dobhar-chú
 * Firebase Authentication + Firestore。睡眠・服薬の内容は localStorage に保存しない。
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendEmailVerification,
  sendPasswordResetEmail, reload, getIdToken,
  verifyBeforeUpdateEmail, EmailAuthProvider, reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, deleteDoc,
  query, where, documentId, writeBatch, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCd8IC-eFermCAQgFqW8z1qbUdZkhB3wcU',
  authDomain: 'sleep-diary-2c917.firebaseapp.com',
  projectId: 'sleep-diary-2c917',
  storageBucket: 'sleep-diary-2c917.firebasestorage.app',
  messagingSenderId: '796411304901',
  appId: '1:796411304901:web:6fe8bb6b84fb2950ffc9ac'
};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app), db=getFirestore(app);
auth.languageCode='ja';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const START='2026-09-01';
const themes={
 blue:{name:'ネイビー',accent:'#49679d',soft:'#eaf0f9',sleep:'#49679d',rest:'#a6b9d9'},
 green:{name:'セージ',accent:'#56806d',soft:'#eaf4ee',sleep:'#56806d',rest:'#accdb8'},
 lavender:{name:'ラベンダー',accent:'#7b6aab',soft:'#f1ecfa',sleep:'#7b6aab',rest:'#c2b5df'},
 rose:{name:'ローズ',accent:'#a96973',soft:'#fbf0f1',sleep:'#a96973',rest:'#e7b7be'},
 sand:{name:'サンド',accent:'#9a7955',soft:'#f7f0e7',sleep:'#9a7955',rest:'#d7c0a5'},
 gray:{name:'グレー',accent:'#586d7a',soft:'#edf2f5',sleep:'#586d7a',rest:'#b0c1cb'}
};
const blankSettings=()=>({name:'',habitBed:'23:00',habitWake:'07:00',theme:'blue'});
function dateString(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function iso(d){return dateString(d.getFullYear(),d.getMonth()+1,d.getDate())}
function time(i){return `${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`}
function idx(t){let a=(t||'00:00').split(':').map(Number);return a[0]*2+a[1]/30}
function monthParts(month){return month.split('-').map(Number)}
function weekday(y,m,d){return ['日','月','火','水','木','金','土'][new Date(y,m-1,d).getDay()]}
function nextDay(key){const d=new Date(`${key}T12:00:00`);d.setDate(d.getDate()+1);return iso(d)}
function freshDay(){return {slots:Array(48).fill(''),markers:[],wakeSleepiness:'',daySleepiness:'',note:''}}
const state={month:'2026-09',selected:iso(new Date())<START?START:iso(new Date()),settings:blankSettings(),days:{},medicines:[],loadedMonths:new Set()};
if(state.selected.slice(0,7)>= '2026-09') state.month=state.selected.slice(0,7);
let selectedMode='sleep',analysisView='daily',currentUser=null, sessionEpoch=0, deletedMedicineIds=new Set(), busy=false;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(window._toastTimer);window._toastTimer=setTimeout(()=>el.classList.remove('show'),3600)}
function notice(msg){$('#auth-notice').textContent=msg;$('#auth-notice').classList.add('show')}
function errMsg(e){
 const codes={
 'auth/invalid-credential':'メールアドレスまたはパスワードをご確認ください。',
 'auth/wrong-password':'メールアドレスまたはパスワードをご確認ください。',
 'auth/email-already-in-use':'このメールアドレスは既に登録されています。',
 'auth/invalid-email':'正しいメールアドレスを入力してください。',
 'auth/weak-password':'パスワードは6文字以上にしてください。',
 'auth/too-many-requests':'試行回数が多いため、しばらくしてからお試しください。',
 'auth/requires-recent-login':'もう一度ログインしてから操作してください。',
 'auth/unauthorized-domain':'このサイトのドメインをFirebase Authenticationの承認済みドメインに追加してください。',
 'auth/network-request-failed':'インターネット接続を確認してください。',
 'permission-denied':'保存の権限がありません。メール認証状態とFirestoreのルールを確認してください。',
 'unavailable':'通信できませんでした。接続を確認して再度お試しください。'
 };
 return codes[e?.code]||`操作に失敗しました（${e?.code||'通信エラー'}）。再度お試しください。`;
}
async function action(btn,run){if(busy)return;busy=true;const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='処理中…'}try{await run()}catch(e){console.error('睡眠日誌操作エラー',e);toast(errMsg(e))}finally{busy=false;if(btn){btn.disabled=false;btn.textContent=old}}}
function view(which){for(const name of ['auth-view','verify-view','app-view','loading-screen'])$('#'+name).classList.toggle('site-hidden',name!==which);$('#logout-button').classList.toggle('site-hidden',which!=='app-view');$('#user-indicator').classList.toggle('site-hidden',which!=='app-view')}
function userDoc(){return doc(db,'users',currentUser.uid)}
function dayRef(key){return doc(db,'users',currentUser.uid,'days',key)}
function medRef(key){return doc(db,'users',currentUser.uid,'medications',key)}
function assertSession(){if(!currentUser||!currentUser.emailVerified)throw new Error('not signed in')}
function normalDay(key){const a=state.days[key];return a?{...freshDay(),...a,slots:Array.from({length:48},(_,i)=>['sleep','rest'].includes(a.slots?.[i])?a.slots[i]:''),markers:(a.markers||[]).filter(x=>Number.isInteger(x.slot)&&x.slot>=0&&x.slot<48&&['med','bed','wake'].includes(x.type))}:freshDay()}
function dayData(key){return state.days[key]??(state.days[key]=freshDay())}
async function loadMonth(month){
 assertSession();if(state.loadedMonths.has(month))return;
 const uid=currentUser.uid;
 const q=query(collection(db,'users',uid,'days'),where(documentId(),'>=',`${month}-01`),where(documentId(),'<=',`${month}-31`));
 const snap=await getDocs(q);if(uid!==currentUser?.uid)return;
 snap.docs.forEach(d=>{state.days[d.id]={...freshDay(),...d.data()}});state.loadedMonths.add(month);
}
async function loadInitial(){
 assertSession();const uid=currentUser.uid;
 const [settingsSnap,medsSnap]=await Promise.all([getDoc(userDoc()),getDocs(collection(db,'users',uid,'medications'))]);
 if(uid!==currentUser?.uid)return;
 state.settings={...blankSettings(),...(settingsSnap.exists()?settingsSnap.data():{})};
 state.medicines=medsSnap.docs.map(d=>({id:d.id,...d.data()}));deletedMedicineIds.clear();
 state.days={};state.loadedMonths.clear();
 await loadMonth(state.month);
 applyTheme();renderChart();renderInput();renderSettings();renderAnalysis();
}
async function persistDay(key){assertSession();const item=normalDay(key);await setDoc(dayRef(key),{...item,updatedAt:serverTimestamp()});}
async function persistSettings(){assertSession();const {name,habitBed,habitWake,theme}=state.settings;await setDoc(userDoc(),{name,habitBed,habitWake,theme,updatedAt:serverTimestamp()},{merge:true});}
async function accountState(u){
 const epoch=++sessionEpoch;
 currentUser=u;
 if(!u){view('auth-view');$('#user-indicator').textContent='';return}
 view('loading-screen');
 try{await reload(u);await getIdToken(u,true)}catch(e){console.warn('refresh auth',e)}
 if(epoch!==sessionEpoch)return;
 if(!u.emailVerified){$('#verify-email-value').textContent=u.email||'';view('verify-view');return}
 try{await loadInitial();if(epoch!==sessionEpoch)return;
   $('#account-email').textContent=u.email||'';$('#user-indicator').textContent=u.email||'';view('app-view');
 }catch(e){if(epoch!==sessionEpoch)return;console.error(e);notice(errMsg(e));view('auth-view');}
}
onAuthStateChanged(auth,accountState);
async function register(){const email=$('#auth-email').value.trim(),pwd=$('#auth-password').value;if(!email||pwd.length<6){notice('メールアドレスと6文字以上のパスワードを入力してください。');return}
 await action($('#register-button'),async()=>{const {user}=await createUserWithEmailAndPassword(auth,email,pwd);await sendEmailVerification(user);notice('確認メールを送信しました。メール内のリンクで認証してください。');});}
async function login(){const email=$('#auth-email').value.trim(),pwd=$('#auth-password').value;if(!email||!pwd){notice('メールアドレスとパスワードを入力してください。');return}
 await action($('#login-button'),async()=>{await signInWithEmailAndPassword(auth,email,pwd);$('#auth-password').value='';$('#auth-notice').classList.remove('show')});}
async function passwordResetFromAuth(){const email=$('#auth-email').value.trim();if(!email){notice('先にメールアドレスを入力してください。');return}
 await action($('#reset-password-button'),async()=>{await sendPasswordResetEmail(auth,email);notice('アカウントが存在する場合、再設定用メールが送信されます。')});}
async function checkVerification(){await action($('#check-verified'),async()=>{if(!auth.currentUser)return;await reload(auth.currentUser);await getIdToken(auth.currentUser,true);if(auth.currentUser.emailVerified){await accountState(auth.currentUser);toast('メール認証が確認できました')}else toast('まだ認証を確認できません。メール内のリンクを開いてください。')});}
async function resendVerification(){if(!auth.currentUser)return;await action($('#resend-verified'),async()=>{await sendEmailVerification(auth.currentUser);toast('確認メールを送信しました')});}
async function changeEmail(){const email=$('#new-email').value.trim(),pwd=$('#reconfirm-password').value;
 if(!email||!pwd){toast('新メールアドレスと現在のパスワードを入力してください');return}
 if(email===currentUser.email){toast('現在と同じメールアドレスです');return}
 await action($('#change-email'),async()=>{
   const credential=EmailAuthProvider.credential(currentUser.email,pwd);
   await reauthenticateWithCredential(currentUser,credential);
   await verifyBeforeUpdateEmail(currentUser,email);
   $('#reconfirm-password').value='';$('#new-email').value='';
   toast('新しいメールアドレスへ確認リンクを送りました。確認後に変更されます。');
 });
}
async function passwordResetSigned(){if(!currentUser?.email)return;
 await action($('#reset-signed-password'),async()=>{await sendPasswordResetEmail(auth,currentUser.email);toast('登録メールアドレスへ再設定リンクを送信しました')});}
async function reloadEmailStatus(){if(!currentUser)return;await action($('#send-verification-settings'),async()=>{await sendEmailVerification(currentUser);toast('メール確認リンクを送信しました')});}

function applyTheme(){const t=themes[state.settings.theme]||themes.blue;for(const [key,val] of Object.entries({'--accent':t.accent,'--soft':t.soft,'--sleep':t.sleep,'--rest':t.rest}))document.documentElement.style.setProperty(key,val)}
function isHabit(i){let b=idx(state.settings.habitBed),w=idx(state.settings.habitWake);return b===w?false:b<w?i>=b&&i<w:i>=b||i<w}
function markerSVG(type){const paths={med:'<circle cx="10" cy="10" r="7.1"/><circle cx="10" cy="10" r="3.3"/>',bed:'<path d="M10 3 L17 16 H3 Z"/>',wake:'<path d="M3 4 H17 L10 17 Z"/>'};const names={med:'服薬',bed:'就寝',wake:'起床'};return paths[type]?`<svg class="marker-icon" viewBox="0 0 20 20" role="img" aria-label="${names[type]}">${paths[type]}</svg>`:''}
function printPattern(kind){
 if(kind==='sleep')return '<svg class="print-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="100" height="100" fill="var(--sleep)"/></svg>';
 if(kind==='rest')return '<svg class="print-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M-80 120 L40 -20 M-10 120 L110 -20 M60 120 L180 -20" stroke="var(--accent)" stroke-width="15" fill="none"/></svg>';
 return '';
}
function renderChart(){
 const [y,m]=monthParts(state.month),n=new Date(y,m,0).getDate();
 $('#month-label').textContent=`${y}年 ${m}月`;
 $('#print-month').textContent=`${y}年${m}月`;
 $('#print-range').textContent=`${y}年${m}月1日〜${m}月${n}日`;
 $('#print-person').textContent=state.settings.name?`氏名：${state.settings.name}`:'氏名：　　　　　　　　　';
 const medicines=state.medicines.filter(x=>x.name&&(!x.start||x.start<=dateString(y,m,n))&&(!x.end||x.end>=dateString(y,m,1)));
 $('#print-medicines').textContent=medicines.length?'服用薬・変更履歴：'+medicines.map(x=>`${x.name}（${x.start||'開始日未設定'}${x.end?'～'+x.end:''}）`).join('　／　'):'服用薬・変更履歴：記録なし';
 const head='<colgroup><col class="col-date">'+Array.from({length:48},()=>'<col class="col-slot">').join('')+'<col class="col-sleep"><col class="col-sleep"><col class="col-event"></colgroup><thead><tr><th class="date-cell">日付・曜日</th>'+Array.from({length:24},(_,h)=>{
 const rects=[isHabit(h*2),isHabit(h*2+1)].map((on,j)=>on?`<rect class="habit-shade" x="${j*50}" y="0" width="50" height="100"/><line class="habit-underbar" x1="${j*50}" y1="96" x2="${(j+1)*50}" y2="96"/>`:'').join('');
 return `<th class="h-hour" colspan="2">${rects?`<svg class="hour-accent" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`:''}<span class="hour-number">${h}</span></th>`}).join('')+'<th>目覚め<br>の眠気</th><th>日中<br>の眠気</th><th>出来事</th></tr></thead>';
 let body='';for(let d=1;d<=n;d++){
  const date=dateString(y,m,d),a=state.days[date]||freshDay(),wd=weekday(y,m,d),cl=wd==='日'?'sunday':wd==='土'?'saturday':'';
  body+=`<tr class="selectday" data-date="${date}"><td class="date-cell ${cl}">${d}（${wd}）</td>`;
  for(let i=0;i<48;i++){
   const kind=['sleep','rest'].includes(a.slots?.[i])?a.slots[i]:'',mark=(a.markers||[]).filter(x=>x.slot===i).map(x=>markerSVG(x.type)).join('');
   body+=`<td class="slot ${kind} ${i%2?'hour-end':''}" title="${date} ${time(i)}${kind?' '+(kind==='sleep'?'熟睡':'休息'):''}">${printPattern(kind)}<span class="markers">${mark}</span></td>`;
  }
  body+=`<td class="extra">${esc(a.wakeSleepiness||'')}</td><td class="extra">${esc(a.daySleepiness||'')}</td><td class="event-cell" title="${esc(a.note||'')}">${esc(a.note||'')}</td></tr>`;
 }
 $('#sleep-table').innerHTML=head+'<tbody>'+body+'</tbody>';
 $$('#sleep-table tbody tr').forEach(tr=>tr.addEventListener('click',()=>action(null,async()=>{state.selected=tr.dataset.date;await show('input')})));
}
async function monthShift(n){const [y,m]=monthParts(state.month),d=new Date(y,m-1+n,1);if(d<new Date(2026,8,1))return;const month=dateString(d.getFullYear(),d.getMonth()+1,1).slice(0,7);await loadMonth(month);state.month=month;renderChart();renderAnalysis()}
async function show(tab){if(tab==='report'||tab==='analysis')await loadMonth(state.month);if(tab==='input')await loadMonth(state.selected.slice(0,7));
 $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.screen').forEach(s=>s.classList.toggle('active',s.id===`screen-${tab}`));
 if(tab==='report')renderChart();if(tab==='input')renderInput();if(tab==='settings')renderSettings();if(tab==='analysis')await renderAnalysis();window.scrollTo({top:0,behavior:'instant'});
}
function fillTimes(){const options=Array.from({length:49},(_,i)=>`<option value="${time(i)}">${time(i)}</option>`).join('');$$('#entry-start,#entry-end,#habit-bed,#habit-wake').forEach(el=>el.innerHTML=options);$('#entry-start').value='23:00';$('#entry-end').value='23:30'}
function renderModes(){$$('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===selectedMode));$('#medicine-selector').style.display=selectedMode==='med'?'flex':'none';$('#entry-end').disabled=['med','bed','wake'].includes(selectedMode);$('#entry-help').textContent=['med','bed','wake'].includes(selectedMode)?'開始時刻のマスに記号を追加します。':'開始から終了まで記録。翌日にまたがる指定もできます。'}
function renderSleepiness(el,key){const d=dayData(state.selected);$(el).innerHTML=['無','弱','強'].map(x=>`<button type="button" class="chip ${d[key]===x?'active':''}" data-value="${x}">${x}</button>`).join('');$(el).querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const old=d[key];d[key]=b.dataset.value;action(b,async()=>{try{await persistDay(state.selected);renderSleepiness(el,key);renderChart()}catch(e){d[key]=old;throw e}})}))}
function renderInput(){if(state.selected<START)state.selected=START;$('#entry-date').value=state.selected;const a=dayData(state.selected);renderSleepiness('#wake-sleepiness','wakeSleepiness');renderSleepiness('#day-sleepiness','daySleepiness');$('#day-note').value=a.note||'';
 let meds=state.medicines.filter(m=>(!m.start||m.start<=state.selected)&&(!m.end||m.end>=state.selected));if(!meds.length)meds=state.medicines;
 $('#selected-medicine').innerHTML=meds.filter(x=>x.name).map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')+'<option value="other">その他／未設定</option>';renderModes();renderDayPreview()}
function renderDayPreview(){const a=dayData(state.selected);$('#day-duration').textContent=minutes(a,'sleep');$('#day-rest').textContent=minutes(a,'rest');$('#quicktimeline').innerHTML=Array.from({length:24},(_,h)=>{const kind=a.slots[h*2]==='sleep'||a.slots[h*2+1]==='sleep'?'sleep':a.slots[h*2]==='rest'||a.slots[h*2+1]==='rest'?'rest':'';return `<div class="${kind}" title="${h}時"></div>`}).join('');
 const sorted=(a.markers||[]).map((v,i)=>({...v,originalIndex:i})).sort((x,y)=>x.slot-y.slot);
 $('#marker-list').innerHTML=sorted.length?'<span class="muted">記号（押すと削除）：</span>'+sorted.map(x=>`<button class="marker-chip" data-i="${x.originalIndex}" title="この記号を削除">${time(x.slot)} ${{med:'◎ 服薬',bed:'△ 就寝',wake:'▽ 起床'}[x.type]} ×</button>`).join(''):'<span class="muted">記号の記録はありません</span>';
 $$('#marker-list button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{const copy=structuredClone(a);a.markers.splice(Number(b.dataset.i),1);try{await persistDay(state.selected);renderInput();renderChart();toast('記号を削除しました')}catch(e){state.days[state.selected]=copy;throw e}})));
}
function minutes(a,kind){const x=(a?.slots||[]).filter(v=>v===kind).length*30;return `${Math.floor(x/60)}時間${x%60?'30分':''}`}
async function applyEntry(){await action($('#add-entry'),async()=>{
 const date=state.selected,start=idx($('#entry-start').value),end=idx($('#entry-end').value),symbols=['med','bed','wake'].includes(selectedMode);
 if(start>=48){toast('開始時刻は24:00より前にしてください');return}if(!symbols&&start===end){toast('開始と終了は別の時刻を選択してください');return}
 const next=nextDay(date),keys=new Set([date]);if(!symbols&&end<start)keys.add(next);
 await Promise.all([...keys].map(k=>loadMonth(k.slice(0,7))));
 const backup=Object.fromEntries([...keys].map(k=>[k,structuredClone(normalDay(k))]));
 const a=dayData(date);
 if(symbols){const marker={slot:start,type:selectedMode};if(selectedMode==='med')marker.medId=$('#selected-medicine').value;a.markers.push(marker)}
 else{for(let i=start;i<(end>start?end:48);i++)a.slots[i]=selectedMode==='erase'?'':selectedMode;if(end<start){let b=dayData(next);for(let i=0;i<end;i++)b.slots[i]=selectedMode==='erase'?'':selectedMode}}
 try{const batch=writeBatch(db);for(const k of keys)batch.set(dayRef(k),{...normalDay(k),updatedAt:serverTimestamp()});await batch.commit();renderDayPreview();renderChart();toast('記録を保存しました')}
 catch(e){for(const [key,value] of Object.entries(backup))state.days[key]=value;renderInput();throw e}
 });}
async function saveDay(){await action($('#save-day'),async()=>{const a=dayData(state.selected),before=structuredClone(a);a.note=$('#day-note').value.slice(0,500);try{await persistDay(state.selected);renderDayPreview();renderChart();toast('眠気・出来事を保存しました')}catch(e){state.days[state.selected]=before;throw e}})}
function sumFor(days){let s=0,r=0,recorded=0,wake={'無':0,'弱':0,'強':0},day={'無':0,'弱':0,'強':0};for(const key of days){const a=state.days[key];if(!a)continue;const sn=(a.slots||[]).filter(v=>v==='sleep').length*30,rn=(a.slots||[]).filter(v=>v==='rest').length*30;if(sn||rn||(a.markers||[]).length||a.note||a.wakeSleepiness||a.daySleepiness){recorded++;s+=sn;r+=rn;if(a.wakeSleepiness)wake[a.wakeSleepiness]=(wake[a.wakeSleepiness]||0)+1;if(a.daySleepiness)day[a.daySleepiness]=(day[a.daySleepiness]||0)+1}}return {s,r,recorded,wake,day}}
function getRange(){const dt=new Date(state.selected+'T12:00:00');let out=[];if(analysisView==='daily')return[state.selected];if(analysisView==='weekly'){const start=new Date(dt);start.setDate(dt.getDate()-6);for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);if(iso(d)>=START)out.push(iso(d))}return out}const [y,m]=monthParts(state.month),n=new Date(y,m,0).getDate();for(let d=1;d<=n;d++)out.push(dateString(y,m,d));return out}
async function renderAnalysis(){const days=getRange();if(currentUser?.emailVerified){const months=[...new Set(days.map(k=>k.slice(0,7)))];await Promise.all(months.map(loadMonth))}
 $$('#analysis-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===analysisView));const s=sumFor(days),fmt=min=>`${Math.floor(min/60)}時間${min%60?`${min%60}分`:''}`;
 const stats=[['記録した睡眠 合計',fmt(s.s),'自分で「熟睡」とした時間'],['休息 合計',fmt(s.r),'起きて布団の中にいた時間'],['記録のある日',`${s.recorded}日`,'対象期間内の登録'],['記録日の平均睡眠',s.recorded?fmt(Math.round(s.s/s.recorded/30)*30):'—','記録のある日で計算']];
 $('#analysis-stats').innerHTML=stats.map(x=>`<div class="statbox"><small>${x[0]}</small><strong>${x[1]}</strong><p>${x[2]}</p></div>`).join('');$('#analysis-title').textContent=analysisView==='daily'?`${state.selected} の記録`:analysisView==='weekly'?'直近7日間の睡眠記録':`${state.month.replace('-','年')}月の睡眠記録`;
 $('#analysis-bars').innerHTML=days.map(k=>{const a=state.days[k],v=(a?.slots||[]).filter(x=>x==='sleep').length*30;return `<div class="baritem"><div>${k.slice(5)}</div><div class="barbg"><div class="barvalue" style="width:${Math.min(100,v/1440*100)}%"></div></div><strong>${a?fmt(v):'未入力'}</strong></div>`}).join('')||'<span class="muted">まだ記録がありません</span>';
}
function renderSettings(){applyTheme();$('#display-name').value=state.settings.name||'';$('#habit-bed').value=state.settings.habitBed||'23:00';$('#habit-wake').value=state.settings.habitWake||'07:00';$('#account-email').textContent=currentUser?.email||'—';$('#theme-choices').innerHTML=Object.entries(themes).map(([id,t])=>`<button class="theme-choice ${state.settings.theme===id?'active':''}" data-id="${id}"><i class="color-dot" style="background:${t.accent}"></i>${t.name}</button>`).join('');$$('#theme-choices button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{const old=state.settings.theme;state.settings.theme=b.dataset.id;applyTheme();try{await setDoc(userDoc(),{theme:state.settings.theme,updatedAt:serverTimestamp()},{merge:true});renderSettings();renderChart()}catch(e){state.settings.theme=old;applyTheme();renderSettings();throw e}})));renderMedicineRows()}
function syncMedicineInputs(){for(const row of $$('#medicine-rows .medicine-row')){const m=state.medicines.find(m=>m.id===row.dataset.id);if(m)row.querySelectorAll('input').forEach(i=>{m[i.dataset.key]=i.value})}}
function renderMedicineRows(){const ms=state.medicines;$('#medicine-rows').innerHTML=ms.length?ms.map(m=>`<div class="medicine-row" data-id="${esc(m.id)}"><input aria-label="薬の名前" type="text" maxlength="80" data-key="name" value="${esc(m.name||'')}" placeholder="薬の名前"><input aria-label="服用開始日" type="date" data-key="start" value="${esc(m.start||'')}"><input aria-label="服用終了日" type="date" data-key="end" value="${esc(m.end||'')}"><button class="btn small danger" title="薬の行を削除" data-remove="${esc(m.id)}">×</button></div>`).join(''):'<span class="muted">まだ薬がありません。「＋ 薬を追加」から登録できます。</span>';
 $$('#medicine-rows button[data-remove]').forEach(b=>b.addEventListener('click',()=>{syncMedicineInputs();deletedMedicineIds.add(b.dataset.remove);state.medicines=state.medicines.filter(m=>m.id!==b.dataset.remove);renderMedicineRows()}))}
async function saveSettings(){await action($('#save-settings'),async()=>{
 syncMedicineInputs();const newSettings={name:$('#display-name').value.trim().slice(0,60),habitBed:$('#habit-bed').value,habitWake:$('#habit-wake').value,theme:state.settings.theme};
 if(newSettings.habitBed===newSettings.habitWake){toast('通常の就寝時刻と起床時刻は異なる時刻を選んでください');return}
 if(state.medicines.some(m=>m.start&&m.end&&m.start>m.end)){toast('薬の終了日は開始日以降にしてください');return}
 const batch=writeBatch(db);batch.set(userDoc(),{...newSettings,updatedAt:serverTimestamp()},{merge:true});
 for(const m of state.medicines){if(!m.name.trim()){toast('薬の名称を入力するか、未記入の薬を削除してください');return}batch.set(medRef(m.id),{name:m.name.trim().slice(0,80),start:m.start||'',end:m.end||'',updatedAt:serverTimestamp()})}
 for(const id of deletedMedicineIds)batch.delete(medRef(id));await batch.commit();state.settings={...state.settings,...newSettings};deletedMedicineIds.clear();renderSettings();renderChart();renderInput();toast('設定・服用薬情報を保存しました')
 });}
function makeId(){return 'med-'+(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2,10)}`)}
// 認証
$('#register-button').addEventListener('click',register);$('#login-button').addEventListener('click',login);$('#reset-password-button').addEventListener('click',passwordResetFromAuth);
$('#auth-password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('#check-verified').addEventListener('click',checkVerification);$('#resend-verified').addEventListener('click',resendVerification);
$('#logout-button').addEventListener('click',()=>action($('#logout-button'),()=>signOut(auth)));
$('#verify-logout').addEventListener('click',()=>action($('#verify-logout'),()=>signOut(auth)));
$('#change-email').addEventListener('click',changeEmail);$('#reset-signed-password').addEventListener('click',passwordResetSigned);$('#send-verification-settings').addEventListener('click',reloadEmailStatus);
// 日誌
fillTimes();$$('.tab').forEach(b=>b.addEventListener('click',()=>action(null,()=>show(b.dataset.tab))));
$('#prev-month').addEventListener('click',()=>action($('#prev-month'),()=>monthShift(-1)));$('#next-month').addEventListener('click',()=>action($('#next-month'),()=>monthShift(1)));
$('#to-input').addEventListener('click',()=>action(null,()=>show('input')));$('#back-to-chart').addEventListener('click',()=>action(null,()=>show('report')));
$('#print-button').addEventListener('click',()=>{renderChart();window.print()});
$$('.mode').forEach(b=>b.addEventListener('click',()=>{selectedMode=b.dataset.mode;renderModes()}));
$('#entry-date').addEventListener('change',e=>{const val=e.target.value;if(val<START){toast('2026年9月1日以降を指定してください');e.target.value=state.selected;return}action(null,async()=>{await loadMonth(val.slice(0,7));state.selected=val;state.month=val.slice(0,7);renderInput();renderChart()})});
$('#add-entry').addEventListener('click',applyEntry);$('#save-day').addEventListener('click',saveDay);
$$('#analysis-tabs button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{analysisView=b.dataset.view;await renderAnalysis()})));
$('#save-settings').addEventListener('click',saveSettings);$('#add-medicine').addEventListener('click',()=>{syncMedicineInputs();state.medicines.push({id:makeId(),name:'',start:state.selected,end:''});renderMedicineRows()});
// 表を初期状態で表示するのはログイン＆確認済み後のみ。デモデータは入れない。
