/** 睡眠日誌 v1.2.3 (2026-11-04) | © 2021–2026 Dobhar-chú
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
  query, where, documentId, orderBy, limit, writeBatch, serverTimestamp
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
const EARLIEST='1900-01-01'; // UIの年月制限ではなく、入力の妥当性を確認するための技術的下限

const themes={
 blue:{name:'ネイビー',accent:'#49679d',soft:'#eaf0f9',sleep:'#49679d',rest:'#a6b9d9'},
 green:{name:'セージ',accent:'#56806d',soft:'#eaf4ee',sleep:'#56806d',rest:'#accdb8'},
 lavender:{name:'ラベンダー',accent:'#7b6aab',soft:'#f1ecfa',sleep:'#7b6aab',rest:'#c2b5df'},
 rose:{name:'ローズ',accent:'#a96973',soft:'#fbf0f1',sleep:'#a96973',rest:'#e7b7be'},
 sand:{name:'サンド',accent:'#9a7955',soft:'#f7f0e7',sleep:'#9a7955',rest:'#d7c0a5'},
 gray:{name:'グレー',accent:'#586d7a',soft:'#edf2f5',sleep:'#586d7a',rest:'#b0c1cb'},
 ocean:{name:'クリアブルー',accent:'#1757a6',soft:'#eaf4ff',sleep:'#1757a6',rest:'#96bee8'},
 teal:{name:'ティール',accent:'#006b66',soft:'#e6f7f4',sleep:'#006b66',rest:'#89c4bc'},
 plum:{name:'プラム',accent:'#6e3f87',soft:'#f6edfa',sleep:'#6e3f87',rest:'#c0a3d0'},
 orange:{name:'ウォームオレンジ',accent:'#98520b',soft:'#fff3e4',sleep:'#98520b',rest:'#e3b480'},
 sky:{name:'スカイ',accent:'#17648e',soft:'#ecf9ff',sleep:'#17648e',rest:'#9bcbe5'},
 monochrome:{name:'モノクロ',accent:'#333d48',soft:'#f0f2f4',sleep:'#333d48',rest:'#bac0c6'}
};
const blankSettings=()=>({name:'',habitBed:'23:00',habitWake:'07:00',theme:'blue',firstMonth:''});
function dateString(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function iso(d){return dateString(d.getFullYear(),d.getMonth()+1,d.getDate())}
function time(i){return `${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`}
function idx(t){let a=(t||'00:00').split(':').map(Number);return a[0]*2+a[1]/30}
function monthParts(month){return month.split('-').map(Number)}
function weekday(y,m,d){return ['日','月','火','水','木','金','土'][new Date(y,m-1,d).getDay()]}
function nextDay(key){const d=new Date(`${key}T12:00:00`);d.setDate(d.getDate()+1);return iso(d)}
function freshDay(){return {slots:Array(48).fill(''),markers:[],wakeSleepiness:'',daySleepiness:'',note:'',weight:null}}
// 内閣府公表の2026・2027年の祝日・休日。2028年以降は将来の変更により更新が必要。
const publishedHolidays={
 2026:'01-01 01-12 02-11 02-23 03-20 04-29 05-03 05-04 05-05 05-06 07-20 08-11 09-21 09-22 09-23 10-12 11-03 11-23',
 2027:'01-01 01-11 02-11 02-23 03-21 03-22 04-29 05-03 05-04 05-05 07-19 08-11 09-20 09-23 10-11 11-03 11-23'
};
const holidayCache=new Map();
function nthMonday(y,m,n){const dow=new Date(y,m-1,1).getDay();return 1+(8-dow)%7+7*(n-1)}
function approximateEquinox(y,spring){return Math.floor((spring?20.8431:23.2488)+0.242194*(y-1980)-Math.floor((y-1980)/4))}
function japaneseHolidays(y){
 if(holidayCache.has(y))return holidayCache.get(y);
 let dates=new Set();const add=(m,d)=>dates.add(dateString(y,m,d));
 if(publishedHolidays[y])publishedHolidays[y].split(' ').forEach(x=>dates.add(`${y}-${x}`));
 else if(y>=2000&&y<=2099){
  add(1,1);add(1,nthMonday(y,1,2));add(2,11);
  if(y>=2020)add(2,23);else if(y<=2018)add(12,23);
  add(3,approximateEquinox(y,true));add(4,29);add(5,3);add(5,4);add(5,5);
  add(7,nthMonday(y,7,3));if(y>=2016)add(8,11);add(9,nthMonday(y,9,3));add(9,approximateEquinox(y,false));
  add(10,nthMonday(y,10,2));add(11,3);add(11,23);
  // 東京五輪の特別日程（2020・2021年）
  if(y===2020){['07-20','10-12','08-11'].forEach(x=>dates.delete(`${y}-${x}`));['07-23','07-24','08-10'].forEach(x=>dates.add(`${y}-${x}`));}
  if(y===2021){['07-19','10-11','08-11'].forEach(x=>dates.delete(`${y}-${x}`));['07-22','07-23','08-08'].forEach(x=>dates.add(`${y}-${x}`));}
  // 国民の休日：祝日に挟まれた平日（国民の祝日ではない休日）
  for(let i=2;i<=365;i++){let dt=new Date(y,0,i);if(dt.getFullYear()!==y)break;const k=iso(dt);if(dates.has(k))continue;
   const before=new Date(dt);before.setDate(before.getDate()-1);const after=new Date(dt);after.setDate(after.getDate()+1);
   if(dates.has(iso(before))&&dates.has(iso(after))&&dt.getDay()!==0)dates.add(k);
  }
  // 振替休日。前の祝日と重ならない最初の日へ繰り下げる。
  const originals=[...dates].sort();for(const key of originals){const dt=new Date(`${key}T12:00:00`);if(dt.getDay()!==0)continue;
    dt.setDate(dt.getDate()+1);while(dates.has(iso(dt)))dt.setDate(dt.getDate()+1);if(dt.getFullYear()===y)dates.add(iso(dt));
  }
 }
 holidayCache.set(y,dates);return dates;
}
function isJapaneseHoliday(key){return japaneseHolidays(Number(key.slice(0,4))).has(key)}

// 服薬時刻（◎）と薬・サプリの登録情報は独立して保存します。
const doseValues=new Set([0.5,1,2,3,4,5,6,7,8]);
const medicineTimings=['毎食前','朝食前','昼食前','夕食前','毎食直前','朝食直前','昼食直前','夕食直前','毎食後','朝食後','昼食後','夕食後','毎食直後','朝食直後','昼食直後','夕食直後','毎食間','朝昼の間','昼夕の間','起床時','就寝前','頓服（必要なとき）','時刻指定','一定時間ごと','その他'];

const state={month:iso(new Date()).slice(0,7),selected:iso(new Date()),settings:blankSettings(),days:{},medicines:[],loadedMonths:new Set()};
let selectedMode='sleep',analysisView='daily',analysisTarget='both',analysisMonth=iso(new Date()).slice(0,7),analysisDay=state.selected,analysisWeek='',analysisViewportKey='',weekBoundsCached=false,weekBoundsReliable=false,earliestRecordDate='',latestRecordDate='',currentUser=null, sessionEpoch=0, medFilter='active', busy=false, verifyTimer=null, checkingVerification=false;
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
 'auth/unauthorized-domain':'現在ログインできません。運営者へお問い合わせください。',
 'auth/network-request-failed':'インターネット接続を確認してください。',
 'permission-denied':'記録の保存ができませんでした。ログイン状態をご確認ください。',
 'unavailable':'通信できませんでした。接続を確認して再度お試しください。'
 };
 return codes[e?.code]||'操作を完了できませんでした。再度お試しください。';
}
async function action(btn,run){if(busy)return;busy=true;const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='処理中…'}try{await run()}catch(e){console.error('睡眠日誌操作エラー',e);toast(errMsg(e))}finally{busy=false;if(btn){btn.disabled=false;btn.textContent=old}}}
function view(which){if(which==='verify-view')startAutoVerification();else stopAutoVerification();for(const name of ['auth-view','verify-view','app-view','loading-screen'])$('#'+name).classList.toggle('site-hidden',name!==which);$('#logout-button').classList.toggle('site-hidden',which!=='app-view')}
// 外部ブラウザや別端末で認証しても、開いているアプリが自動検知する。
function stopAutoVerification(){if(verifyTimer){clearInterval(verifyTimer);verifyTimer=null}}
function startAutoVerification(){stopAutoVerification();verifyTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshVerificationSilently()},4500)}
async function refreshVerificationSilently(){
 if(checkingVerification || !auth.currentUser || $('#verify-view').classList.contains('site-hidden'))return;
 checkingVerification=true;
 try{await reload(auth.currentUser);await getIdToken(auth.currentUser,true);
   if(auth.currentUser.emailVerified){stopAutoVerification();await accountState(auth.currentUser);toast('メール認証が完了しました')}}
 catch(e){console.warn('メール認証自動確認',e)}
 finally{checkingVerification=false}
}
window.addEventListener('focus',()=>{refreshVerificationSilently()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshVerificationSilently()});
function userDoc(){return doc(db,'users',currentUser.uid)}
function dayRef(key){return doc(db,'users',currentUser.uid,'days',key)}
function medRef(key){return doc(db,'users',currentUser.uid,'medications',key)}
function assertSession(){if(!currentUser||!currentUser.emailVerified)throw new Error('not signed in')}
function normalDay(key){const a=state.days[key];return a?{...freshDay(),...a,weight:validWeight(a.weight),slots:Array.from({length:48},(_,i)=>['sleep','rest'].includes(a.slots?.[i])?a.slots[i]:''),markers:(a.markers||[]).filter(x=>Number.isInteger(x.slot)&&x.slot>=0&&x.slot<48&&['med','bed','wake','meal'].includes(x.type))}:freshDay()}
function validWeight(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0.1&&v<=500&&Math.abs(v*10-Math.round(v*10))<0.00001?Math.round(v*10)/10:null}
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
 // 月間睡眠表の初期表示は必ず開いた日の当月とする。保存済み初期月の指定は参照しない。
 state.month=iso(new Date()).slice(0,7);
 state.medicines=medsSnap.docs.map(d=>({id:d.id,...d.data()}));
 state.days={};state.loadedMonths.clear();
 weekBoundsCached=false;weekBoundsReliable=false;earliestRecordDate='';latestRecordDate='';
 await loadMonth(state.month);
 const today=iso(new Date());analysisMonth=today.slice(0,7);analysisDay=today;analysisWeek=weekStart(today);analysisViewportKey='';
 applyTheme();renderChart();renderInput();renderSettings();await renderAnalysis();
}
async function persistDay(key){assertSession();const item=normalDay(key);await setDoc(dayRef(key),{...item,updatedAt:serverTimestamp()});
 if(weekBoundsCached){if(!earliestRecordDate||key<earliestRecordDate)earliestRecordDate=key;if(!latestRecordDate||key>latestRecordDate)latestRecordDate=key}
}
async function persistSettings(){assertSession();const {name,habitBed,habitWake,theme,firstMonth}=state.settings;await setDoc(userDoc(),{name,habitBed,habitWake,theme,firstMonth,updatedAt:serverTimestamp()},{merge:true});}
async function accountState(u){
 const epoch=++sessionEpoch;
 currentUser=u;
 if(!u){view('auth-view');return}
 view('loading-screen');
 try{await reload(u);await getIdToken(u,true)}catch(e){console.warn('refresh auth',e)}
 if(epoch!==sessionEpoch)return;
 if(!u.emailVerified){$('#verify-email-value').textContent=u.email||'';view('verify-view');return}
 try{await loadInitial();if(epoch!==sessionEpoch)return;
   $('#account-email').textContent=u.email||'';view('app-view');
 }catch(e){if(epoch!==sessionEpoch)return;console.error(e);notice(errMsg(e));view('auth-view');}
}
onAuthStateChanged(auth,accountState);
function verificationActionSettings(){return {url:window.location.origin+window.location.pathname,handleCodeInApp:false}}
async function register(){const email=$('#auth-email').value.trim(),pwd=$('#auth-password').value;if(!email||pwd.length<6){notice('メールアドレスと6文字以上のパスワードを入力してください。');return}
 await action($('#register-button'),async()=>{const {user}=await createUserWithEmailAndPassword(auth,email,pwd);await sendEmailVerification(user,verificationActionSettings());notice('確認メールを送信しました。メール内のリンクで認証してください。');});}
async function login(){const email=$('#auth-email').value.trim(),pwd=$('#auth-password').value;if(!email||!pwd){notice('メールアドレスとパスワードを入力してください。');return}
 await action($('#login-button'),async()=>{await signInWithEmailAndPassword(auth,email,pwd);$('#auth-password').value='';$('#auth-notice').classList.remove('show')});}
async function passwordResetFromAuth(){const email=$('#auth-email').value.trim();if(!email){notice('先にメールアドレスを入力してください。');return}
 await action($('#reset-password-button'),async()=>{await sendPasswordResetEmail(auth,email);notice('アカウントが存在する場合、再設定用メールが送信されます。')});}
async function resendVerification(){if(!auth.currentUser)return;await action($('#resend-verified'),async()=>{await sendEmailVerification(auth.currentUser,verificationActionSettings());toast('確認メールを送信しました')});}
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
async function reloadEmailStatus(){if(!currentUser)return;await action($('#send-verification-settings'),async()=>{await sendEmailVerification(currentUser,verificationActionSettings());toast('メール確認リンクを送信しました')});}

function applyTheme(){const t=themes[state.settings.theme]||themes.blue;for(const [key,val] of Object.entries({'--accent':t.accent,'--soft':t.soft,'--sleep':t.sleep,'--rest':t.rest}))document.documentElement.style.setProperty(key,val)}
function isHabit(i){let b=idx(state.settings.habitBed),w=idx(state.settings.habitWake);return b===w?false:b<w?i>=b&&i<w:i>=b||i<w}
function markerSVG(type){const paths={med:'<circle cx="10" cy="10" r="7.1"/><circle cx="10" cy="10" r="3.3"/>',bed:'<path d="M3 4 H17 L10 17 Z"/>',wake:'<path d="M10 3 L17 16 H3 Z"/>',meal:'<rect x="3" y="3" width="14" height="14"/>'};const names={med:'服薬',bed:'就寝',wake:'起床',meal:'食事'};return paths[type]?`<svg class="marker-icon" viewBox="0 0 20 20" role="img" aria-label="${names[type]}">${paths[type]}</svg>`:''}
function printPattern(kind){
 if(kind==='sleep')return '<svg class="print-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="100" height="100" fill="var(--sleep)"/></svg>';
 if(kind==='rest')return '<svg class="print-glyph rest-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M9 91 L91 9" stroke="#27313d" stroke-width="14" stroke-linecap="butt" fill="none"/></svg>';
 return '';
}
function renderChart(){
 const [y,m]=monthParts(state.month),n=new Date(y,m,0).getDate();
 $('#month-label').textContent=`${y}年 ${m}月`;
 $('#print-month').textContent=`${y}年${m}月`;
 $('#print-range').textContent=`${y}年${m}月1日〜${m}月${n}日`;
 $('#print-person').textContent=state.settings.name?`氏名：${state.settings.name}`:'氏名：　　　　　　　　　';
  const head='<colgroup><col class="col-date">'+Array.from({length:48},()=>'<col class="col-slot">').join('')+'<col class="col-sleep"><col class="col-sleep"><col class="col-weight"><col class="col-event"></colgroup><thead><tr><th class="date-cell">日付・曜日</th>'+Array.from({length:24},(_,h)=>{
 const rects=[isHabit(h*2),isHabit(h*2+1)].map((on,j)=>on?`<rect class="habit-shade" x="${j*50}" y="0" width="50" height="100"/><line class="habit-underbar" x1="${j*50}" y1="96" x2="${(j+1)*50}" y2="96"/>`:'').join('');
 return `<th class="h-hour" colspan="2">${rects?`<svg class="hour-accent" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`:''}<span class="hour-number">${h}</span></th>`}).join('')+'<th class="sleepiness-head">目覚めの眠気</th><th class="sleepiness-head">日中の眠気</th><th class="weight-head">体重<br>(kg)</th><th class="event-head">出来事</th></tr></thead>';
 let body='';for(let d=1;d<=n;d++){
  const date=dateString(y,m,d),a=state.days[date]||freshDay(),wd=weekday(y,m,d),cl=isJapaneseHoliday(date)||wd==='日'?'sunday':wd==='土'?'saturday':'';
  body+=`<tr class="selectday" data-date="${date}"><td class="date-cell ${cl}">${d}（${wd}）</td>`;
  for(let i=0;i<48;i++){
   const kind=['sleep','rest'].includes(a.slots?.[i])?a.slots[i]:'',matches=(a.markers||[]).filter(x=>x.slot===i),mark=matches.map(x=>markerSVG(x.type)).join(''),details=matches.map(x=>x.type==='med'?'◎ 服薬':{bed:'▽ 就寝',wake:'△ 起床',meal:'□ 食事'}[x.type]).filter(Boolean).join('、');
   body+=`<td class="slot ${kind} ${i%2?'hour-end':''}" title="${date} ${time(i)}${kind?' '+(kind==='sleep'?'熟睡':'休息'):''}${details?' '+esc(details):''}">${printPattern(kind)}<span class="markers">${mark}</span></td>`;
  }
  body+=`<td class="extra">${esc(a.wakeSleepiness||'')}</td><td class="extra">${esc(a.daySleepiness||'')}</td><td class="weight-cell">${validWeight(a.weight)===null?'':validWeight(a.weight).toFixed(1)}</td><td class="event-cell" title="${esc(a.note||'')}">${esc(a.note||'')}</td></tr>`;
 }
 $('#sleep-table').innerHTML=head+'<tbody>'+body+'</tbody>';
 $$('#sleep-table tbody tr').forEach(tr=>tr.addEventListener('click',()=>action(null,async()=>{state.selected=tr.dataset.date;await show('input')})));
}
async function jumpMonth(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){toast('年月を正しく指定してください');return}await loadMonth(month);state.month=month;renderChart();await renderAnalysis()}
async function monthShift(n){const [y,m]=monthParts(state.month),d=new Date(y,m-1+n,1);await jumpMonth(dateString(d.getFullYear(),d.getMonth()+1,1).slice(0,7))}
async function show(tab){
 if(tab==='report'){
  // 月間睡眠表を開くたびに当月へ戻す。画面内の前月／翌月操作は維持する。
  const currentMonth=iso(new Date()).slice(0,7);
  await loadMonth(currentMonth);
  state.month=currentMonth;
 }
 if(tab==='input')await loadMonth(state.selected.slice(0,7));
 if(tab==='analysis'){
  // 分析画面を開くたびに当日・当月・当日を含む日曜始まりの週へ戻す。
  const today=iso(new Date());analysisDay=today;analysisMonth=today.slice(0,7);analysisWeek=weekStart(today);analysisViewportKey='';
 }
 $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.screen').forEach(s=>s.classList.toggle('active',s.id===`screen-${tab}`));
 if(tab==='report')renderChart();if(tab==='input')renderInput();if(tab==='settings')renderSettings();if(tab==='medicines'){renderMedicineList();resetMedicineForm();showMedicinePanel('list')}if(tab==='analysis')await renderAnalysis();window.scrollTo({top:0,behavior:'instant'});
}
function fillTimes(){const options=Array.from({length:49},(_,i)=>`<option value="${time(i)}">${time(i)}</option>`).join('');$$('#entry-start,#entry-end,#habit-bed,#habit-wake').forEach(el=>el.innerHTML=options);$('#entry-start').value='23:00';$('#entry-end').value='23:30'}
function renderModes(){
 $$('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===selectedMode));
 const single=['med','bed','wake','meal'].includes(selectedMode);
 $('#entry-end-field').classList.toggle('site-hidden',single);
 $('#entry-time-row').classList.toggle('single-time',single);
 $('#entry-start-label').textContent=single?'時刻':'開始時刻';
 $('#entry-end').disabled=single;
 $('#entry-help').textContent=single?'指定した時刻に記号を付けます。':selectedMode==='erase'?'選択した範囲の熟睡・休息・◎服薬・▽就寝・△起床・□食事を消去します。同じ時刻なら30分枠を消去します。':'開始から終了まで記録します。翌日にまたがる指定もできます。';
}
function renderSleepiness(el,key){const d=dayData(state.selected);$(el).innerHTML=['無','弱','強'].map(x=>`<button type="button" class="chip ${d[key]===x?'active':''}" data-value="${x}">${x}</button>`).join('');$(el).querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const old=d[key];d[key]=b.dataset.value;action(b,async()=>{try{await persistDay(state.selected);renderSleepiness(el,key);renderDayPreview();renderChart()}catch(e){d[key]=old;throw e}})}))}
function renderInput(){$('#entry-date').value=state.selected;updateDatePickerButtons();const a=dayData(state.selected);renderSleepiness('#wake-sleepiness','wakeSleepiness');renderSleepiness('#day-sleepiness','daySleepiness');$('#day-note').value=a.note||'';$('#day-weight').value=validWeight(a.weight)===null?'':validWeight(a.weight).toFixed(1);
 renderModes();renderDayPreview()}
function rangesForDay(a,kind){
 const result=[];let start=-1;
 for(let i=0;i<=48;i++){
  const match=i<48&&a.slots[i]===kind;
  if(match&&start<0)start=i;
  if(!match&&start>=0){result.push(`${time(start)}〜${time(i)}`);start=-1;}
 }
 return result;
}
function renderDayPreview(){
 const a=dayData(state.selected);
 $('#day-duration').textContent=minutes(a,'sleep');$('#day-rest').textContent=minutes(a,'rest');
 $('#quicktimeline').innerHTML=Array.from({length:48},(_,i)=>{
  const kind=['sleep','rest'].includes(a.slots[i])?a.slots[i]:'';
  const slotMarkers=(a.markers||[]).filter(x=>x.slot===i),symbols=slotMarkers.map(x=>markerSVG(x.type)).join('');
  return `<div class="quick-slot ${kind}" title="${time(i)} ${kind==='sleep'?'熟睡':kind==='rest'?'休息':''}">${printPattern(kind)}<span class="markers">${symbols}</span></div>`
 }).join('');
 const sorted=(a.markers||[]).map((v,i)=>({...v,originalIndex:i})).sort((x,y)=>x.slot-y.slot);
 $('#marker-list').innerHTML=sorted.length?'<span class="muted">記号（押すと削除）：</span>'+sorted.map(x=>`<button class="marker-chip" data-i="${x.originalIndex}" title="この記号を削除">${time(x.slot)} ${{med:'◎ 服薬',bed:'▽ 就寝',wake:'△ 起床',meal:'□ 食事'}[x.type]} ×</button>`).join(''):'<span class="muted">記号の記録はありません</span>';
 const summary=[];
 const sleeps=rangesForDay(a,'sleep'), rests=rangesForDay(a,'rest');
 if(sleeps.length)summary.push(['熟睡',sleeps.join('、')]);
 if(rests.length)summary.push(['休息',rests.join('、')]);
 if(a.wakeSleepiness)summary.push(['目覚めの眠気',a.wakeSleepiness]);
 if(a.daySleepiness)summary.push(['日中の眠気',a.daySleepiness]);
 if(validWeight(a.weight)!==null)summary.push(['体重',`${validWeight(a.weight).toFixed(1)} kg`]);
 if(a.note)summary.push(['出来事',a.note]);
 $('#daily-summary').innerHTML=summary.length?summary.map(([label,value])=>`<div class="summary-line"><strong>${esc(label)}</strong><span>${esc(value)}</span></div>`).join(''):'<div class="muted">この日の記録はまだありません。</div>';
 $$('#marker-list button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{const copy=structuredClone(a);a.markers.splice(Number(b.dataset.i),1);try{await persistDay(state.selected);renderInput();renderChart();toast('記号を削除しました')}catch(e){state.days[state.selected]=copy;throw e}})));
}
function minutes(a,kind){const x=(a?.slots||[]).filter(v=>v===kind).length*30;return `${Math.floor(x/60)}時間${x%60?'30分':''}`}
// 選択時間に含まれる記録を、塗りつぶしと記号の両方から消去する。
// 30分枠 [from,to) 単位。範囲外の記録・眠気・出来事は変更しない。
function eraseTimedEntries(day,from,to){
 for(let i=from;i<to;i++)day.slots[i]='';
 day.markers=(day.markers||[]).filter(m=>!(m.slot>=from&&m.slot<to));
}
async function applyEntry(){await action($('#add-entry'),async()=>{
 const date=state.selected,start=idx($('#entry-start').value),requestedEnd=idx($('#entry-end').value);
 const symbols=['med','bed','wake','meal'].includes(selectedMode),erasing=selectedMode==='erase';
 if(!Number.isInteger(start)||start<0||start>=48){toast('開始時刻は00:00〜23:30を選んでください');return}
 if(!Number.isInteger(requestedEnd)||requestedEnd<0||requestedEnd>48){toast('終了時刻を確認してください');return}
 if(!symbols&&!erasing&&start===requestedEnd){toast('開始と終了は別の時刻を選択してください');return}
 // 消去時に同じ時刻を選択した場合は、その30分マスだけ消去する。
 const end=erasing&&start===requestedEnd?start+1:requestedEnd;
 const next=nextDay(date),keys=new Set([date]);
 if(!symbols&&end<start)keys.add(next);
 await Promise.all([...keys].map(k=>loadMonth(k.slice(0,7))));
 const backup=Object.fromEntries([...keys].map(k=>[k,structuredClone(normalDay(k))]));
 const a=dayData(date);
 if(symbols){
  const marker={slot:start,type:selectedMode};
  // 服薬記録は時刻のみ。既存の薬の登録情報や錠数に依存させない。
  if(a.markers.some(x=>x.slot===start&&x.type===selectedMode)){toast('この時刻には既に同じ記号があります');return}
  a.markers.push(marker);
 }else if(erasing){
  eraseTimedEntries(a,start,end>start?end:48);
  if(end<start)eraseTimedEntries(dayData(next),0,end);
 }else{
  for(let i=start;i<(end>start?end:48);i++)a.slots[i]=selectedMode;
  if(end<start){let b=dayData(next);for(let i=0;i<end;i++)b.slots[i]=selectedMode}
 }
 try{
  const batch=writeBatch(db);
  for(const k of keys)batch.set(dayRef(k),{...normalDay(k),updatedAt:serverTimestamp()});
  await batch.commit();
  renderInput();renderChart();
  toast(erasing?'選択範囲の時間記録・記号を消去しました':'記録を保存しました');
 }catch(e){for(const [key,value] of Object.entries(backup))state.days[key]=value;renderInput();throw e}
});}
async function saveDay(){await action($('#save-day'),async()=>{
 const input=$('#day-weight'),raw=input.value.trim();
 if(raw!==''&&(!/^(?:\d+)(?:\.\d)?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)<0.1||Number(raw)>500)){
  toast('体重は0.1〜500.0kgの範囲で小数第1位まで入力してください');input.focus();return;
 }
 const a=dayData(state.selected),before=structuredClone(a);
 a.weight=raw===''?null:validWeight(Number(raw));
 a.note=$('#day-note').value.slice(0,500);
 try{await persistDay(state.selected);renderDayPreview();renderChart();await renderAnalysis();toast('体重・眠気・出来事を保存しました')}
 catch(e){state.days[state.selected]=before;renderInput();throw e}
});}
function sumFor(days){let s=0,r=0,recorded=0,sleepRecorded=0,weights=[],wake={'無':0,'弱':0,'強':0},day={'無':0,'弱':0,'強':0};for(const key of days){const a=state.days[key];if(!a)continue;const sn=(a.slots||[]).filter(v=>v==='sleep').length*30,rn=(a.slots||[]).filter(v=>v==='rest').length*30;if(sn||rn)sleepRecorded++;if(validWeight(a.weight)!==null)weights.push({date:key,value:validWeight(a.weight)});if(sn||rn||(a.markers||[]).length||a.note||a.wakeSleepiness||a.daySleepiness||validWeight(a.weight)!==null){recorded++;s+=sn;r+=rn;if(a.wakeSleepiness)wake[a.wakeSleepiness]=(wake[a.wakeSleepiness]||0)+1;if(a.daySleepiness)day[a.daySleepiness]=(day[a.daySleepiness]||0)+1}}return {s,r,recorded,sleepRecorded,wake,day,weights}}
// 日次は指定した1日、週次は月・年を跨ぐ日曜〜土曜、月次は指定月の日別推移。
function monthDays(month){const [y,m]=monthParts(month),n=new Date(y,m,0).getDate();return Array.from({length:n},(_,i)=>dateString(y,m,i+1))}
function moveDate(key,n){const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}
function weekStart(key){const dt=new Date(key+'T12:00:00');dt.setDate(dt.getDate()-dt.getDay());return iso(dt)}
function weekDays(start){return Array.from({length:7},(_,i)=>moveDate(start,i))}
function weekLabel(start){
 const end=moveDate(start,6),y=start.slice(0,4),ey=end.slice(0,4);
 const begin=`${y}年${start.slice(5,7)}月${start.slice(8,10)}日`;
 const finish=`${y!==ey?ey+'年':''}${end.slice(5,7)}月${end.slice(8,10)}日`;
 return `${begin}〜${finish}`;
}
async function ensureWeekBounds(){
 if(weekBoundsCached)return;
 assertSession();const uid=currentUser.uid,col=collection(db,'users',uid,'days');
 let first='',last='',reliable=false;
 try{
  // まず先頭・末尾だけを取得して読み取り数を抑える。
  const [oldest,newest]=await Promise.all([
   getDocs(query(col,orderBy(documentId()),limit(1))),
   getDocs(query(col,orderBy(documentId(),'desc'),limit(1)))
  ]);
  first=oldest.docs[0]?.id||'';
  last=newest.docs[0]?.id||'';
  reliable=true;
 }catch(e){
  // 一部のFirestore設定・旧環境で並び順付き取得が失敗しても週次を使用可能にする。
  console.warn('週次の記録期間取得：並び順付き取得に失敗。再取得します。',e);
  try{
   const all=await getDocs(col);
   const keys=all.docs.map(d=>d.id).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
   first=keys[0]||'';last=keys.at(-1)||'';
   reliable=true;
  }catch(e2){
   console.warn('週次の記録期間取得：読み込み済みの日付を利用します。',e2);
  }
 }
 if(uid!==currentUser?.uid)return;
 const known=Object.keys(state.days).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
 earliestRecordDate=first||known[0]||'';
 latestRecordDate=last||known.at(-1)||'';
 weekBoundsReliable=reliable;
 weekBoundsCached=true;
}
function selectableWeeks(){
 const today=iso(new Date());
 const first=earliestRecordDate&&earliestRecordDate<today?earliestRecordDate:today;
 const last=latestRecordDate&&latestRecordDate>today?latestRecordDate:today;
 const firstWeek=weekStart(first),lastWeek=weekStart(last),result=[];
 for(let key=firstWeek;key<=lastWeek;key=moveDate(key,7)){
  result.push({key,label:weekLabel(key),days:weekDays(key)});
  // 万一、保存された日付が異常でも画面を固めない。
  if(result.length>=2600)break;
 }
 return result;
}
// 週次・月次は選択期間の各日の値を描画する。年間・過去8週間へ集計を広げない。
function graphData(days){
 return days.map(key=>{
  const a=state.days[key];
  return {date:key,sleepHours:a&&(a.slots||[]).some(slot=>slot==='sleep'||slot==='rest')?(a.slots||[]).filter(v=>v==='sleep').length*.5:null,weight:a?validWeight(a.weight):null};
 });
}
function chartXLabel(key,period){const [m,d]=key.slice(5).split('-').map(Number);const label=`${m}/${d}`;return period==='weekly'?`${label}(${weekday(Number(key.slice(0,4)),m,d)})`:label;}
function formatHours(hours){if(hours===null)return '未入力';const mins=Math.round(hours*60);return `${Math.floor(mins/60)}時間${mins%60?`${mins%60}分`:''}`;}
function chartNumber(n){return Number.isInteger(n)?String(n):n.toFixed(1)}
function graphEmpty(label){return `<div class="graph-empty" role="status">${esc(label)}の記録はありません</div>`}
function svgPlot(data,type){
 const weightMode=type==='weight',field=weightMode?'weight':'sleepHours';
 const recorded=data.map((d,i)=>({...d,i})).filter(d=>d[field]!==null);
 if(!recorded.length)return graphEmpty(weightMode?'体重':'睡眠');
 const W=analysisView==='weekly'?510:Math.max(640,data.length*27+100),H=310,L=58,R=20,T=22,B=55;
 const plotW=W-L-R,plotH=H-T-B;
 let yMin=0,yMax=12;
 if(weightMode){
  const values=recorded.map(x=>x.weight),lo=Math.min(...values),hi=Math.max(...values);
  yMin=Math.floor((lo-0.5)*2)/2;yMax=Math.ceil((hi+0.5)*2)/2;
  if(yMax-yMin<1){yMin=lo-0.5;yMax=hi+0.5}
 } else {yMax=Math.max(8,Math.ceil(Math.max(...recorded.map(x=>x.sleepHours),7)/2)*2)}
 const x=i=>L+(data.length===1?plotW/2:(i+0.5)*plotW/data.length);
 const y=v=>T+plotH-(v-yMin)/(yMax-yMin)*plotH;
 const grid=Array.from({length:5},(_,i)=>{
  const value=yMin+(yMax-yMin)*i/4,yy=y(value);
  return `<line x1="${L}" y1="${yy.toFixed(2)}" x2="${W-R}" y2="${yy.toFixed(2)}" class="svg-grid"/><text x="${L-9}" y="${(yy+4).toFixed(2)}" text-anchor="end" class="svg-axis">${chartNumber(value)}</text>`
 }).join('');
 const step=data.length>18?Math.ceil(data.length/7):data.length>8?2:1;
 const ticks=data.map((d,i)=>i%step===0||i===data.length-1?`<text x="${x(i).toFixed(2)}" y="${H-B+20}" text-anchor="middle" class="svg-axis">${esc(chartXLabel(d.date,analysisView))}</text>`:'').join('');
 let drawing='';
 if(!weightMode){
  const barW=Math.max(5,Math.min(25,plotW/data.length*0.68));
  drawing=recorded.map(d=>{
   const yy=y(d.sleepHours),hh=Math.max(0,T+plotH-yy);
   return `<rect class="svg-sleep-bar" x="${(x(d.i)-barW/2).toFixed(2)}" y="${yy.toFixed(2)}" width="${barW.toFixed(2)}" height="${hh.toFixed(2)}" rx="2"><title>${esc(d.date)}：${formatHours(d.sleepHours)}</title></rect>`;
  }).join('');
 }else{
  // 連続して実測値が存在する日付の間だけ接続（空白の日を補間しない）。
  let parts=[];
  let seq=[];
  const flush=()=>{if(seq.length>1)parts.push(`<polyline class="svg-weight-line" points="${seq.map(p=>`${x(p.i).toFixed(2)},${y(p.weight).toFixed(2)}`).join(' ')}"/>`);seq=[];};
  data.forEach((d,i)=>{if(d.weight===null){flush()}else seq.push({...d,i})});flush();
  drawing=parts.join('')+recorded.map(d=>`<circle class="svg-weight-point" cx="${x(d.i).toFixed(2)}" cy="${y(d.weight).toFixed(2)}" r="4.4"><title>${esc(d.date)}：${d.weight.toFixed(1)} kg</title></circle>`).join('');
 }
 return `<svg class="analysis-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${analysisView==='weekly'?'style="max-width:100%;height:auto"':''} role="img" aria-label="${weightMode?'体重（kg）':'睡眠時間（時間）'}の${analysisView==='weekly'?'選択週':'選択月'}の日別${weightMode?'折れ線':'棒'}グラフ。記録のない日は空白。"><text x="${L}" y="13" class="svg-unit">${weightMode?'体重（kg）':'睡眠時間（時間）'}</text>${grid}<line x1="${L}" y1="${T}" x2="${L}" y2="${T+plotH}" class="svg-axis-line"/>${ticks}${drawing}<text x="${W-R}" y="${H-6}" text-anchor="end" class="svg-unit">日付</text></svg>`;
}
async function renderAnalysis(){
 const daily=analysisView==='daily',weekly=analysisView==='weekly';
 $('#screen-analysis').classList.toggle('analysis-daily',daily);
 if(weekly&&currentUser?.emailVerified)await ensureWeekBounds();
 const weeks=weekly?selectableWeeks():[];
 if(weekly&&!weeks.some(w=>w.key===analysisWeek)){
  const todayWeek=weekStart(iso(new Date()));
  analysisWeek=weeks.some(w=>w.key===todayWeek)?todayWeek:(weeks.at(-1)?.key||'');
 }
 const week=weekly?weeks.find(w=>w.key===analysisWeek):null;
 const days=daily?[analysisDay]:weekly?(week?.days||weekDays(weekStart(iso(new Date())))):monthDays(analysisMonth);
 const statDays=days;
 $('#analysis-day').value=analysisDay;
 $('#analysis-day-text').textContent=analysisDay.replaceAll('-','/');
 $('#analysis-month').value=analysisMonth;
 $('#analysis-day-group').hidden=!daily;
 $('#analysis-month-group').hidden=analysisView!=='monthly';
 $$('#analysis-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===analysisView));
 $$('#analysis-targets button').forEach(b=>{const active=b.dataset.target===analysisTarget;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 $('#analysis-week-group').hidden=!weekly;
 if(weekly){
  $('#analysis-week').innerHTML=weeks.map(w=>`<option value="${esc(w.key)}">${esc(w.label)}</option>`).join('');
  $('#analysis-week').value=analysisWeek;
  $('#analysis-first-record').textContent='';
 }
 if(currentUser?.emailVerified){const months=[...new Set(days.map(k=>k.slice(0,7)))];await Promise.all(months.map(loadMonth))}
 const s=sumFor(statDays),fmt=min=>`${Math.floor(min/60)}時間${min%60?`${min%60}分`:''}`;
 const weightAvg=s.weights.length?(s.weights.reduce((sum,x)=>sum+x.value,0)/s.weights.length).toFixed(1)+' kg':'—';
 const latestWeight=s.weights.at(-1);
 const prefix=analysisMonth.replace('-','年')+'月';
 const dayLabel=`${analysisDay.slice(0,4)}年${analysisDay.slice(5,7)}月${analysisDay.slice(8,10)}日`;
 $('#analysis-stats-period').textContent=daily?'':weekly?`${week?.label||''}の集計（選択した週）`:`${prefix}の集計（選択した月）`;
 const selectedDay=daily?state.days[analysisDay]:null;
 const sleepStats=daily?[
  ['記録した睡眠',s.sleepRecorded?fmt(s.s):'—','選択した日の熟睡時間'],
  ['休息',s.sleepRecorded?fmt(s.r):'—','起きて布団の中にいた時間'],
  ['目覚めの眠気',selectedDay?.wakeSleepiness||'—','選択した日の記録'],
  ['日中の眠気',selectedDay?.daySleepiness||'—','選択した日の記録']
 ]:[
  ['記録した睡眠 合計',fmt(s.s),'自分で「熟睡」とした時間'],
  ['休息 合計',fmt(s.r),'起きて布団の中にいた時間'],
  ['記録のある日',`${s.recorded}日`,'上記の対象期間内の登録'],
  ['記録日の平均睡眠',s.sleepRecorded?fmt(Math.round(s.s/s.sleepRecorded)):'—',`睡眠・休息の入力がある${s.sleepRecorded}日で計算`]
 ];
 const weightStats=daily?[
  ['体重',selectedDay&&validWeight(selectedDay.weight)!==null?validWeight(selectedDay.weight).toFixed(1)+' kg':'—','選択した日の記録']
 ]:[
  ['体重 平均',weightAvg,`体重入力のある${s.weights.length}日で計算`],
  ['期間内の直近体重',latestWeight?latestWeight.value.toFixed(1)+' kg':'—',latestWeight?latestWeight.date+'の記録':'記録なし']
 ];
 const stats=analysisTarget==='sleep'?sleepStats:analysisTarget==='weight'?weightStats:[...sleepStats,...weightStats];
 $('#analysis-stats').innerHTML=stats.map(x=>`<div class="statbox"><small>${esc(x[0])}</small><strong>${esc(x[1])}</strong>${daily?'':`<p>${esc(x[2])}</p>`}</div>`).join('');
 $('#analysis-title').textContent=daily?`${dayLabel}の記録`:weekly?'選択した週の日別記録':`${prefix}の日別記録`;
 $('#sleep-graph-panel .analysis-graph-description').textContent='横軸：日付／縦軸：睡眠時間（時間）';
 $('#weight-graph-panel .analysis-graph-description').textContent='横軸：日付／縦軸：体重（kg）';
 $('#analysis-graphs').hidden=daily;
 $('#sleep-graph-panel').hidden=daily||analysisTarget==='weight';
 $('#weight-graph-panel').hidden=daily||analysisTarget==='sleep';
 const data=graphData(days);
 if(!daily){
  if(analysisTarget!=='weight')$('#analysis-sleep-chart').innerHTML=svgPlot(data,'sleep');
  if(analysisTarget!=='sleep')$('#analysis-weight-chart').innerHTML=svgPlot(data,'weight');
 }
 const viewportKey=`${analysisView}|${daily?analysisDay:weekly?analysisWeek:analysisMonth}`;
 if(viewportKey!==analysisViewportKey){
  $$('.analysis-graph-frame').forEach(el=>{el.scrollLeft=0});
  analysisViewportKey=viewportKey;
 }
 if(daily){
  const parts=[];
  if(analysisTarget!=='weight')parts.push(`睡眠：${s.sleepRecorded?fmt(s.s):'未入力'} ／ 休息：${s.sleepRecorded?fmt(s.r):'未入力'}`);
  if(analysisTarget!=='sleep')parts.push(`体重：${selectedDay&&validWeight(selectedDay.weight)!==null?validWeight(selectedDay.weight).toFixed(1)+' kg':'未入力'}`);
  $('#analysis-daily-summary').textContent=parts.join(' ／ ');
  $('#analysis-daily-summary').hidden=false;
  // 同じ日付と数値を下部に重複表示しない。注意書きだけは残す。
  $('#analysis-bars').innerHTML='';
 }else{
  $('#analysis-daily-summary').hidden=true;
  $('#analysis-daily-summary').textContent='';
  $('#analysis-bars').innerHTML=data.map(item=>{
   const value=item.sleepHours;
   const sleepLabel=value===null?'未入力':formatHours(value);
   const weightLabel=item.weight===null?'未入力':item.weight.toFixed(1)+' kg';
   const label=item.date.slice(5);
   if(analysisTarget==='weight')return `<div class="baritem"><div>${esc(label)}</div><div class="record-value-only">体重：${weightLabel}</div></div>`;
   return `<div class="baritem"><div>${esc(label)}</div><div class="barbg"><div class="barvalue" style="width:${value===null?0:Math.min(100,value/24*100)}%"></div></div><strong>${sleepLabel}${analysisTarget==='both'&&weightLabel!=='未入力'?' / '+weightLabel:''}</strong></div>`;
  }).join('')||'<span class="muted">まだ記録がありません</span>';
 }
}

function renderSettings(){applyTheme();$('#display-name').value=state.settings.name||'';$('#habit-bed').value=state.settings.habitBed||'23:00';$('#habit-wake').value=state.settings.habitWake||'07:00';$('#account-email').textContent=currentUser?.email||'—';$('#first-month').value=state.settings.firstMonth||'';updateDatePickerButtons();$('#theme-choices').innerHTML=Object.entries(themes).map(([id,t])=>`<button class="theme-choice ${state.settings.theme===id?'active':''}" data-id="${id}" aria-label="${t.name}" title="${t.name}"><i class="color-dot" style="background:${t.accent}"></i></button>`).join('');$$('#theme-choices button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{const old=state.settings.theme;state.settings.theme=b.dataset.id;applyTheme();try{await setDoc(userDoc(),{theme:state.settings.theme,updatedAt:serverTimestamp()},{merge:true});renderSettings();renderChart()}catch(e){state.settings.theme=old;applyTheme();renderSettings();throw e}})))}
async function saveSettings(){await action($('#save-settings'),async()=>{
 const newSettings={name:$('#display-name').value.trim().slice(0,60),habitBed:$('#habit-bed').value,habitWake:$('#habit-wake').value,theme:state.settings.theme,firstMonth:$('#first-month').value||''};
 if(newSettings.habitBed===newSettings.habitWake){toast('通常の就寝時刻と起床時刻は異なる時刻を選んでください');return}
 await setDoc(userDoc(),{...newSettings,updatedAt:serverTimestamp()},{merge:true});state.settings={...state.settings,...newSettings};renderSettings();renderChart();toast('設定を保存しました');
});}
function makeId(){return 'med-'+(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2,10)}`)}

// お薬手帳形式。新しい服用内容は別IDで保存し、変更履歴を保持します。
function medIsActive(m){return !m.end || m.end>=iso(new Date())}
function medDisplayDose(m){if(m.dose==null)return '未登録';const n=Number(m.dose);return `${n===0.5?'半':n}${m.unit||'錠'}`}
function initMedicineTimings(){
 const groups=[['食前',medicineTimings.slice(0,4)],['食直前',medicineTimings.slice(4,8)],['食後',medicineTimings.slice(8,12)],['食直後',medicineTimings.slice(12,16)],['食間・その他',medicineTimings.slice(16)]];
 $('#med-timings').innerHTML='<option value="">選択してください</option>'+groups.map(([title,list])=>`<optgroup label="${esc(title)}">${list.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</optgroup>`).join('');
 $('#med-timings').addEventListener('change',updateMedicineTimingDetail);
}
function updateMedicineTimingDetail(){
 const needsDetail=['時刻指定','一定時間ごと','その他'].includes($('#med-timings').value);
 $('#med-timing-other-field').style.display=needsDetail?'':'none';
 if(!needsDetail)$('#med-timing-other').value='';
}
function resetMedicineForm(copy=null){
 $('#med-edit-id').value='';$('#med-form-title').textContent='お薬・サプリを登録';
 $('#med-kind').value=copy?.kind||'medicine';$('#med-name').value=copy?.name||'';
 $('#med-strength').value=copy?.strength||'';$('#med-dose').value=String(copy?.dose||1);
 $('#med-unit').value=['錠','包','カプセル','その他'].includes(copy?.unit)?copy.unit:'錠';
 $('#med-start').value=iso(new Date());$('#med-end').value='';updateDatePickerButtons();
 $('#med-institution').value=copy?.institution||'';$('#med-note').value=copy?.note||'';
 const timing=Array.isArray(copy?.timings)?copy.timings[0]||'':copy?.timing||'';
 $('#med-timings').value=medicineTimings.includes(timing)?timing:'';
 $('#med-timing-other').value=copy?.timingOther||'';
 updateMedicineTimingDetail();
 $('#med-save').textContent='登録を保存';
}
// v1.2.2：服用一覧と入力フォームは別画面。フォームは新規・編集・履歴コピーからのみ表示。
function showMedicinePanel(which){
 const form=which==='form';
 $('#med-list-view').hidden=form;
 $('#med-form-view').hidden=!form;
 window.scrollTo({top:0,behavior:'instant'});
}
function openNewMedicineForm(copy=null){
 resetMedicineForm(copy);
 showMedicinePanel('form');
}
function closeMedicineForm(){
 resetMedicineForm();
 renderMedicineList();
 showMedicinePanel('list');
}
function editMedicine(id){
 const m=state.medicines.find(x=>x.id===id);if(!m)return;
 resetMedicineForm(m);$('#med-edit-id').value=m.id;$('#med-form-title').textContent='登録内容を編集';
 $('#med-start').value=m.start||iso(new Date());$('#med-end').value=m.end||'';updateDatePickerButtons();
 $('#med-save').textContent='変更を保存';
 showMedicinePanel('form');
}
// v1.2.3 — 処方期間と医療機関でまとめ、朝から就寝前・頓服の順に表示する。
// 元のFirestoreの記録は変更せず、一覧の見せ方だけを変える。
function medTimingList(m){
 return (Array.isArray(m.timings)?m.timings:[m.timing]).filter(Boolean);
}
function medTimingOrder(m){
 const ranks={
  '起床時':0,'毎食前':10,'朝食前':11,'毎食直前':12,'朝食直前':13,
  '毎食後':19,'朝食後':20,'朝食直後':21,'毎食直後':22,
  '朝昼の間':25,'昼食前':30,'昼食直前':31,'昼食後':40,'昼食直後':41,
  '毎食間':44,'昼夕の間':45,'夕食前':50,'夕食直前':51,
  '夕食後':60,'夕食直後':61,'一定時間ごと':80,'就寝前':90,'その他':95,
  '頓服（必要なとき）':999,'頓服':999
 };
 return Math.min(...medTimingList(m).map(t=>{
  if(t==='時刻指定'){
   const match=String(m.timingOther||'').match(/(?:^|[^\d])(\d{1,2})[:：時](\d{1,2})?/);
   if(match){const hour=Number(match[1]),minute=Number(match[2]||0);if(hour<24&&minute<60)return Math.min(94,Math.max(1,(hour+minute/60)*3.8));}
   return 85;
  }
  return ranks[t]??95;
 }),999);
}
function compareMedicineTiming(a,b){
 return medTimingOrder(a)-medTimingOrder(b)||(a.name||'').localeCompare(b.name||'','ja');
}
function medicineEntryHtml(m){
 const timing=medTimingList(m).join('・');
 return `<div class="med-entry">
  <div class="med-record-top"><strong>${esc(m.name||'名称未設定')}</strong><span class="med-type">${m.kind==='supplement'?'サプリ':'お薬'}</span></div>
  <p>${m.strength?esc(m.strength)+' ／ ':''}1回 ${esc(medDisplayDose(m))}</p>
  ${timing?`<p>タイミング：${esc(timing)}</p>`:''}
  ${m.timingOther?`<p>詳細：${esc(m.timingOther)}</p>`:''}
  ${m.note?`<p>メモ：${esc(m.note)}</p>`:''}
  <div class="actions"><button type="button" class="btn small" data-med-edit="${esc(m.id)}">編集</button><button type="button" class="btn small" data-med-copy="${esc(m.id)}">変更内容を新規登録</button><button type="button" class="btn small danger" data-med-delete="${esc(m.id)}">削除</button></div>
 </div>`;
}
function renderMedicineList(){
 $$('#med-filters button').forEach(b=>b.classList.toggle('active',b.dataset.filter===medFilter));
 const items=state.medicines.filter(m=>(medFilter==='active')===medIsActive(m));
 const groups=new Map(),supplements=[];
 for(const m of items){
  if(m.kind==='supplement'){supplements.push(m);continue}
  // 医療機関が未登録の場合、別の処方と同一だと判断できないため個別に表示。
  const institution=String(m.institution||'').trim().replace(/[\s\u3000]+/g,' ');
  const key=institution?JSON.stringify([m.start||'',m.end||'',institution]):`unassigned:${m.id}`;
  if(!groups.has(key))groups.set(key,{start:m.start||'',end:m.end||'',institution:institution||'医療機関未登録',meds:[]});
  groups.get(key).meds.push(m);
 }
 const ordered=[...groups.values()].sort((a,b)=>b.start.localeCompare(a.start)||b.end.localeCompare(a.end)||a.institution.localeCompare(b.institution,'ja'));
 const cards=ordered.map(g=>{
  const period=`${g.start||'未設定'} ～ ${g.end||'継続中'}`;
  return `<section class="med-prescription" aria-label="${esc(g.institution)}・${esc(period)}">
   <div class="med-prescription-heading"><strong>${esc(g.institution)}</strong><span class="med-prescription-count">お薬 ${g.meds.length}件</span></div>
   <p class="med-prescription-dates">服用期間：${esc(period)}</p>
   <div class="med-prescription-entries">${g.meds.sort(compareMedicineTiming).map(medicineEntryHtml).join('')}</div>
  </section>`;
 });
 if(supplements.length){
  const supplementsHtml=supplements.sort((a,b)=>(b.start||'').localeCompare(a.start||'')||compareMedicineTiming(a,b))
   .map(m=>`<article class="med-supplement-entry"><p class="med-supplement-dates">服用期間：${esc(m.start||'未設定')} ～ ${esc(m.end||'継続中')}</p>${medicineEntryHtml(m)}</article>`).join('');
  cards.push(`<section class="med-supplement-group"><h3>サプリ</h3><div class="med-supplement-entries">${supplementsHtml}</div></section>`);
 }
 $('#med-list').innerHTML=cards.length?cards.join(''):'<p class="muted">この一覧に登録はありません。</p>';
}

async function saveMedicine(){await action($('#med-save'),async()=>{
 const name=$('#med-name').value.trim(),start=$('#med-start').value,end=$('#med-end').value;
 if(!name){toast('薬・サプリの名称を入力してください');return}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)){toast('服用開始日を入力してください');return}
 if(end&&end<start){toast('服用終了日は開始日以降にしてください');return}
 const dose=Number($('#med-dose').value);
 if(!doseValues.has(dose)){toast('1回量を確認してください');return}
 const timing=$('#med-timings').value;
 if(!medicineTimings.includes(timing)){toast('服用タイミングを1つ選択してください');return}
 const id=$('#med-edit-id').value||makeId();
 const data={kind:$('#med-kind').value==='supplement'?'supplement':'medicine',name:name.slice(0,80),strength:$('#med-strength').value.trim().slice(0,60),dose,unit:$('#med-unit').value,start,end,institution:$('#med-institution').value.trim().slice(0,120),timings:[timing],timingOther:['時刻指定','一定時間ごと','その他'].includes(timing)?$('#med-timing-other').value.trim().slice(0,120):'',note:$('#med-note').value.trim().slice(0,500),updatedAt:serverTimestamp()};
 await setDoc(medRef(id),data,{merge:true});const old=state.medicines.findIndex(m=>m.id===id);
 const local={...data,id};if(old>=0)state.medicines[old]=local;else state.medicines.push(local);
 closeMedicineForm();toast('お薬・サプリ情報を保存しました');
});}
async function removeMedicine(id){
 const m=state.medicines.find(x=>x.id===id);if(!m)return;
 if(!window.confirm(`「${m.name||'名称未設定'}」を削除しますか？\nこの操作は元に戻せません。睡眠日誌の◎服薬時刻は残ります。`))return;
 await action(null,async()=>{await deleteDoc(medRef(id));state.medicines=state.medicines.filter(x=>x.id!==id);renderMedicineList();toast('登録を削除しました')});
}

/* A4横1枚のPDFを端末の印刷処理に依存せず、ブラウザ内で作成します。
 * 文字・図形はCanvasへ描画し、1ページのJPEG画像としてPDFへ埋め込みます。
 * 氏名・睡眠・服薬データはサーバーへ送らず、端末内でPDFを作成します。
 */
