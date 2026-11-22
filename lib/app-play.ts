// ¿Studio está abierta desde la app de Google Play? (app «solo para usar»)
// Google cobra comisión por lo que se vende dentro de una app de su tienda. Por eso, cuando Studio se abre
// desde la app de Play, no muestra precios, botones de compra ni instrucciones de pago: la persona solo
// inicia sesión y usa lo que ya tiene. Contrata en el sitio web o directamente con InnovationTECH.
//
// Cómo se sabe: Android pone «android-app://<paquete>» como origen de la primera página, y el paquete de
// la tienda abre Studio en INICIO_APP_PLAY. Se recuerda en la sesión (no en el dispositivo: el navegador
// Chrome del mismo teléfono comparte lo guardado y ahí sí se puede comprar).

export const CLAVE_APP_PLAY = "its-app-play"; // sessionStorage
export const INICIO_APP_PLAY = "/?app=play"; // «Start URL» del paquete de Google Play (docs/google-play.md)

export function esAppPlay(o: { referrer: string; search: string; guardado: string | null }): boolean {
  if (o.guardado === "1") return true;
  if (o.referrer.startsWith("android-app://") && o.referrer.length > "android-app://".length) return true;
  try {
    return new URLSearchParams(o.search).get("app") === "play";
  } catch {
    return false;
  }
}

// Lo mismo que esAppPlay, como guion que corre ANTES de pintar la página (app/layout.tsx): marca
// <html data-app-play="1"> para que lo de compras nunca alcance a verse, y lo recuerda en la sesión.
// Las pruebas comprueban que decide igual que esAppPlay.
export const GUION_APP_PLAY = `(function(){try{var g=null;try{g=sessionStorage.getItem("${CLAVE_APP_PLAY}")}catch(e){}var r=document.referrer||"";var si=g==="1"||(r.indexOf("android-app://")===0&&r.length>14);if(!si){try{si=new URLSearchParams(location.search).get("app")==="play"}catch(e){}}if(si){document.documentElement.dataset.appPlay="1";try{sessionStorage.setItem("${CLAVE_APP_PLAY}","1")}catch(e){}}}catch(e){}})();`;

// En el navegador: ¿la página quedó marcada como abierta desde la app de la tienda?
export const marcadaAppPlay = () => typeof document !== "undefined" && document.documentElement.dataset.appPlay === "1";
