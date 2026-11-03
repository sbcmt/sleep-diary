/** 睡眠日誌 v1.0.8 (2026-11-03) | © 2021–2026 Dobhar-chú
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
// 内閣府「国民の祝日」公表日（2026年・2027年）。翌年以降の確定日は更新する。
const japanHolidays=new Set([
 '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23',
 '2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-03-22','2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03','2027-11-23'
]);
function dayColorClass(y,m,d){return japanHolidays.has(dateString(y,m,d))||weekday(y,m,d)==='日'?'sunday':weekday(y,m,d)==='土'?'saturday':''}
function nextDay(key){const d=new Date(`${key}T12:00:00`);d.setDate(d.getDate()+1);return iso(d)}
function freshDay(){return {slots:Array(48).fill(''),markers:[],wakeSleepiness:'',daySleepiness:'',note:'',weight:null}}
// 既存の記録の錠数を勝手に1錠とみなさず、未入力のまま保つ。
function validTablets(value){const n=Number(value);return value!=null&&value!==''&&[0.5,1,2,3,4,5,6,7,8].includes(n)?n:null}
function tabletsLabel(value,unit='錠'){const n=validTablets(value);return n===null?'服用量未登録':`${n===0.5?'半':n}${unit||'錠'}`}
function medicationName(marker){return state.medicines.find(m=>m.id===marker.medId)?.name||'服用薬未設定'}
function medicationDetail(marker){const med=state.medicines.find(m=>m.id===marker.medId);return `${medicationName(marker)}・${tabletsLabel(marker.tablets,marker.unit||med?.unit||'錠')}`}

const state={month:iso(new Date()).slice(0,7),selected:iso(new Date()),settings:blankSettings(),days:{},medicines:[],loadedMonths:new Set()};
let selectedMode='sleep',analysisView='daily',analysisTarget='both',analysisMonth=iso(new Date()).slice(0,7),medFilter='current',currentUser=null, sessionEpoch=0, deletedMedicineIds=new Set(), busy=false, verifyTimer=null, checkingVerification=false;
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
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(state.settings.firstMonth||''))state.month=state.settings.firstMonth;
 analysisMonth=state.month;
 state.medicines=medsSnap.docs.map(d=>({id:d.id,...d.data()}));deletedMedicineIds.clear();
 state.days={};state.loadedMonths.clear();
 await loadMonth(state.month);
 applyTheme();renderChart();renderInput();renderSettings();renderMedications();renderAnalysis();
}
async function persistDay(key){assertSession();const item=normalDay(key);await setDoc(dayRef(key),{...item,updatedAt:serverTimestamp()});}
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
 $('#jump-month').value=state.month;
 $('#month-label').textContent=`${y}年 ${m}月`;
 $('#print-month').textContent=`${y}年${m}月`;
 $('#print-range').textContent=`${y}年${m}月1日〜${m}月${n}日`;
 $('#print-person').textContent=state.settings.name?`氏名：${state.settings.name}`:'氏名：　　　　　　　　　';
 const head='<colgroup><col class="col-date">'+Array.from({length:48},()=>'<col class="col-slot">').join('')+'<col class="col-sleep"><col class="col-sleep"><col class="col-weight"><col class="col-event"></colgroup><thead><tr><th class="date-cell">日付・曜日</th>'+Array.from({length:24},(_,h)=>{
 const rects=[isHabit(h*2),isHabit(h*2+1)].map((on,j)=>on?`<rect class="habit-shade" x="${j*50}" y="0" width="50" height="100"/><line class="habit-underbar" x1="${j*50}" y1="96" x2="${(j+1)*50}" y2="96"/>`:'').join('');
 return `<th class="h-hour" colspan="2">${rects?`<svg class="hour-accent" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`:''}<span class="hour-number">${h}</span></th>`}).join('')+'<th class="sleepiness-head">目覚めの眠気</th><th class="sleepiness-head">日中の眠気</th><th class="weight-head">体重<br>(kg)</th><th class="event-head">出来事</th></tr></thead>';
 let body='';for(let d=1;d<=n;d++){
  const date=dateString(y,m,d),a=state.days[date]||freshDay(),wd=weekday(y,m,d),cl=dayColorClass(y,m,d);
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
async function show(tab){if(tab==='report'||tab==='analysis')await loadMonth(state.month);if(tab==='input')await loadMonth(state.selected.slice(0,7));
 $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.screen').forEach(s=>s.classList.toggle('active',s.id===`screen-${tab}`));
 if(tab==='report')renderChart();if(tab==='input')renderInput();if(tab==='settings')renderSettings();if(tab==='medications')renderMedications();if(tab==='analysis')await renderAnalysis();window.scrollTo({top:0,behavior:'instant'});
}
function fillTimes(){const options=Array.from({length:49},(_,i)=>`<option value="${time(i)}">${time(i)}</option>`).join('');$$('#entry-start,#entry-end,#habit-bed,#habit-wake').forEach(el=>el.innerHTML=options);$('#entry-start').value='23:00';$('#entry-end').value='23:30'}
function setDoseFromMedicine(){
 const med=state.medicines.find(m=>m.id===$('#selected-medicine').value);
 $('#tablet-unit-label').textContent=med?.unit||'錠';
 const dose=validTablets(med?.dose);
 $('#tablet-count').value=String(dose??1);
}
function renderModes(){
 $$('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===selectedMode));
 const single=['med','bed','wake','meal'].includes(selectedMode);
 $('#medicine-selector').classList.toggle('site-hidden',selectedMode!=='med');
 $('#entry-end-field').classList.toggle('site-hidden',single);
 $('#entry-time-row').classList.toggle('single-time',single);
 $('#entry-start-label').textContent=single?'時刻':'開始時刻';
 $('#entry-end').disabled=single;
 $('#entry-help').textContent=single?'指定した時刻に記号を付けます。':selectedMode==='erase'?'選択した範囲の熟睡・休息・◎服薬・▽就寝・△起床・□食事を消去します。同じ時刻なら30分枠を消去します。':'開始から終了まで記録します。翌日にまたがる指定もできます。';
}
function renderSleepiness(el,key){const d=dayData(state.selected);$(el).innerHTML=['無','弱','強'].map(x=>`<button type="button" class="chip ${d[key]===x?'active':''}" data-value="${x}">${x}</button>`).join('');$(el).querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const old=d[key];d[key]=b.dataset.value;action(b,async()=>{try{await persistDay(state.selected);renderSleepiness(el,key);renderDayPreview();renderChart()}catch(e){d[key]=old;throw e}})}))}
function renderInput(){$('#entry-date').value=state.selected;updateDatePickerButtons();const a=dayData(state.selected);renderSleepiness('#wake-sleepiness','wakeSleepiness');renderSleepiness('#day-sleepiness','daySleepiness');$('#day-note').value=a.note||'';$('#day-weight').value=validWeight(a.weight)===null?'':validWeight(a.weight).toFixed(1);
 let meds=state.medicines.filter(m=>m.name&&(!m.start||m.start<=state.selected)&&(!m.end||m.end>=state.selected)&&!m.supersededAt);
 const chosen=$('#selected-medicine').value;$('#selected-medicine').innerHTML=meds.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')+'<option value="other">その他／未設定</option>';
 if(meds.some(m=>m.id===chosen))$('#selected-medicine').value=chosen;
 setDoseFromMedicine();renderModes();renderDayPreview()}
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
  const slotMarkers=(a.markers||[]).filter(x=>x.slot===i),symbols=slotMarkers.map(x=>markerSVG(x.type)).join(''),detail=slotMarkers.filter(x=>x.type==='med').map(medicationDetail).join('、');
  return `<div class="quick-slot ${kind}" title="${time(i)} ${kind==='sleep'?'熟睡':kind==='rest'?'休息':''}${detail?' 服薬：'+esc(detail):''}">${printPattern(kind)}<span class="markers">${symbols}</span></div>`
 }).join('');
 const sorted=(a.markers||[]).map((v,i)=>({...v,originalIndex:i})).sort((x,y)=>x.slot-y.slot);
 $('#marker-list').innerHTML=sorted.length?'<span class="muted">記号（押すと削除）：</span>'+sorted.map(x=>`<button class="marker-chip" data-i="${x.originalIndex}" title="この記号を削除">${time(x.slot)} ${{med:'◎ 服薬',bed:'▽ 就寝',wake:'△ 起床',meal:'□ 食事'}[x.type]}${x.type==='med'?'（'+esc(medicationDetail(x))+'）':''} ×</button>`).join(''):'<span class="muted">記号の記録はありません</span>';
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
  // 同じ種類・時刻の重複登録は避ける。別の記号は同じ時刻にも登録可能。
  if(selectedMode==='med'){
   const previous=a.markers.find(x=>x.slot===start&&x.type==='med'&&x.medId===$('#selected-medicine').value);
   if(previous){previous.tablets=validTablets($('#tablet-count').value);previous.unit=state.medicines.find(m=>m.id===previous.medId)?.unit||'錠';if(previous.tablets===null){toast('錠数を選択してください');return}
    // 錠数修正は新しい行を増やさず、保存処理へ進む。
    marker.skipPush=true;}
  }else if(a.markers.some(x=>x.slot===start&&x.type===selectedMode)){toast('この時刻には既に同じ記号があります');return}
  if(selectedMode==='med'){marker.medId=$('#selected-medicine').value;marker.unit=state.medicines.find(m=>m.id===marker.medId)?.unit||'錠';marker.tablets=validTablets($('#tablet-count').value);if(marker.tablets===null){toast('錠数を選択してください');return}}
  if(!marker.skipPush)a.markers.push(marker);
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
function daysInMonth(month){const [y,m]=monthParts(month),n=new Date(y,m,0).getDate();return Array.from({length:n},(_,i)=>dateString(y,m,i+1))}
function monthsUpTo(month,n){const [y,m]=monthParts(month);return Array.from({length:n},(_,i)=>{const d=new Date(y,m-n+i,1);return dateString(d.getFullYear(),d.getMonth()+1,1).slice(0,7)})}
// 日次：選択月の日別、週次：選択月内の週平均、月次：選択月を含む過去6か月の月平均。
function graphData(days){return days.map(key=>{const day=state.days[key],hasSleep=Boolean(day&&(day.slots||[]).some(v=>v==='sleep'||v==='rest'));return {date:key,sleepHours:hasSleep?(day.slots||[]).filter(v=>v==='sleep').length*0.5:null,weight:day?validWeight(day.weight):null}})}
function groupedGraphData(days,view){
 const data=graphData(days);if(view==='daily')return data;
 const groups=new Map();data.forEach(item=>{let key,label;if(view==='weekly'){
  const d=new Date(item.date+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);key=iso(d);label=`${d.getMonth()+1}/${d.getDate()}週`;
 }else{key=item.date.slice(0,7);label=key.replace('-','/');}
 if(!groups.has(key))groups.set(key,{date:key,label,items:[]});groups.get(key).items.push(item);
 });
 return [...groups.values()].map(g=>{const sl=g.items.filter(i=>i.sleepHours!==null),wt=g.items.filter(i=>i.weight!==null);return {date:g.date,label:g.label,sleepHours:sl.length?sl.reduce((a,i)=>a+i.sleepHours,0)/sl.length:null,weight:wt.length?wt.reduce((a,i)=>a+i.weight,0)/wt.length:null}});
}
function chartXLabel(key,period){return period==='monthly'?key.slice(0,7).replace('-','/'):key.slice(5).replace('-','/');}
function chartNumber(n){return Number.isInteger(n)?String(n):n.toFixed(1)}
function graphEmpty(label){return `<div class="graph-empty" role="status">${esc(label)}の記録はありません</div>`}
function svgPlot(data,type){
 const weightMode=type==='weight',field=weightMode?'weight':'sleepHours';
 const recorded=data.map((d,i)=>({...d,i})).filter(d=>d[field]!==null);
 if(!recorded.length)return graphEmpty(weightMode?'体重':'睡眠');
 const W=Math.max(560,data.length*27+110),H=310,L=58,R=20,T=22,B=55;
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
 const ticks=data.map((d,i)=>i%step===0||i===data.length-1?`<text x="${x(i).toFixed(2)}" y="${H-B+20}" text-anchor="middle" class="svg-axis">${esc(d.label||chartXLabel(d.date,analysisView))}</text>`:'').join('');
 let drawing='';
 if(!weightMode){
  const barW=Math.max(5,Math.min(23,plotW/data.length*0.65));
  drawing=recorded.map(d=>{
   const yy=y(d.sleepHours),hh=Math.max(0,T+plotH-yy);
   return `<rect class="svg-sleep-bar" x="${(x(d.i)-barW/2).toFixed(2)}" y="${yy.toFixed(2)}" width="${barW.toFixed(2)}" height="${hh.toFixed(2)}" rx="2"><title>${esc(d.date)}：${chartNumber(d.sleepHours)}時間</title></rect>`;
  }).join('');
 }else{
  // 連続して実測値が存在する日付の間だけ接続（空白の日を補間しない）。
  let parts=[];
  let seq=[];
  const flush=()=>{if(seq.length>1)parts.push(`<polyline class="svg-weight-line" points="${seq.map(p=>`${x(p.i).toFixed(2)},${y(p.weight).toFixed(2)}`).join(' ')}"/>`);seq=[];};
  data.forEach((d,i)=>{if(d.weight===null){flush()}else seq.push({...d,i})});flush();
  drawing=parts.join('')+recorded.map(d=>`<circle class="svg-weight-point" cx="${x(d.i).toFixed(2)}" cy="${y(d.weight).toFixed(2)}" r="4.4"><title>${esc(d.date)}：${d.weight.toFixed(1)} kg</title></circle>`).join('');
 }
 return `<svg class="analysis-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${weightMode?'体重（kg）':'睡眠時間（時間）'}の日付別${weightMode?'折れ線':'棒'}グラフ。記録のない日は空白。"><text x="${L}" y="13" class="svg-unit">${weightMode?'体重（kg）':'睡眠時間（時間）'}</text>${grid}<line x1="${L}" y1="${T}" x2="${L}" y2="${T+plotH}" class="svg-axis-line"/>${ticks}${drawing}<text x="${W-R}" y="${H-6}" text-anchor="end" class="svg-unit">日付</text></svg>`;
}
async function renderAnalysis(){
 $('#analysis-month').value=analysisMonth;
 const months=analysisView==='monthly'?monthsUpTo(analysisMonth,6):[analysisMonth];
 const days=months.flatMap(daysInMonth);
 if(currentUser?.emailVerified)await Promise.all(months.map(loadMonth));
 $$('#analysis-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===analysisView));
 $$('#analysis-targets button').forEach(b=>{const active=b.dataset.target===analysisTarget;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 const s=sumFor(days),fmt=min=>`${Math.floor(min/60)}時間${min%60?`${min%60}分`:''}`;
 const weightAvg=s.weights.length?(s.weights.reduce((sum,x)=>sum+x.value,0)/s.weights.length).toFixed(1)+' kg':'—';
 const latestWeight=s.weights.at(-1);
 const sleepStats=[['記録した睡眠 合計',fmt(s.s),'入力した熟睡時間'],['休息 合計',fmt(s.r),'起きて布団の中にいた時間'],['記録のある日',`${s.recorded}日`,'対象期間内の登録'],['記録日の平均睡眠',s.sleepRecorded?fmt(Math.round(s.s/s.sleepRecorded/30)*30):'—','睡眠・休息の入力がある日で計算']];
 const weightStats=[['体重 平均',weightAvg,`体重入力のある${s.weights.length}日で計算`],['期間内の直近体重',latestWeight?latestWeight.value.toFixed(1)+' kg':'—',latestWeight?latestWeight.date+'の記録':'記録なし']];
 const stats=analysisTarget==='sleep'?sleepStats:analysisTarget==='weight'?weightStats:[...sleepStats,...weightStats];
 $('#analysis-stats').innerHTML=stats.map(x=>`<div class="statbox"><small>${esc(x[0])}</small><strong>${esc(x[1])}</strong><p>${esc(x[2])}</p></div>`).join('');
 $('#analysis-title').textContent=analysisView==='monthly'?`${months[0].replace('-','年')}月〜${analysisMonth.replace('-','年')}月の記録`:`${analysisMonth.replace('-','年')}月の記録`;
 $('#sleep-graph-panel').hidden=analysisTarget==='weight';$('#weight-graph-panel').hidden=analysisTarget==='sleep';
 const data=groupedGraphData(days,analysisView);
 $('#analysis-sleep-title').textContent=`睡眠時間の推移（${analysisView==='daily'?'日別':analysisView==='weekly'?'週別':'月別'}）`;
 $('#analysis-weight-title').textContent=`体重の推移（${analysisView==='daily'?'日別':analysisView==='weekly'?'週別':'月別'}）`;
 $$('.analysis-graph-description').forEach(x=>x.textContent=`横軸：${analysisView==='daily'?'日付':analysisView==='weekly'?'週':'月'}／縦軸：${x.closest('#sleep-graph-panel')?'睡眠時間（時間）':'体重（kg）'}（記録日の平均）`);
 if(analysisTarget!=='weight')$('#analysis-sleep-chart').innerHTML=svgPlot(data,'sleep');
 if(analysisTarget!=='sleep')$('#analysis-weight-chart').innerHTML=svgPlot(data,'weight');
 const showAll=analysisView==='daily';
 $('#analysis-bars').innerHTML=data.filter(d=>!showAll||d.sleepHours!==null||d.weight!==null).map(d=>{
  const label=d.label||d.date.slice(5),sleepLabel=d.sleepHours!==null?`${Math.round(d.sleepHours*10)/10}時間`:'未入力',weightLabel=d.weight!==null?`${d.weight.toFixed(1)} kg`:'未入力';
  if(analysisTarget==='weight')return `<div class="baritem"><div>${esc(label)}</div><div class="record-value-only">体重：${esc(weightLabel)}</div></div>`;
  return `<div class="baritem"><div>${esc(label)}</div><div class="barbg"><div class="barvalue" style="width:${d.sleepHours!==null?Math.min(100,d.sleepHours/24*100):0}%"></div></div><strong>${esc(sleepLabel)}${analysisTarget==='both'&&weightLabel!=='未入力'?' / '+esc(weightLabel):''}</strong></div>`;
 }).join('')||'<span class="muted">まだ記録がありません</span>';
}

function renderSettings(){
 applyTheme();$('#display-name').value=state.settings.name||'';$('#habit-bed').value=state.settings.habitBed||'23:00';$('#habit-wake').value=state.settings.habitWake||'07:00';$('#account-email').textContent=currentUser?.email||'—';$('#first-month').value=state.settings.firstMonth||'';updateDatePickerButtons();
 $('#theme-choices').innerHTML=Object.entries(themes).map(([id,t])=>`<button class="theme-choice ${state.settings.theme===id?'active':''}" data-id="${id}" aria-label="${t.name}" title="${t.name}"><i class="color-dot" style="background:${t.accent}"></i></button>`).join('');
 $$('#theme-choices button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{const old=state.settings.theme;state.settings.theme=b.dataset.id;applyTheme();try{await setDoc(userDoc(),{theme:state.settings.theme,updatedAt:serverTimestamp()},{merge:true});renderSettings();renderChart()}catch(e){state.settings.theme=old;applyTheme();renderSettings();throw e}})));
}
async function saveSettings(){await action($('#save-settings'),async()=>{
 const newSettings={name:$('#display-name').value.trim().slice(0,60),habitBed:$('#habit-bed').value,habitWake:$('#habit-wake').value,theme:state.settings.theme,firstMonth:$('#first-month').value||''};
 if(newSettings.habitBed===newSettings.habitWake){toast('普段の就寝時刻と起床時刻は異なる時刻を選んでください');return}
 await setDoc(userDoc(),{...newSettings,updatedAt:serverTimestamp()},{merge:true});
 state.settings={...state.settings,...newSettings};renderSettings();renderChart();toast('設定を保存しました');
});}
function makeId(){return 'med-'+(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2,10)}`)}
// 医薬品とサプリを同一管理。変更時は新規ドキュメントを追加し、変更前を履歴に保存する。
const timingGroups=[
 ['食前',['毎食前','朝食前','昼食前','夕食前']],
 ['食直前',['毎食直前','朝食直前','昼食直前','夕食直前']],
 ['食後',['毎食後','朝食後','昼食後','夕食後']],
 ['食直後',['毎食直後','朝食直後','昼食直後','夕食直後']],
 ['その他',['毎食間','朝昼の間','昼夕の間','起床時','就寝前','頓服','時刻指定']]
];
function medCurrent(m,today=iso(new Date())){return !m.supersededAt&&(!m.start||m.start<=today)&&(!m.end||m.end>=today)}
function medDateLabel(key){return /^\d{4}-\d{2}-\d{2}$/.test(key||'')?key.replace(/-/g,'/').replace(/\//,'年').replace(/\//,'月')+'日':'開始日未設定'}
function medUnitLabel(m){const n=validTablets(m.dose);return n===null?'1回量未登録':`${n===0.5?'半':n}${m.unit||'錠'}`}
function medTitle(m){const strength=m.strength!==undefined&&m.strength!==''&&m.strength!==null?` ${m.strength}${m.strengthUnit||'mg'}`:'';return `${esc(m.name||'名称未登録')}${esc(strength)}`}
function medInfoHtml(m){
 const timing=Array.isArray(m.timings)?m.timings.join('・'):'';
 const timingText=[timing,m.otherTiming||''].filter(Boolean).join('／')||'服用タイミング未登録';
 return `<div class="med-info"><strong>${medTitle(m)}</strong><div>${esc(m.kind==='supplement'?'サプリメント':'お薬')}・${esc(medUnitLabel(m))}</div><div>${esc(timingText)}</div>${m.end?`<div>服用終了日：${esc(m.end)}</div>`:''}${m.provider?`<div>医療機関・薬局：${esc(m.provider)}</div>`:''}${m.note?`<div class="med-extra-note">${esc(m.note)}</div>`:''}</div>`;
}
function renderMedications(){
 const target=$('#med-list');if(!target)return;
 $$('.med-list-tabs button').forEach(btn=>btn.classList.toggle('active',btn.dataset.medFilter===medFilter));
 const ms=state.medicines.filter(m=>m.name&& (medFilter==='history'||medCurrent(m))).slice().sort((a,b)=>(b.start||'').localeCompare(a.start||'')||(b.id||'').localeCompare(a.id||''));
 if(!ms.length){target.innerHTML=`<p class="med-empty">${medFilter==='current'?'現在服用中として登録された薬・サプリはありません。':'登録された履歴はありません。'}</p>`;return}
 const group=new Map();ms.forEach(m=>{const key=m.start||'未設定';if(!group.has(key))group.set(key,[]);group.get(key).push(m)});
 target.innerHTML=[...group].map(([date,records])=>`<section class="med-date-group"><h3>${esc(date==='未設定'?'服用開始日未設定':medDateLabel(date)+' 服用開始')}</h3>${records.map(m=>`<div class="med-record">${medInfoHtml(m)}<div class="med-record-buttons"><button type="button" class="btn small" data-med-copy="${esc(m.id)}">この内容から変更登録</button>${medCurrent(m)?`<button type="button" class="btn small" data-med-stop="${esc(m.id)}">服用を終了</button>`:''}</div></div>`).join('')}</section>`).join('');
 target.querySelectorAll('[data-med-copy]').forEach(b=>b.addEventListener('click',()=>populateMedicationForm(state.medicines.find(m=>m.id===b.dataset.medCopy))));
 target.querySelectorAll('[data-med-stop]').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{
  const m=state.medicines.find(m=>m.id===b.dataset.medStop);if(!m)return;
  const end=prompt('服用終了日（YYYY-MM-DD）を入力してください',iso(new Date()));
  if(end===null)return;
  if(!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(end)||new Date(end+'T12:00:00').toString()==='Invalid Date'||m.start&&end<m.start){toast('服用開始日以降の正しい終了日を入力してください');return}
  await setDoc(medRef(m.id),{end,updatedAt:serverTimestamp()},{merge:true});m.end=end;renderMedications();renderInput();toast('服用終了日を記録しました');
 })));
}
function buildMedTimingChoices(){
 $('#med-timings').innerHTML=timingGroups.map(([group,choices])=>`<fieldset class="med-timing-group"><legend>${group}</legend><div>${choices.map(v=>`<label class="med-timing-choice"><input type="checkbox" name="med-timing" value="${esc(v)}"><span>${esc(v)}</span></label>`).join('')}</div></fieldset>`).join('');
}
function clearMedicationForm(){
 $('#med-form').reset();$('#med-based-on').value='';$('#med-start').value=iso(new Date());$('#med-end').value='';$('#med-form-title').textContent='お薬・サプリを登録';$('#med-submit').textContent='登録する';
 updateDatePickerButtons();
}
function populateMedicationForm(m){
 if(!m)return;$('#med-based-on').value=m.id;$('#med-kind').value=m.kind||'medicine';$('#med-name').value=m.name||'';$('#med-strength').value=m.strength??'';$('#med-strength-unit').value=m.strengthUnit||'mg';$('#med-dose').value=String(validTablets(m.dose)||1);$('#med-unit').value=m.unit||'錠';$('#med-other-timing').value=m.otherTiming||'';$('#med-provider').value=m.provider||'';$('#med-note').value=m.note||'';$('#med-start').value=iso(new Date());$('#med-end').value='';
 const selected=new Set(m.timings||[]);$$('#med-timings input').forEach(x=>x.checked=selected.has(x.value));$('#med-form-title').textContent='内容を変更して新しい履歴を登録';$('#med-submit').textContent='変更内容を登録';updateDatePickerButtons();
 document.querySelector('#med-form').scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveMedication(){await action($('#med-submit'),async()=>{
 const name=$('#med-name').value.trim().slice(0,80),start=$('#med-start').value,end=$('#med-end').value,based=$('#med-based-on').value;
 if(!name){toast('薬・サプリの名前を入力してください');return}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)){toast('服用開始日を選択してください');return}
 if(end&&end<start){toast('服用終了日は服用開始日以降を選択してください');return}
 const strengthString=$('#med-strength').value.trim();const strength=strengthString===''?'':Number(strengthString);
 if(strength!==''&&(!Number.isFinite(strength)||strength<=0||strength>100000)){toast('規格・含有量を確認してください');return}
 const timings=$$('#med-timings input:checked').map(x=>x.value);
 if(!timings.length&&!$('#med-other-timing').value.trim()){toast('飲むタイミングを1つ以上選んでください');return}
 const data={kind:$('#med-kind').value,name,strength,strengthUnit:$('#med-strength-unit').value,dose:Number($('#med-dose').value),unit:$('#med-unit').value,timings,otherTiming:$('#med-other-timing').value.trim().slice(0,120),start,end,provider:$('#med-provider').value.trim().slice(0,100),note:$('#med-note').value.trim().slice(0,500),previousId:based||'',updatedAt:serverTimestamp()};
 const newId=makeId(),batch=writeBatch(db);batch.set(medRef(newId),{...data,createdAt:serverTimestamp()});
 const old=state.medicines.find(m=>m.id===based);
 let previousUpdate=null;
 if(old){previousUpdate={supersededAt:start};if(start>old.start){const date=new Date(start+'T12:00:00');date.setDate(date.getDate()-1);previousUpdate.end=iso(date)}batch.set(medRef(old.id),{...previousUpdate,updatedAt:serverTimestamp()},{merge:true})}
 await batch.commit();
 if(old)Object.assign(old,previousUpdate);
 state.medicines.push({id:newId,...data});clearMedicationForm();renderMedications();renderInput();toast('お薬・サプリを登録しました');
});}
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
  tx(`${d}（${wd}）`,starts[0]+dims[0]/2,y+rowH/2,'bold 18px sans-serif',dayColorClass(year,month,d)==='sunday'?'#a84252':dayColorClass(year,month,d)==='saturday'?'#365b96':'#26354a','center');
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
$('#jump-month').addEventListener('change',e=>action(e.target,()=>jumpMonth(e.target.value)));$('#prev-month').addEventListener('click',()=>action($('#prev-month'),()=>monthShift(-1)));$('#next-month').addEventListener('click',()=>action($('#next-month'),()=>monthShift(1)));
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
$$('#analysis-tabs button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{analysisView=b.dataset.view;await renderAnalysis()})));
$$('#analysis-targets button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{analysisTarget=b.dataset.target;await renderAnalysis()})));
$('#save-settings').addEventListener('click',saveSettings);
// お薬・サプリ管理
buildMedTimingChoices();clearMedicationForm();
$('#med-form').addEventListener('submit',e=>{e.preventDefault();saveMedication()});
$('#med-reset').addEventListener('click',clearMedicationForm);
$('#med-start-picker').addEventListener('click',()=>openDatePicker('medStart'));
$('#med-end-picker').addEventListener('click',()=>openDatePicker('medEnd'));
$$('.med-list-tabs button').forEach(b=>b.addEventListener('click',()=>{medFilter=b.dataset.medFilter;renderMedications()}));
$('#selected-medicine').addEventListener('change',setDoseFromMedicine);
// 分析画面の独立した年月指定
$('#analysis-month').addEventListener('change',e=>action(e.target,async()=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))return;analysisMonth=e.target.value;await renderAnalysis()}));
for(const [id,n] of [['analysis-prev-month',-1],['analysis-next-month',1]])$('#'+id).addEventListener('click',()=>action($('#'+id),async()=>{const [y,m]=monthParts(analysisMonth),d=new Date(y,m-1+n,1);analysisMonth=dateString(d.getFullYear(),d.getMonth()+1,1).slice(0,7);await renderAnalysis()}));
// iPhone Safariで幅が崩れるネイティブ日付・年月入力を、同じ幅のカレンダー選択に置換。
// Firestoreへの保存形式（YYYY-MM-DD / YYYY-MM）は従来どおり維持。
let pickerKind='day',pickerYear=2026,pickerMonth=1,pickerDay=1;
const pad2=n=>String(n).padStart(2,'0');
function updateDatePickerButtons(){
 const day=$('#entry-date').value||state.selected||'';
 const first=$('#first-month').value||'';
 $('#entry-date-text').textContent=/^\d{4}-\d{2}-\d{2}$/.test(day)?day.replaceAll('-','/'):'日付を選ぶ';
 $('#first-month-text').textContent=/^\d{4}-\d{2}$/.test(first)?first.replace('-','年')+'月':'指定しない';
 for(const key of ['start','end']){const el=$('#med-'+key+'-text');if(el){const v=$('#med-'+key).value;el.textContent=/^\d{4}-\d{2}-\d{2}$/.test(v)?v.replaceAll('-','/'):key==='start'?'日付を選ぶ':'指定しない'}}
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
 const monthOnly=pickerKind==='month';
 $('#picker-day-area').hidden=monthOnly;
 $('#picker-today').hidden=monthOnly;
 $('#picker-clear').hidden=!(monthOnly||pickerKind==='medEnd');
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
 let value=kind==='day'?$('#entry-date').value:kind==='month'?$('#first-month').value:kind==='medStart'?$('#med-start').value:$('#med-end').value;
 if(!/^\d{4}-\d{2}/.test(value))value=iso(new Date());
 const chunks=value.split('-').map(Number);
 pickerYear=Math.max(1900,Math.min(2100,chunks[0]));
 pickerMonth=Math.max(1,Math.min(12,chunks[1]||1));
 pickerDay=chunks[2]||1;
 clampPickerDay();
 $('#date-picker-title').textContent=kind==='day'?'記録する日付':kind==='month'?'最初に表示する月':kind==='medStart'?'服用開始日':'服用終了日';
 renderDatePicker();$('#date-picker-dialog').showModal();
}
function applyDatePicker(clear=false){
 const field=pickerKind==='day'?$('#entry-date'):pickerKind==='month'?$('#first-month'):pickerKind==='medStart'?$('#med-start'):$('#med-end');
 field.value=clear?'':(pickerKind==='month'?`${pickerYear}-${pad2(pickerMonth)}`:dateString(pickerYear,pickerMonth,pickerDay));
 $('#date-picker-dialog').close();
 updateDatePickerButtons();
 // 既存のFirestoreデータ再取得処理に連携。設定側は「設定を保存」で確定。
 if(pickerKind==='day')field.dispatchEvent(new Event('change',{bubbles:true}));
}
$('#entry-date-picker').addEventListener('click',()=>openDatePicker('day'));
$('#first-month-picker').addEventListener('click',()=>openDatePicker('month'));
$('#date-picker-close').addEventListener('click',()=>$('#date-picker-dialog').close());
$('#picker-year').innerHTML=Array.from({length:201},(_,i)=>`<option value="${i+1900}">${i+1900}年</option>`).join('');
$('#picker-month').innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}月</option>`).join('');
$('#picker-year').addEventListener('change',e=>{pickerYear=Number(e.target.value);clampPickerDay();renderDatePicker()});
$('#picker-month').addEventListener('change',e=>{pickerMonth=Number(e.target.value);clampPickerDay();renderDatePicker()});
$('#picker-prev').addEventListener('click',()=>pickerStep(-1));
$('#picker-next').addEventListener('click',()=>pickerStep(1));
$('#picker-days').addEventListener('click',e=>{const b=e.target.closest('button[data-day]');if(!b)return;pickerDay=Number(b.dataset.day);renderDatePicker()});
$('#picker-today').addEventListener('click',()=>{const now=new Date();pickerYear=now.getFullYear();pickerMonth=now.getMonth()+1;pickerDay=now.getDate();renderDatePicker()});
$('#picker-clear').addEventListener('click',()=>{if(pickerKind==='month'||pickerKind==='medEnd')applyDatePicker(true)});
$('#picker-confirm').addEventListener('click',()=>applyDatePicker());
$('#date-picker-dialog').addEventListener('click',e=>{if(e.target.id==='date-picker-dialog')e.target.close()});

// 表を初期状態で表示するのはログイン＆確認済み後のみ。デモデータは入れない。