async function downloadOnePagePdf(){
 const [year,month]=monthParts(state.month),numDays=new Date(year,month,0).getDate();
 const W=2600,H=1838,cv=document.createElement('canvas');cv.width=W;cv.height=H;
 const cx=cv.getContext('2d',{alpha:false});if(!cx)throw Error('PDF作成用の描画を開始できません');
 cx.fillStyle='#fff';cx.fillRect(0,0,W,H);
 const margin=42,tableW=W-2*margin,rowH=43,headH=57,top=164;
 const dims=[145,...Array(48).fill(0),112,112,92,0];
 const slotW=34;for(let i=1;i<=48;i++)dims[i]=slotW;
 dims[dims.length-1]=tableW-dims.slice(0,-1).reduce((a,b)=>a+b,0);
 const starts=[margin];dims.forEach(x=>starts.push(starts[starts.length-1]+x));
 const tx=(str,x,y,font='20px sans-serif',fill='#26354a',align='left',max)=>{
  cx.save();cx.font=font;cx.fillStyle=fill;cx.textAlign=align;cx.textBaseline='middle';
  if(max){let s=String(str||'');while(s&&cx.measureText(s).width>max)s=s.slice(0,-1);if(s!==String(str||''))s+='…';cx.fillText(s,x,y)}
  else cx.fillText(String(str||''),x,y);cx.restore();
 };
 const line=(x1,y1,x2,y2,color='#b4bfcd',width=1,dash=[])=>{cx.save();cx.strokeStyle=color;cx.lineWidth=width;cx.setLineDash(dash);cx.beginPath();cx.moveTo(x1,y1);cx.lineTo(x2,y2);cx.stroke();cx.restore()};
 tx('睡眠日誌',margin,52,'bold 42px sans-serif');
 tx(`${year}年${month}月`,margin+230,53,'bold 29px sans-serif');
 tx(state.settings.name?`氏名：${state.settings.name}`:'氏名：　　　　　　　　　',margin,107,'24px sans-serif','#28364a', 'left',930);
 tx(`記録期間：${year}年${month}月1日〜${numDays}日`,W-margin,107,'22px sans-serif','#40556d','right');
 const theme=themes[state.settings.theme]||themes.blue;
 cx.fillStyle='#eff3f8';cx.fillRect(margin,top,tableW,headH);
 // 時間帯見出し：通常就寝時間帯だけを薄い黄色に
 for(let i=0;i<48;i++)if(isHabit(i)){cx.fillStyle='#fff1c5';cx.fillRect(starts[i+1],top,slotW,headH)}
 tx('日付・曜日',starts[0]+dims[0]/2,top+headH/2,'bold 18px sans-serif','#26354a','center');
 for(let hr=0;hr<24;hr++)tx(String(hr),starts[1+hr*2]+slotW,top+headH/2,'bold 18px sans-serif','#26354a','center');
 const extraStart=49;
 ['目覚めの眠気','日中の眠気','体重(kg)','出来事'].forEach((label,j)=>tx(label,starts[extraStart+j]+dims[extraStart+j]/2,top+headH/2,j===3?'bold 18px sans-serif':'bold 14px sans-serif','#26354a','center'));
 for(let d=1;d<=numDays;d++){
  const key=dateString(year,month,d),a=state.days[key]||freshDay(),y=top+headH+(d-1)*rowH;
  if(d%2===0){cx.fillStyle='#f3f7fc';cx.fillRect(margin,y,tableW,rowH)}
  const wd=weekday(year,month,d);
  tx(`${d}（${wd}）`,starts[0]+dims[0]/2,y+rowH/2,'bold 18px sans-serif',(isJapaneseHoliday(key)||wd==='日')?'#a84252':wd==='土'?'#365b96':'#26354a','center');
  for(let i=0;i<48;i++){
   const cellX=starts[i+1],kind=a.slots?.[i];
   if(kind==='sleep'){cx.fillStyle=theme.sleep;cx.fillRect(cellX+1,y+1,slotW-2,rowH-2)}
   else if(kind==='rest')line(cellX+4,y+rowH-4,cellX+slotW-4,y+4,'#202b37',6);
   const marks=(a.markers||[]).filter(x=>x.slot===i);
   for(let k=0;k<marks.length;k++){
    const m=marks[k],total=Math.min(marks.length,3),symbolX=cellX+slotW/2+(k-(total-1)/2)*9,cy=y+rowH/2;
    cx.save();cx.strokeStyle=kind==='sleep'?'#ffffff':'#182531';cx.lineWidth=2.3;cx.beginPath();
    if(m.type==='med'){cx.arc(symbolX,cy,5.2,0,Math.PI*2);cx.moveTo(symbolX+2.3,cy);cx.arc(symbolX,cy,2.3,0,Math.PI*2)}
    if(m.type==='wake'){cx.moveTo(symbolX,cy-7);cx.lineTo(symbolX+6.5,cy+6);cx.lineTo(symbolX-6.5,cy+6);cx.closePath()}
    if(m.type==='bed'){cx.moveTo(symbolX-6.5,cy-6);cx.lineTo(symbolX+6.5,cy-6);cx.lineTo(symbolX,cy+7);cx.closePath()}
    if(m.type==='meal'){cx.rect(symbolX-6,cy-6,12,12)}
    cx.stroke();cx.restore();
   }
  }
  const extras=[a.wakeSleepiness||'',a.daySleepiness||'',validWeight(a.weight)!==null?validWeight(a.weight).toFixed(1):''];
  extras.forEach((val,j)=>tx(val,starts[extraStart+j]+dims[extraStart+j]/2,y+rowH/2,'18px sans-serif','#26354a','center'));
  tx(a.note||'',starts[extraStart+3]+8,y+rowH/2,'17px sans-serif','#26354a','left',dims[extraStart+3]-16);
  line(margin,y+rowH,margin+tableW,y+rowH,'#c3ccd7',1);
 }
 // 24時間枠は実線、30分境界は点線
 for(let i=0;i<=53;i++){
  const x=starts[i];
  if(i===0||i===53||i>=49||i%2===1){line(x,top,x,top+headH+numDays*rowH,'#a1adbc',1.5)}
  else{line(x,top,x,top+headH+numDays*rowH,'#b8c3d0',1,[3,4])}
 }
 line(margin,top,margin+tableW,top,'#8e9aa8',2);line(margin,top+headH,margin+tableW,top+headH,'#8e9aa8',2);
 const footerY=top+headH+numDays*rowH+25;
 tx('■ 熟睡',margin,footerY,'21px sans-serif');tx('╱ 休息（布団の中）',margin+135,footerY,'21px sans-serif');
 tx('◎ 服薬',margin+445,footerY,'21px sans-serif');tx('▽ 就寝',margin+590,footerY,'21px sans-serif');
 tx('△ 起床',margin+730,footerY,'21px sans-serif');tx('□ 食事',margin+870,footerY,'21px sans-serif');
 tx('黄色の時間見出し：通常の睡眠時間帯',margin+1050,footerY,'19px sans-serif','#40556d');
 tx('© 2021–2026 Dobhar-chú',W-margin,H-34,'17px sans-serif','#6d7b90','right');
 const base64=cv.toDataURL('image/jpeg',0.92).split(',')[1],raw=atob(base64),jpeg=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)jpeg[i]=raw.charCodeAt(i);
 const encoder=new TextEncoder(),chunks=[],offsets=[0];let pos=0;
 function append(b){chunks.push(b);pos+=b.length}
 function a(s){append(encoder.encode(s))}
 a('%PDF-1.4\n');
 const obj=(id,content)=>{offsets[id]=pos;a(`${id} 0 obj\n${content}\nendobj\n`)};
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>');
 offsets[4]=pos;a(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);append(jpeg);a('\nendstream\nendobj\n');
 const stream='q\n841.89 0 0 595.28 0 0 cm\n/Im1 Do\nQ\n';
 obj(5,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
 const xref=pos;a('xref\n0 6\n0000000000 65535 f \n');for(let id=1;id<=5;id++)a(String(offsets[id]).padStart(10,'0')+' 00000 n \n');
 a(`trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF`);
 const data=new Blob(chunks,{type:'application/pdf'}),url=URL.createObjectURL(data),link=document.createElement('a');
 link.href=url;link.download=`睡眠日誌_${year}-${String(month).padStart(2,'0')}.pdf`;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 toast('A4横・1ページのPDFを作成しました');
}

