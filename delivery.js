'use strict';
/* Delivery quotes are indicative, obtained ONLY from the server-side Lalamove API.
 * No API secrets, guessed prices, or unverified pickup coordinates appear in this file.
 */
(() => {
 const $d=id=>document.getElementById(id);
 const state={destination:null,quote:null,map:null,marker:null,quoteCaptcha:null,quoteBusy:false};
 const endpoint='/functions/v1/lalamove-quote';
 const fmt=n=>'₱'+Number(n).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
 const delivery=()=>($d('fulfillment')?.value==='Delivery');
 const subtotal=()=>itemSubtotal()+giftAmount();
 const validQuote=()=> delivery()&&state.quote&&new Date(state.quote.expiresAt).getTime()>Date.now()&&state.quote.address===$d('orderArea').value.trim();
 function status(text,kind='info'){
  const el=$d('deliveryQuoteResult');el.textContent=text;el.dataset.status=kind;
 }
 function updateSummary(){
  const fee=$d('deliveryFeeDisplay');if(!fee)return;
  if(!delivery()){
   fee.textContent='Free (pickup)'; $d('grandTotal').textContent=fmt(subtotal());return;
  }
  if(validQuote()){
   fee.textContent=`${fmt(state.quote.fee)} · estimate`;
   $d('grandTotal').textContent=fmt(subtotal()+state.quote.fee);
  }else{
   fee.textContent='To be confirmed';$d('grandTotal').textContent=`${fmt(subtotal())} + delivery`;
  }
 }
 function methodChanged(){
  $d('deliveryQuoteSection').hidden=!delivery();
  $d('orderArea').required=delivery();
  $d('orderArea').placeholder=delivery()?'House / unit, street, subdivision, barangay, city':'Pickup notes (optional)';
  if(!delivery())status('Pickup has no delivery fee. The bakery confirms the collection instructions.');
  updateSummary();
 }
 function invalidate(reason='Delivery pin or address changed. Request an updated quote.'){
  state.quote=null;status(reason);updateSummary();
 }
 function setPin(lat,lng,from){
  const latitude=Number(lat),longitude=Number(lng);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<5||latitude>22||longitude<116||longitude>127){
   $d('destinationPinStatus').textContent='Select a location within the Philippines.';return;
  }
  state.destination={lat:latitude,lng:longitude};
  $d('destinationPinStatus').textContent=`Delivery pin selected (${latitude.toFixed(5)}, ${longitude.toFixed(5)}) · ${from}`;
  if(state.map&&window.L){
   if(!state.marker)state.marker=L.marker([latitude,longitude]).addTo(state.map);
   else state.marker.setLatLng([latitude,longitude]);
   state.map.panTo([latitude,longitude]);
  }
  invalidate('Delivery pin selected. Request a Lalamove quote using your full address.');
 }
 let leafletPromise=null;
 function loadLeaflet(){
  if(window.L)return Promise.resolve();
  if(leafletPromise)return leafletPromise;
  leafletPromise=new Promise((resolve,reject)=>{
   const style=document.createElement('link');style.rel='stylesheet';style.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(style);
   const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error('Map unavailable'));document.head.appendChild(script);
  });return leafletPromise;
 }
 async function showMap(){
  const el=$d('deliveryMap');el.hidden=false;
  try{
   await loadLeaflet();
   if(!state.map){
    state.map=L.map(el,{scrollWheelZoom:false}).setView([14.474,120.995],12); // Map starting view only — not the bakery pickup point
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(state.map);
    state.map.on('click',e=>setPin(e.latlng.lat,e.latlng.lng,'Map pin'));
   }
   setTimeout(()=>state.map.invalidateSize(),70);
   $d('destinationPinStatus').textContent='Tap the exact destination on the map. Do not pin the bakery origin.';
  }catch{
   $d('destinationPinStatus').textContent='Map could not load. You can still use your device location.';
  }
 }
 function useLocation(){
  if(!navigator.geolocation){$d('destinationPinStatus').textContent='Location services are not available in this browser.';return;}
  $d('destinationPinStatus').textContent='Requesting permission for your current location…';
  navigator.geolocation.getCurrentPosition(
   p=>setPin(p.coords.latitude,p.coords.longitude,'Current device location'),
   ()=>{$d('destinationPinStatus').textContent='Location permission was denied or unavailable. Choose a map pin instead.'},
   {enableHighAccuracy:true,timeout:13000,maximumAge:0}
  );
 }
 function captchaToken(){return $d('deliveryQuoteCaptcha').querySelector('input[name="cf-turnstile-response"]')?.value||''}
 function enableQuoteCaptcha(){
  const slot=$d('deliveryQuoteCaptcha');
  if(!slot||!slot.getClientRects().length||!delivery())return;
  if(!turnstilePublicSiteKey||state.quoteCaptcha!==null)return;
  let retries=0;
  const attempt=()=>{
   if(state.quoteCaptcha!==null)return true;
   if(!window.turnstile)return false;
   try{state.quoteCaptcha=turnstile.render('#deliveryQuoteCaptcha',{sitekey:turnstilePublicSiteKey,theme:'auto'});return true}catch{return false}
  };
  if(attempt())return;
  const id=setInterval(()=>{retries++;if(attempt()||retries>80)clearInterval(id)},300);
 }
 async function calculate(){
  if(!delivery())return;
  if(state.quoteBusy)return;
  const address=$d('orderArea').value.trim();
  if(address.length<10){status('Enter the full delivery address (street, barangay and city).','error');$d('orderArea').focus();return;}
  if(!state.destination){status('Please set your exact destination pin first.','error');return;}
  const token=captchaToken();
  if(token.length<20){status('Please complete the security check before requesting the live quotation.','error');enableQuoteCaptcha();return;}
  state.quoteBusy=true;$d('calculateDeliveryFee').disabled=true;status('Requesting live Lalamove pricing…');
  try{
   const data=await apiFetch(endpoint,{method:'POST',body:JSON.stringify({destination:{...state.destination,address},turnstileToken:token})});
   if(!data.quoteToken||!Number.isFinite(Number(data.fee))||data.currency!=='PHP'||!data.expiresAt)throw new Error('Lalamove returned an incomplete quote.');
   state.quote={quoteToken:data.quoteToken,fee:Number(data.fee),expiresAt:data.expiresAt,address,distanceKm:Number(data.distanceKm)||null};
   const distance=state.quote.distanceKm?` · ${state.quote.distanceKm.toFixed(1)} km courier route`:'';
   status(`Live Lalamove estimate: ${fmt(state.quote.fee)}${distance}. Quotation expires in about 5 minutes; final fee is confirmed before fulfillment.`,'success');
   updateSummary();
  }catch(e){invalidate(`Live Lalamove pricing is not available: ${e.message||'Please contact the bakery for a quote.'}`);$d('deliveryQuoteResult').dataset.status='error';}
  finally{state.quoteBusy=false;$d('calculateDeliveryFee').disabled=false;if(window.turnstile&&state.quoteCaptcha!==null){try{turnstile.reset(state.quoteCaptcha)}catch{}}}
 }
 function orderFields(){return delivery() ? {
  deliveryDestination:state.destination ? {...state.destination,address:$d('orderArea').value.trim()}:null,
  quoteToken:validQuote()?state.quote.quoteToken:null
 } : {quoteToken:null,deliveryDestination:null};}
 function onDetailsOpen(){methodChanged();if(state.map&&$d('deliveryMap').hidden===false)setTimeout(()=>state.map.invalidateSize(),50);enableQuoteCaptcha()}
 window.DB_DELIVERY={methodChanged,updateSummary,enableQuoteCaptcha,onDetailsOpen,orderFields};
 $d('chooseDeliveryPin')?.addEventListener('click',showMap);
 $d('useDeliveryLocation')?.addEventListener('click',useLocation);
 $d('calculateDeliveryFee')?.addEventListener('click',calculate);
 $d('orderArea')?.addEventListener('input',()=>invalidate('Delivery address changed. Confirm your pin and request a new quote.'));
 methodChanged();
})();
