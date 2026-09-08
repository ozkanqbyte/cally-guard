/**
 * Locale pack — Spanish-language phone fraud + abuse (ES / MX / AR / CO / CL / PE …).
 * Same signal ids as tr.mjs. category: 'threat' | 'harassment' on the abuse rows.
 */
export const code = 'es';

export const signals = [
  {
    id: 'otp_request', label: 'Pidió un código de un solo uso / verificación',
    severity: 'high', weight: 32, guardAgainstAdvice: true,
    anyOf: [
      ['codigo que le enviamos'], ['codigo que te enviamos'], ['codigo de verificacion'],
      ['codigo de seguridad'], ['clave de un solo uso'], ['codigo que le llega'],
      ['leame el codigo'], ['dime el codigo'], ['digame el codigo'], ['pasame el codigo'],
      ['el codigo del sms'], ['codigo de seis digitos'], ['confirme el codigo'],
      ['clave temporal'], ['el otp'], ['numero que le llego'],
    ],
  },
  {
    id: 'bank_impersonation', label: 'Se hace pasar por el banco / departamento de fraude',
    severity: 'high', weight: 24,
    anyOf: [
      ['departamento de fraude'], ['area de seguridad del banco'], ['unidad de seguridad'],
      ['movimiento sospechoso en su cuenta'], ['operacion sospechosa en su cuenta'],
      ['cargo no autorizado'], ['su cuenta esta en riesgo'], ['su cuenta fue bloqueada'],
      ['intento de retiro'], ['detectamos un acceso'],
    ],
  },
  {
    id: 'authority_impersonation', label: 'Se hace pasar por fiscalia / policia / hacienda',
    severity: 'high', weight: 26,
    anyOf: [
      ['fiscalia'], ['ministerio publico'], ['policia judicial'], ['guardia civil'],
      ['orden de detencion'], ['investigacion en su contra'], ['lavado de dinero'],
      ['cuenta a su nombre'], ['unidad de delitos'],
    ],
  },
  {
    id: 'money_transfer', label: 'Pide transferencia / "cuenta segura"',
    severity: 'high', weight: 26,
    anyOf: [
      ['cuenta segura'], ['cuenta del gobierno'], ['cuenta de custodia'],
      ['transfiera el dinero'], ['haga la transferencia'], ['envie el dinero'],
      ['deposite en esta cuenta'], ['gire el dinero'], ['mande el dinero'],
    ],
  },
  {
    id: 'remote_access', label: 'Hace instalar una app de acceso remoto',
    severity: 'high', weight: 28,
    anyOf: [
      ['anydesk'], ['teamviewer'], ['conexion remota'], ['comparta su pantalla'],
      ['instale esta aplicacion'], ['app de soporte'],
    ],
  },
  {
    id: 'card_details', label: 'Pide numero de tarjeta / CVV',
    severity: 'high', weight: 22, guardAgainstAdvice: true,
    anyOf: [
      ['numero de la tarjeta'], ['los 16 digitos'], ['codigo de seguridad de la tarjeta'],
      ['el cvv'], ['reverso de la tarjeta'], ['fecha de vencimiento de la tarjeta'],
      ['datos de la tarjeta'],
    ],
  },
  {
    id: 'urgency_threat', label: 'Presion de tiempo / amenaza',
    severity: 'medium', weight: 16,
    anyOf: [
      ['ahora mismo'], ['es urgente'], ['ultima oportunidad'], ['de lo contrario'],
      ['su cuenta sera bloqueada'], ['sera detenido'], ['en los proximos minutos'],
      ['la operacion se cancelara'], ['no cuelgue'],
    ],
  },
  {
    id: 'secrecy', label: 'Presion de "no se lo diga a nadie"',
    severity: 'medium', weight: 16,
    anyOf: [
      ['no se lo diga a nadie'], ['no le cuente a nadie'], ['mantengalo en secreto'],
      ['no llame al banco'], ['no cuelgue el telefono'], ['quedese en la linea'],
    ],
  },
  {
    id: 'relative_emergency', label: 'Escenario "un familiar en apuros"',
    severity: 'medium', weight: 20,
    anyOf: [
      ['soy tu hijo'], ['soy tu hija'], ['mama soy yo'], ['tuve un accidente'],
      ['estoy en el hospital'], ['me detuvieron'], ['se me rompio el telefono'],
      ['te llamo de otro numero'],
    ],
  },
  {
    id: 'crypto_investment', label: 'Promesa de inversion / cripto garantizada',
    severity: 'medium', weight: 18,
    anyOf: [
      ['rentabilidad garantizada'], ['ganancia garantizada'], ['oportunidad de cripto'],
      ['oportunidad de inversion'], ['plataforma de trading'], ['duplique su dinero'],
    ],
  },
  {
    id: 'cargo_ransom', label: 'Falsa aduana / tasa de paqueteria',
    severity: 'medium', weight: 16,
    anyOf: [
      ['su paquete esta retenido en aduana'], ['tasa de aduana'], ['pago de aduana'],
      ['costo de entrega'], ['tarifa de importacion'], ['su paquete sera devuelto'],
    ],
  },
  {
    id: 'prize_bait', label: 'Premio / sorteo falso',
    severity: 'low', weight: 10,
    anyOf: [
      ['felicidades ha ganado'], ['ha sido seleccionado'], ['para reclamar su premio'],
      ['gano un sorteo'],
    ],
  },
  {
    id: 'tech_support_scam', label: 'Falso soporte tecnico / aviso de virus',
    severity: 'high', weight: 24,
    anyOf: [
      ['su equipo tiene un virus'], ['su computadora fue hackeada'], ['soporte de microsoft'],
      ['seguridad de windows'], ['detectamos un virus'], ['acceso remoto para revisar'],
    ],
  },

  {
    id: 'threat_intimidation', label: 'Amenazas / intimidacion',
    severity: 'high', weight: 34, category: 'threat',
    anyOf: [
      ['se donde vives'], ['tengo tu direccion'], ['se tu direccion'], ['te vas a arrepentir'],
      ['te voy a hacer dano'], ['te voy a matar'], ['voy a mandar a alguien'],
      ['dana a tu familia'], ['esta es tu ultima advertencia'], ['te voy a buscar'],
      ['voy a ir a tu casa'],
    ],
  },
  {
    id: 'sextortion_blackmail', label: 'Chantaje / amenaza de difundir contenido privado',
    severity: 'high', weight: 38, category: 'threat',
    anyOf: [
      ['voy a publicar tus fotos'], ['tengo tus videos'], ['tengo tus fotos'],
      ['voy a enviar el video'], ['te voy a exponer'], ['se lo mando a tu familia'],
      ['se lo mando a tu jefe'], ['hackee tu camara'], ['paga o lo publico'],
      ['bitcoin', 'o lo filtro'],
    ],
  },
  {
    id: 'harassment_abuse', label: 'Acoso / insultos / llamadas repetidas',
    severity: 'high', weight: 28, category: 'harassment',
    anyOf: [
      ['no te voy a dejar en paz'], ['te voy a seguir llamando'], ['llamo las veces que quiera'],
      ['bloqueame y te vuelvo a llamar'], ['te llamo todos los dias'], ['te estoy siguiendo'],
      ['te estoy vigilando'], ['llame para insultarte'],
    ],
  },
  {
    id: 'debt_collection_abuse', label: 'Cobro de deuda abusivo / ilegal',
    severity: 'medium', weight: 22, category: 'harassment',
    anyOf: [
      ['voy a llamar a tu trabajo'], ['voy a llamar a tu jefe'], ['voy a llamar a tus vecinos'],
      ['voy a llamar a tu familia'], ['voy a llamar a todos tus contactos'],
      ['me voy a presentar en tu casa'], ['llamo a la hora que quiera'],
    ],
  },
];

export const benignMarkers = [
  'recordatorio de su cita', 'confirmar su cita', 'reserva', 'no necesita hacer nada',
  'solo es informativo', 'llamada informativa', 'encuesta', 'su pedido esta listo',
  'soy el repartidor', 'estoy en la puerta',
];
export const adviceMarkers = [
  'no lo comparta', 'no lo comparta con nadie', 'nunca comparta', 'no lo diga',
  'ni siquiera al banco', 'nunca se lo pediremos',
];
export const explicitRequest = [
  'digamelo', 'dimelo', 'pasemelo', 'leamelo', 'compartalo conmigo',
  'lea el codigo', 'diga el codigo', 'diga el numero',
];
export const hotWords = [
  'codigo de verificacion', 'clave de un solo uso', 'cuenta segura', 'transferencia',
  'fiscalia', 'lavado de dinero', 'anydesk', 'teamviewer', 'cvv', 'aduana', 'cripto',
  'rentabilidad garantizada', 'no cuelgue',
];