// 認証
$('#register-button').addEventListener('click',register);$('#login-button').addEventListener('click',login);$('#reset-password-button').addEventListener('click',passwordResetFromAuth);
$('#auth-password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('#resend-verified').addEventListener('click',resendVerification);
$('#logout-button').addEventListener('click',()=>action($('#logout-button'),()=>signOut(auth)));
$('#verify-logout').addEventListener('click',()=>action($('#verify-logout'),()=>signOut(auth)));
$('#change-email').addEventListener('click',changeEmail);$('#reset-signed-password').addEventListener('click',passwordResetSigned);$('#send-verification-settings').addEventListener('click',reloadEmailStatus);
// 日誌
fillTimes();$$('.tab').forEach(b=>b.addEventListener('click',()=>action(null,()=>show(b.dataset.tab))));
$('#month-label').addEventListener('click',()=>openDatePicker('report-month'));$('#prev-month').addEventListener('click',()=>action($('#prev-month'),()=>monthShift(-1)));$('#next-month').addEventListener('click',()=>action($('#next-month'),()=>monthShift(1)));
$('#open-guide').addEventListener('click',()=>$('#guide-dialog').showModal());$('#close-guide').addEventListener('click',()=>$('#guide-dialog').close());$('#guide-dialog').addEventListener('click',e=>{if(e.target.id==='guide-dialog')e.target.close()});
$('#print-button').addEventListener('click',()=>{
 // スマートフォンの印刷メニューはA4の向き・改ページが端末依存のため、1枚のPDFを保存してから印刷する。
 if(window.matchMedia('(max-width:850px)').matches){action($('#print-button'),async()=>{await downloadOnePagePdf();toast('保存したPDFを開いて印刷してください')});return}
 renderChart();window.print();
});
$('#download-pdf').addEventListener('click',()=>action($('#download-pdf'),downloadOnePagePdf));
$$('.mode').forEach(b=>b.addEventListener('click',()=>{selectedMode=b.dataset.mode;renderModes()}));
$('#entry-date').addEventListener('change',e=>{const val=e.target.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(val)){toast('日付を正しく指定してください');e.target.value=state.selected;return}action(null,async()=>{await loadMonth(val.slice(0,7));state.selected=val;state.month=val.slice(0,7);renderInput();renderChart()})});
$('#add-entry').addEventListener('click',applyEntry);$('#save-day').addEventListener('click',saveDay);
$$('#analysis-tabs button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{
 if(analysisView!==b.dataset.view){const today=iso(new Date());analysisDay=today;analysisMonth=today.slice(0,7);analysisWeek=weekStart(today);}
 analysisView=b.dataset.view;await renderAnalysis();
})));
$$('#analysis-targets button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{analysisTarget=b.dataset.target;await renderAnalysis()})));
$('#analysis-month').addEventListener('change',e=>action(e.target,async()=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){toast('年月を確認してください');return}analysisMonth=e.target.value;analysisWeek='';await renderAnalysis()}));
$('#analysis-week').addEventListener('change',e=>action(null,async()=>{analysisWeek=e.target.value;await renderAnalysis()}));
$('#analysis-day').addEventListener('change',e=>action(null,async()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){toast('日付を確認してください');return}analysisDay=e.target.value;analysisMonth=analysisDay.slice(0,7);await renderAnalysis()}));
function shiftAnalysisMonth(n){const [y,m]=monthParts(analysisMonth),d=new Date(y,m-1+n,1);analysisMonth=dateString(d.getFullYear(),d.getMonth()+1,1).slice(0,7);analysisWeek='';return renderAnalysis()}
$('#analysis-prev-month').addEventListener('click',()=>action(null,()=>shiftAnalysisMonth(-1)));
$('#analysis-next-month').addEventListener('click',()=>action(null,()=>shiftAnalysisMonth(1)));
$('#save-settings').addEventListener('click',saveSettings);
initMedicineTimings();resetMedicineForm();showMedicinePanel('list');
$('#med-new').addEventListener('click',()=>openNewMedicineForm());
$('#med-back').addEventListener('click',closeMedicineForm);
$('#med-cancel').addEventListener('click',closeMedicineForm);
$('#med-save').addEventListener('click',saveMedicine);
$('#med-reset').addEventListener('click',()=>resetMedicineForm());
$('#med-filters').addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;medFilter=b.dataset.filter;renderMedicineList()});
$('#med-list').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.medEdit)editMedicine(b.dataset.medEdit);
 if(b.dataset.medCopy){const source=state.medicines.find(x=>x.id===b.dataset.medCopy);if(source){openNewMedicineForm(source);toast('新しい履歴として保存します。元の登録の終了日は必要に応じて編集してください')}}
 if(b.dataset.medDelete)removeMedicine(b.dataset.medDelete);
});
// iPhone Safariで幅が崩れるネイティブ日付・年月入力を、同じ幅のカレンダー選択に置換。
// Firestoreへの保存形式（YYYY-MM-DD / YYYY-MM）は従来どおり維持。
let pickerKind='day',pickerYear=2026,pickerMonth=1,pickerDay=1;
const pad2=n=>String(n).padStart(2,'0');
function updateDatePickerButtons(){
 const day=$('#entry-date').value||state.selected||'';
 const first=$('#first-month').value||'';
 $('#entry-date-text').textContent=/^\d{4}-\d{2}-\d{2}$/.test(day)?day.replaceAll('-','/'):'日付を選ぶ';
 $('#first-month-text').textContent=/^\d{4}-\d{2}$/.test(first)?first.replace('-','年')+'月':'指定しない';
 for(const kind of ['med-start','med-end']){
  const value=$('#'+kind).value||'';
  $('#'+kind+'-text').textContent=/^\d{4}-\d{2}-\d{2}$/.test(value)?value.replaceAll('-','/'):kind==='med-start'?'日付を選ぶ':'指定しない';
 }
}
function clampPickerDay(){pickerDay=Math.max(1,Math.min(pickerDay,new Date(pickerYear,pickerMonth,0).getDate()))}
function pickerStep(n){
 const d=new Date(pickerYear,pickerMonth-1+n,1);
 pickerYear=d.getFullYear();pickerMonth=d.getMonth()+1;
 if(pickerYear<1900){pickerYear=1900;pickerMonth=1}
 if(pickerYear>2100){pickerYear=2100;pickerMonth=12}
 clampPickerDay();renderDatePicker();
}
function renderDatePicker(){
 $('#picker-year').value=String(pickerYear);
 $('#picker-month').value=String(pickerMonth);
 const monthOnly=pickerKind==='month'||pickerKind==='report-month';
 $('#picker-day-area').hidden=monthOnly;
 $('#picker-today').hidden=monthOnly;
 $('#picker-clear').hidden=!(pickerKind==='month'||pickerKind==='med-end');
 $('#picker-confirm').textContent=monthOnly?'この月を選ぶ':'この日を選ぶ';
 if(monthOnly)return;
 const weekday=new Date(pickerYear,pickerMonth-1,1).getDay();
 const last=new Date(pickerYear,pickerMonth,0).getDate();
 const today=iso(new Date());
 let content=Array.from({length:weekday},()=>'<span aria-hidden="true"></span>').join('');
 for(let day=1;day<=last;day++){
  const value=dateString(pickerYear,pickerMonth,day),selected=day===pickerDay;
  content+=`<button type="button" data-day="${day}" aria-label="${pickerYear}年${pickerMonth}月${day}日" aria-pressed="${selected}" class="${selected?'selected':''} ${value===today?'today':''}">${day}</button>`;
 }
 $('#picker-days').innerHTML=content;
}
function openDatePicker(kind){
 pickerKind=kind;
 let value=kind==='day'?$('#entry-date').value:kind==='month'?$('#first-month').value:kind==='report-month'?state.month:$('#'+kind).value;
 if(!/^\d{4}-\d{2}/.test(value))value=iso(new Date());
 const chunks=value.split('-').map(Number);
 pickerYear=Math.max(1900,Math.min(2100,chunks[0]));
 pickerMonth=Math.max(1,Math.min(12,chunks[1]||1));
 pickerDay=chunks[2]||1;
 clampPickerDay();
 $('#date-picker-title').textContent=({day:'記録する日付',month:'最初に表示する月','report-month':'表示する月','analysis-day':'分析する日付','med-start':'服用開始日','med-end':'服用終了日'})[kind]||'日付を選ぶ';
 renderDatePicker();$('#date-picker-dialog').showModal();
}
function applyDatePicker(clear=false){
 if(pickerKind==='report-month'){const month=`${pickerYear}-${pad2(pickerMonth)}`;$('#date-picker-dialog').close();action(null,()=>jumpMonth(month));return}
 const field=pickerKind==='day'?$('#entry-date'):pickerKind==='month'?$('#first-month'):$('#'+pickerKind);
 field.value=clear?'':(pickerKind==='month'?`${pickerYear}-${pad2(pickerMonth)}`:dateString(pickerYear,pickerMonth,pickerDay));
 $('#date-picker-dialog').close();
 updateDatePickerButtons();
 // 既存のFirestoreデータ再取得処理に連携。設定側は「設定を保存」で確定。
 if(pickerKind==='day'||pickerKind==='analysis-day')field.dispatchEvent(new Event('change',{bubbles:true}));
}
$('#entry-date-picker').addEventListener('click',()=>openDatePicker('day'));
$('#analysis-day-picker').addEventListener('click',()=>openDatePicker('analysis-day'));
$('#first-month-picker').addEventListener('click',()=>openDatePicker('month'));
$('#med-start-picker').addEventListener('click',()=>openDatePicker('med-start'));
$('#med-end-picker').addEventListener('click',()=>openDatePicker('med-end'));
$('#date-picker-close').addEventListener('click',()=>$('#date-picker-dialog').close());
$('#picker-year').innerHTML=Array.from({length:201},(_,i)=>`<option value="${i+1900}">${i+1900}年</option>`).join('');
$('#picker-month').innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}月</option>`).join('');
$('#picker-year').addEventListener('change',e=>{pickerYear=Number(e.target.value);clampPickerDay();renderDatePicker()});
$('#picker-month').addEventListener('change',e=>{pickerMonth=Number(e.target.value);clampPickerDay();renderDatePicker()});
$('#picker-prev').addEventListener('click',()=>pickerStep(-1));
$('#picker-next').addEventListener('click',()=>pickerStep(1));
$('#picker-days').addEventListener('click',e=>{const b=e.target.closest('button[data-day]');if(!b)return;pickerDay=Number(b.dataset.day);renderDatePicker()});
$('#picker-today').addEventListener('click',()=>{const now=new Date();pickerYear=now.getFullYear();pickerMonth=now.getMonth()+1;pickerDay=now.getDate();renderDatePicker()});
$('#picker-clear').addEventListener('click',()=>{if(pickerKind==='month'||pickerKind==='med-end')applyDatePicker(true)});
$('#picker-confirm').addEventListener('click',()=>applyDatePicker());
$('#date-picker-dialog').addEventListener('click',e=>{if(e.target.id==='date-picker-dialog')e.target.close()});

// 表を初期状態で表示するのはログイン＆確認済み後のみ。デモデータは入れない。
