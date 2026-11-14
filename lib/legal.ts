// Textos legales de InnovationTECH Studio (Términos de servicio y Política de privacidad).
// BORRADOR del 13 de noviembre de 2026: debe revisarlo un abogado o contador antes del lanzamiento.
// Si cambia el contenido de fondo, sube VERSION_LEGAL: las cuentas nuevas guardan qué versión aceptaron.

export const VERSION_LEGAL = "2026-11-13";
export const CONTACTO_LEGAL = "hectordehoyos053@gmail.com";

export type Seccion = { titulo: string; parrafos: string[] };
export type DocumentoLegal = { titulo: string; actualizado: string; secciones: Seccion[] };

export const TERMINOS: Record<"es" | "en", DocumentoLegal> = {
  es: {
    titulo: "Términos de servicio",
    actualizado: "Última actualización: 13 de noviembre de 2026",
    secciones: [
      {
        titulo: "1. Quiénes somos",
        parrafos: [
          "InnovationTECH Studio («Studio») es un servicio de InnovationTECH, negocio operado por Hector De Hoyos en San Antonio, Texas, Estados Unidos («InnovationTECH», «nosotros»).",
          `Contacto para soporte, cancelaciones y cualquier duda sobre estos términos: ${CONTACTO_LEGAL}.`,
        ],
      },
      {
        titulo: "2. Aceptación",
        parrafos: [
          "Al crear una cuenta o usar Studio aceptas estos Términos y la Política de privacidad. Si no estás de acuerdo, no uses Studio.",
          "Studio es para personas mayores de 18 años que lo usan para su negocio o trabajo. Si creas una cuenta para un negocio, confirmas que tienes autorización para aceptar estos términos en su nombre.",
        ],
      },
      {
        titulo: "3. El servicio",
        parrafos: [
          "Studio es una aplicación web para crear contenido con inteligencia artificial: textos, imágenes, voces, subtítulos, reels, videos y música.",
          "Podemos mejorar, cambiar o quitar funciones. Si un cambio quita algo importante de tu plan, te avisaremos con anticipación razonable.",
        ],
      },
      {
        titulo: "4. Cuentas y equipo",
        parrafos: [
          "Necesitas una cuenta con un correo confirmado o con Google. Eres responsable de lo que pase en tu cuenta y de mantener tu acceso seguro.",
          "El plan Básico es para una sola persona (el dueño). En el plan Pro, el dueño puede invitar a otras personas hasta el número de lugares indicado en la app, y es responsable del uso que hagan de Studio.",
        ],
      },
      {
        titulo: "5. Planes, prueba gratis y límites",
        parrafos: [
          "Studio se ofrece con planes mensuales (Básico y Pro) con los precios publicados en la app al momento de contratar. Al registrarte tienes una prueba gratis del plan Pro, con la duración indicada en la app.",
          "Cada plan incluye una cantidad de usos por mes (textos, imágenes, voces y subtítulos) que se reinicia el día 1 de cada mes, hora de Texas. Lo que no uses en el mes no se acumula.",
          "Puedes comprar paquetes extra de pago único. El saldo de un paquete no vence, se usa después de lo incluido en el mes y solo sirve mientras tu cuenta esté activa y con un plan que incluya esas herramientas.",
          "Si conectas tu propia cuenta de Cloudflare, el uso de la IA corre en tu cuenta (con sus propias condiciones y límites) y no se cuenta en los límites del mes. Igual necesitas un plan activo.",
        ],
      },
      {
        titulo: "6. Pagos",
        parrafos: [
          "Los pagos con tarjeta los procesa Stripe y se cobran automáticamente cada mes hasta que canceles. También puedes pagar a mano (efectivo, Zelle o Cash App); en ese caso tu plan queda activo hasta la fecha pagada.",
          "Los precios no incluyen impuestos, salvo que se indique. Podemos cambiar los precios avisándote antes; el nuevo precio aplica desde tu siguiente periodo.",
          "Si un pago con tarjeta falla o vence un pago a mano, tu cuenta se pausa hasta que pagues.",
          "Todos los precios y cobros de InnovationTECH son en dólares de Estados Unidos (USD). Los pagos a mano por Cash App se envían únicamente a la cuenta de Cash App de InnovationTECH que te damos directamente; no pagues a ninguna otra cuenta.",
          "Cada cobro lleva su factura: por los pagos con tarjeta (plan mensual y paquetes extra) Stripe te la envía al correo de tu cuenta y la puedes descargar en Mi cuenta → Administrar suscripción. Por un pago a mano, pídenos tu recibo y te lo enviamos.",
        ],
      },
      {
        titulo: "7. Cancelación y reembolsos",
        parrafos: [
          "Puedes cancelar en cualquier momento desde Mi cuenta → Administrar suscripción, o escribiéndonos. Al cancelar, tu cuenta se pausa y ya no se te cobra.",
          "No hay reembolsos por meses pagados, días sin usar ni paquetes comprados, salvo que la ley lo exija o que nosotros cometamos un error de cobro, en cuyo caso lo corregiremos.",
        ],
      },
      {
        titulo: "8. Uso aceptable",
        parrafos: [
          "No uses Studio para crear o difundir contenido ilegal, engañoso, que acose o dañe a otras personas, que suplante a personas, marcas u organizaciones reales, que infrinja derechos de autor o marcas, o contenido sexual que involucre a menores.",
          "No intentes saltarte los límites, revender el servicio sin permiso, ni atacar o sobrecargar Studio.",
          "Podemos pausar o cerrar una cuenta que no cumpla estas reglas.",
        ],
      },
      {
        titulo: "9. Tu contenido",
        parrafos: [
          "Lo que creas con Studio es tuyo. Eres responsable de revisarlo antes de publicarlo y de tener los permisos de cualquier material que subas (fotos, logos, música, voces).",
          "La inteligencia artificial puede equivocarse o producir resultados parecidos a los de otras personas. Revisa datos, precios y afirmaciones antes de usarlos.",
          "La música y los sonidos incluidos en Studio tienen sus propias licencias (indicadas en la app). Respétalas al usarlos.",
          "InnovationTECH no se hace responsable del contenido que crees, subas o publiques con Studio: guiones, textos, imágenes, voces, videos (incluidos los que grabes o subas tú) y música. Tú decides qué se publica y dónde, y respondes por ello ante tus clientes, las redes sociales y terceros.",
        ],
      },
      {
        titulo: "10. Servicios de terceros",
        parrafos: [
          "Studio usa servicios de otras empresas (por ejemplo, Cloudflare para la IA, Stripe para los pagos, Google Firebase para las cuentas y Netlify para el hospedaje). Si usas tus propias claves de Cloudflare, Replicate o Anthropic, también aplican sus términos.",
        ],
      },
      {
        titulo: "11. Garantías y responsabilidad",
        parrafos: [
          "Studio se ofrece «tal cual» y «según disponibilidad». Hacemos lo posible por que funcione bien, pero no garantizamos que esté siempre disponible, sin errores, ni que el contenido generado sea adecuado para un fin específico.",
          "En la medida que lo permita la ley, InnovationTECH no es responsable de daños indirectos, pérdida de ganancias o de datos, y su responsabilidad total se limita a lo que pagaste por Studio en los 3 meses anteriores al reclamo.",
        ],
      },
      {
        titulo: "12. Cambios a estos términos",
        parrafos: [
          "Podemos actualizar estos términos. Si el cambio es importante, te avisaremos en la app o por correo antes de que aplique. Seguir usando Studio después del cambio significa que lo aceptas.",
        ],
      },
      {
        titulo: "13. Ley aplicable",
        parrafos: [
          "Estos términos se rigen por las leyes del estado de Texas, Estados Unidos. Antes de cualquier reclamo, escríbenos para intentar resolverlo de buena fe.",
        ],
      },
    ],
  },
  en: {
    titulo: "Terms of Service",
    actualizado: "Last updated: November 13, 2026",
    secciones: [
      {
        titulo: "1. Who we are",
        parrafos: [
          "InnovationTECH Studio (“Studio”) is a service of InnovationTECH, a business operated by Hector De Hoyos in San Antonio, Texas, United States (“InnovationTECH”, “we”).",
          `Contact for support, cancellations and any question about these terms: ${CONTACTO_LEGAL}.`,
        ],
      },
      {
        titulo: "2. Acceptance",
        parrafos: [
          "By creating an account or using Studio you accept these Terms and the Privacy Policy. If you don’t agree, don’t use Studio.",
          "Studio is for people 18 or older who use it for their business or work. If you create an account for a business, you confirm you are authorized to accept these terms on its behalf.",
        ],
      },
      {
        titulo: "3. The service",
        parrafos: [
          "Studio is a web app to create content with artificial intelligence: copy, images, voices, subtitles, reels, videos and music.",
          "We may improve, change or remove features. If a change removes something important from your plan, we will give you reasonable advance notice.",
        ],
      },
      {
        titulo: "4. Accounts and team",
        parrafos: [
          "You need an account with a confirmed email or Google. You are responsible for activity in your account and for keeping your access secure.",
          "The Basic plan is for one person (the owner). On the Pro plan, the owner can invite other people up to the number of seats shown in the app, and is responsible for how they use Studio.",
        ],
      },
      {
        titulo: "5. Plans, free trial and limits",
        parrafos: [
          "Studio is offered in monthly plans (Basic and Pro) at the prices shown in the app when you subscribe. When you sign up you get a free trial of the Pro plan, for the length shown in the app.",
          "Each plan includes a number of uses per month (copy, images, voices and subtitles) that resets on the 1st of each month, Texas time. Unused amounts do not carry over.",
          "You can buy one-time extra packs. A pack balance does not expire, is used after your monthly allowance, and only works while your account is active and on a plan that includes those tools.",
          "If you connect your own Cloudflare account, AI usage runs on your account (with its own terms and limits) and does not count toward the monthly limits. You still need an active plan.",
        ],
      },
      {
        titulo: "6. Payments",
        parrafos: [
          "Card payments are processed by Stripe and charged automatically every month until you cancel. You can also pay manually (cash, Zelle or Cash App); in that case your plan stays active until the paid date.",
          "Prices do not include taxes unless stated. We may change prices with advance notice; the new price applies from your next period.",
          "If a card payment fails or a manual payment expires, your account is paused until you pay.",
          "All InnovationTECH prices and charges are in United States dollars (USD). Manual payments by Cash App are sent only to the InnovationTECH Cash App account that we give you directly; do not pay any other account.",
          "Every charge comes with an invoice: for card payments (monthly plan and extra packs) Stripe emails it to your account’s address and you can download it from My account → Manage subscription. For a manual payment, ask us for your receipt and we will send it.",
        ],
      },
      {
        titulo: "7. Cancellation and refunds",
        parrafos: [
          "You can cancel at any time from My account → Manage subscription, or by writing to us. When you cancel, your account is paused and you are no longer charged.",
          "There are no refunds for paid months, unused days or purchased packs, unless required by law or we made a billing mistake, in which case we will correct it.",
        ],
      },
      {
        titulo: "8. Acceptable use",
        parrafos: [
          "Do not use Studio to create or share content that is illegal, deceptive, harasses or harms others, impersonates real people, brands or organizations, infringes copyrights or trademarks, or sexual content involving minors.",
          "Do not try to bypass the limits, resell the service without permission, or attack or overload Studio.",
          "We may pause or close an account that breaks these rules.",
        ],
      },
      {
        titulo: "9. Your content",
        parrafos: [
          "What you create with Studio is yours. You are responsible for reviewing it before publishing and for having permission for any material you upload (photos, logos, music, voices).",
          "Artificial intelligence can make mistakes or produce results similar to other people’s. Check facts, prices and claims before using them.",
          "The music and sounds included in Studio have their own licenses (shown in the app). Respect them when you use them.",
          "InnovationTECH is not responsible for the content you create, upload or publish with Studio: scripts, copy, images, voices, videos (including those you record or upload yourself) and music. You decide what gets published and where, and you answer for it to your customers, social networks and third parties.",
        ],
      },
      {
        titulo: "10. Third-party services",
        parrafos: [
          "Studio uses services from other companies (for example, Cloudflare for AI, Stripe for payments, Google Firebase for accounts and Netlify for hosting). If you use your own Cloudflare, Replicate or Anthropic keys, their terms also apply.",
        ],
      },
      {
        titulo: "11. Warranties and liability",
        parrafos: [
          "Studio is provided “as is” and “as available”. We do our best for it to work well, but we do not guarantee it will always be available or error-free, or that generated content will fit a specific purpose.",
          "To the extent permitted by law, InnovationTECH is not liable for indirect damages, lost profits or lost data, and its total liability is limited to what you paid for Studio in the 3 months before the claim.",
        ],
      },
      {
        titulo: "12. Changes to these terms",
        parrafos: [
          "We may update these terms. If the change is important, we will notify you in the app or by email before it applies. Continuing to use Studio after the change means you accept it.",
        ],
      },
      {
        titulo: "13. Governing law",
        parrafos: [
          "These terms are governed by the laws of the State of Texas, United States. Before any claim, write to us so we can try to resolve it in good faith.",
        ],
      },
    ],
  },
};

export const PRIVACIDAD: Record<"es" | "en", DocumentoLegal> = {
  es: {
    titulo: "Política de privacidad",
    actualizado: "Última actualización: 10 de noviembre de 2026",
    secciones: [
      {
        titulo: "1. Quién es responsable",
        parrafos: [
          `InnovationTECH, negocio operado por Hector De Hoyos en San Antonio, Texas, es responsable de los datos de InnovationTECH Studio. Contacto: ${CONTACTO_LEGAL}.`,
        ],
      },
      {
        titulo: "2. Qué datos guardamos",
        parrafos: [
          "Datos de tu cuenta: correo, nombre y foto de perfil si entras con Google, y si tu correo está confirmado (los guarda Google Firebase).",
          "Datos de tu negocio: el nombre que escribas, tu plan y su estado, los miembros e invitaciones de tu equipo, tu uso del mes, tu saldo de paquetes, y el historial de pagos a mano (monto, método, fechas y notas).",
          "Si pagas con tarjeta: el identificador de cliente y de suscripción en Stripe. Los datos de tu tarjeta los guarda Stripe; nosotros nunca los vemos ni los guardamos.",
          "Si conectas tu cuenta de Cloudflare: tu Account ID y tu token, guardados cifrados. Solo nuestro servidor puede leerlos para usar la IA; en la app solo se muestran los últimos 4 caracteres de la cuenta.",
          "El registro de que aceptaste estos documentos (versión y fecha) y el historial de paquetes agregados o quitados de tu saldo.",
          "Datos técnicos que generan los servicios de hospedaje (por ejemplo, dirección IP y registros de errores) para mantener Studio funcionando y seguro.",
        ],
      },
      {
        titulo: "3. Lo que creas",
        parrafos: [
          "Tus textos, imágenes, videos, proyectos y ajustes se guardan en tu navegador (en tu dispositivo), no en nuestros servidores, salvo lo que se indica arriba.",
          "Para generar contenido, lo que escribes o subes (por ejemplo, una descripción, una foto de referencia o un audio para subtítulos) se envía al servicio de IA que corresponda: Cloudflare Workers AI, o Replicate o Anthropic si usas tus propias claves. Esos servicios lo procesan según sus propias políticas.",
          "Si usas las tomas de video con IA, la foto que marcas y el movimiento que escribes se envían a fal.ai para generar el clip. Esa foto y el clip que resulta se guardan en nuestro almacenamiento privado (Cloudflare R2), ligados a tu negocio, para armar tu video y no cobrarte dos veces la misma toma. Los de la prueba gratis se borran a los 30 días; los demás se conservan hasta que nos pidas borrarlos.",
          "No subas datos personales sensibles de otras personas en tus pedidos a la IA.",
        ],
      },
      {
        titulo: "4. Para qué usamos tus datos",
        parrafos: [
          "Para darte el servicio: iniciar sesión, aplicar tu plan y límites, cobrar, atender soporte, avisarte de cambios importantes y proteger Studio contra abusos.",
          "No vendemos tus datos ni los usamos para publicidad de terceros.",
        ],
      },
      {
        titulo: "5. Con quién los compartimos",
        parrafos: [
          "Solo con los proveedores que hacen funcionar Studio: Google Firebase (cuentas y base de datos), Stripe (pagos), Cloudflare (IA y almacenamiento de fotos y clips de video), fal.ai (generación de video con IA), Netlify (hospedaje) y, si tú lo eliges, Replicate o Anthropic. Además, al abrir la app tu navegador descarga tipografías de Google Fonts y, si usas «quitar fondo», un modelo desde jsDelivr; esos servicios reciben datos técnicos como tu dirección IP. También compartimos datos si la ley nos lo exige.",
        ],
      },
      {
        titulo: "6. Cuánto tiempo los guardamos",
        parrafos: [
          "Mientras tengas una cuenta. Si nos pides borrarla, eliminamos los datos de tu cuenta y de tu negocio en un plazo razonable, salvo lo que debamos conservar por ley (por ejemplo, registros de pagos).",
        ],
      },
      {
        titulo: "7. Tus derechos",
        parrafos: [
          `Puedes pedirnos ver, corregir o borrar tus datos. El dueño del negocio puede desconectar la cuenta de Cloudflare en cualquier momento desde Mi cuenta. Escríbenos a ${CONTACTO_LEGAL}; te responderemos en un plazo razonable.`,
          "Al cerrar sesión puedes pedir que Studio borre de ese navegador tus claves guardadas, tu galería y «Mi marca». Hazlo si usas un dispositivo compartido.",
        ],
      },
      {
        titulo: "8. Seguridad",
        parrafos: [
          "Usamos conexiones cifradas (HTTPS), la base de datos solo es accesible desde nuestro servidor y las claves de Cloudflare se guardan cifradas. Ningún sistema es 100% seguro; si ocurre un problema que afecte tus datos, te avisaremos según lo exija la ley.",
        ],
      },
      {
        titulo: "9. Menores",
        parrafos: [
          "Studio es solo para mayores de 18 años. No recopilamos a sabiendas datos de menores.",
        ],
      },
      {
        titulo: "10. Cambios",
        parrafos: [
          "Podemos actualizar esta política. Si el cambio es importante, te avisaremos en la app o por correo.",
        ],
      },
    ],
  },
  en: {
    titulo: "Privacy Policy",
    actualizado: "Last updated: November 10, 2026",
    secciones: [
      {
        titulo: "1. Who is responsible",
        parrafos: [
          `InnovationTECH, a business operated by Hector De Hoyos in San Antonio, Texas, is responsible for InnovationTECH Studio’s data. Contact: ${CONTACTO_LEGAL}.`,
        ],
      },
      {
        titulo: "2. What data we keep",
        parrafos: [
          "Account data: email, name and profile photo if you sign in with Google, and whether your email is confirmed (stored by Google Firebase).",
          "Business data: the name you enter, your plan and its status, your team members and invitations, your monthly usage, your pack balance, and the history of manual payments (amount, method, dates and notes).",
          "If you pay by card: your Stripe customer and subscription IDs. Your card details are stored by Stripe; we never see or store them.",
          "If you connect your Cloudflare account: your Account ID and token, stored encrypted. Only our server can read them to use the AI; the app only shows the last 4 characters of the account.",
          "The record that you accepted these documents (version and date) and the history of packs added to or removed from your balance.",
          "Technical data generated by hosting services (for example, IP address and error logs) to keep Studio working and secure.",
        ],
      },
      {
        titulo: "3. What you create",
        parrafos: [
          "Your copy, images, videos, projects and settings are stored in your browser (on your device), not on our servers, except as described above.",
          "To generate content, what you type or upload (for example, a description, a reference photo or an audio file for subtitles) is sent to the relevant AI service: Cloudflare Workers AI, or Replicate or Anthropic if you use your own keys. Those services process it under their own policies.",
          "If you use AI video shots, the photo you mark and the motion you describe are sent to fal.ai to generate the clip. That photo and the resulting clip are stored in our private storage (Cloudflare R2), linked to your business, to build your video and avoid charging you twice for the same shot. Those from the free trial are deleted after 30 days; the rest are kept until you ask us to delete them.",
          "Do not include other people’s sensitive personal data in your AI requests.",
        ],
      },
      {
        titulo: "4. How we use your data",
        parrafos: [
          "To provide the service: sign-in, applying your plan and limits, billing, support, notifying you of important changes and protecting Studio from abuse.",
          "We do not sell your data or use it for third-party advertising.",
        ],
      },
      {
        titulo: "5. Who we share it with",
        parrafos: [
          "Only with the providers that run Studio: Google Firebase (accounts and database), Stripe (payments), Cloudflare (AI and storage of photos and video clips), fal.ai (AI video generation), Netlify (hosting) and, if you choose, Replicate or Anthropic. In addition, when you open the app your browser downloads fonts from Google Fonts and, if you use “remove background”, a model from jsDelivr; those services receive technical data such as your IP address. We also share data when required by law.",
        ],
      },
      {
        titulo: "6. How long we keep it",
        parrafos: [
          "While you have an account. If you ask us to delete it, we remove your account and business data within a reasonable time, except what we must keep by law (for example, payment records).",
        ],
      },
      {
        titulo: "7. Your rights",
        parrafos: [
          `You can ask us to access, correct or delete your data. The business owner can disconnect the Cloudflare account at any time from My account. Write to ${CONTACTO_LEGAL}; we will reply within a reasonable time.`,
          "When you sign out you can ask Studio to delete your saved keys, your gallery and “My brand” from that browser. Do this if you use a shared device.",
        ],
      },
      {
        titulo: "8. Security",
        parrafos: [
          "We use encrypted connections (HTTPS), the database is only reachable from our server, and Cloudflare keys are stored encrypted. No system is 100% secure; if an incident affects your data, we will notify you as required by law.",
        ],
      },
      {
        titulo: "9. Minors",
        parrafos: ["Studio is only for people 18 or older. We do not knowingly collect data from minors."],
      },
      {
        titulo: "10. Changes",
        parrafos: ["We may update this policy. If the change is important, we will notify you in the app or by email."],
      },
    ],
  },
};
