/**
 * Locale pack — Italian-language phone fraud + abuse (IT / CH-it / SM).
 * Same signal ids as tr.mjs. category: 'threat' | 'harassment' on the abuse rows.
 */
export const code = 'it';

export const signals = [
  {
    id: 'otp_request', label: 'Ha chiesto un codice usa e getta / di verifica',
    severity: 'high', weight: 32, guardAgainstAdvice: true,
    anyOf: [
      ['il codice che le abbiamo inviato'], ['codice di verifica'], ['codice di sicurezza'],
      ['password usa e getta'], ['mi legga il codice'], ['mi dica il codice'],
      ['il codice del messaggio'], ['codice a sei cifre'], ['confermi il codice'], ['il otp'],
      ['il numero che ha ricevuto'],
    ],
  },
  {
    id: 'bank_impersonation', label: 'Si spaccia per la banca / ufficio frodi',
    severity: 'high', weight: 24,
    anyOf: [
      ['ufficio frodi'], ['ufficio sicurezza della banca'],
      ['operazione sospetta sul suo conto'], ['attivita sospetta sul suo conto'],
      ['addebito non autorizzato'], ['il suo conto e a rischio'], ['il suo conto e stato bloccato'],
      ['qualcuno sta cercando di prelevare'],
    ],
  },
  {
    id: 'authority_impersonation', label: 'Si spaccia per procura / polizia / guardia di finanza',
    severity: 'high', weight: 26,
    anyOf: [
      ['la procura'], ['polizia postale'], ['carabinieri'], ['guardia di finanza'],
      ['mandato di arresto a suo carico'], ['indagine a suo carico'], ['riciclaggio di denaro'],
      ['un conto a suo nome'],
    ],
  },
  {
    id: 'money_transfer', label: 'Chiede un bonifico / "conto sicuro"',
    severity: 'high', weight: 26,
    anyOf: [
      ['conto sicuro'], ['conto dello stato'], ['conto di garanzia'],
      ['trasferisca il denaro'], ['effettui il bonifico'], ['invii il denaro'],
      ['versi su questo conto'],
    ],
  },
  {
    id: 'remote_access', label: 'Fa installare una app di accesso remoto',
    severity: 'high', weight: 28,
    anyOf: [
      ['anydesk'], ['teamviewer'], ['accesso remoto'], ['condivida il suo schermo'],
      ['installi questa applicazione'], ['app di assistenza'],
    ],
  },
  {
    id: 'card_details', label: 'Chiede il numero della carta / CVV',
    severity: 'high', weight: 22, guardAgainstAdvice: true,
    anyOf: [
      ['numero della carta'], ['le 16 cifre'], ['codice di sicurezza della carta'],
      ['il cvv'], ['sul retro della carta'], ['data di scadenza della carta'], ['dati della carta'],
    ],
  },
  {
    id: 'urgency_threat', label: 'Pressione temporale / minaccia',
    severity: 'medium', weight: 16,
    anyOf: [
      ['subito'], ['e urgente'], ['ultima possibilita'], ['in caso contrario'],
      ['il suo conto sara bloccato'], ['sara arrestato'], ['nei prossimi minuti'],
      ['l operazione sara annullata'], ['non riattacchi'],
    ],
  },
  {
    id: 'secrecy', label: 'Pressione "non lo dica a nessuno"',
    severity: 'medium', weight: 16,
    anyOf: [
      ['non lo dica a nessuno'], ['non ne parli con nessuno'], ['lo tenga segreto'],
      ['non chiami la banca'], ['non riattacchi il telefono'], ['resti in linea'],
    ],
  },
  {
    id: 'relative_emergency', label: 'Scenario "un parente nei guai"',
    severity: 'medium', weight: 20,
    anyOf: [
      ['mamma sono io'], ['papa sono io'], ['ho avuto un incidente'], ['sono in ospedale'],
      ['sono stato arrestato'], ['mi si e rotto il telefono'], ['ti chiamo da un altro numero'],
    ],
  },
  {
    id: 'crypto_investment', label: 'Promessa di investimento / cripto garantito',
    severity: 'medium', weight: 18,
    anyOf: [
      ['rendimento garantito'], ['guadagno garantito'], ['opportunita cripto'],
      ['opportunita di investimento'], ['piattaforma di trading'], ['raddoppi il suo denaro'],
    ],
  },
  {
    id: 'cargo_ransom', label: 'Falsa tassa doganale / pacco',
    severity: 'medium', weight: 16,
    anyOf: [
      ['il suo pacco e bloccato in dogana'], ['tassa doganale'], ['pagamento doganale'],
      ['spese di consegna'], ['imposta di importazione'], ['il suo pacco sara restituito'],
    ],
  },
  {
    id: 'prize_bait', label: 'Premio / estrazione falsa',
    severity: 'low', weight: 10,
    anyOf: [
      ['congratulazioni ha vinto'], ['e stato selezionato'], ['per ricevere il suo premio'],
    ],
  },
  {
    id: 'tech_support_scam', label: 'Falso supporto tecnico / avviso virus',
    severity: 'high', weight: 24,
    anyOf: [
      ['il suo computer ha un virus'], ['il suo computer e stato violato'], ['supporto microsoft'],
      ['sicurezza windows'], ['abbiamo rilevato un virus'],
    ],
  },

  {
    id: 'threat_intimidation', label: 'Minacce / intimidazione',
    severity: 'high', weight: 34, category: 'threat',
    anyOf: [
      ['so dove abiti'], ['ho il tuo indirizzo'], ['te ne pentirai'],
      ['ti faro del male'], ['ti ammazzo'], ['mando qualcuno'],
      ['faro del male alla tua famiglia'], ['questo e il tuo ultimo avvertimento'],
      ['vengo a casa tua'],
    ],
  },
  {
    id: 'sextortion_blackmail', label: 'Ricatto / minaccia di diffondere contenuti privati',
    severity: 'high', weight: 38, category: 'threat',
    anyOf: [
      ['pubblichero le tue foto'], ['ho i tuoi video'], ['ho le tue foto'],
      ['mandero il video'], ['ti smaschero'], ['lo mando alla tua famiglia'],
      ['lo mando al tuo capo'], ['ho hackerato la tua fotocamera'], ['paga o lo pubblico'],
    ],
  },
  {
    id: 'harassment_abuse', label: 'Molestie / insulti / chiamate ripetute',
    severity: 'high', weight: 28, category: 'harassment',
    anyOf: [
      ['non ti lascero in pace'], ['continuero a chiamarti'], ['chiamo quante volte voglio'],
      ['bloccami e ti richiamo'], ['ti chiamo tutti i giorni'], ['ti sto seguendo'],
      ['ti sto osservando'],
    ],
  },
  {
    id: 'debt_collection_abuse', label: 'Recupero crediti abusivo / illegale',
    severity: 'medium', weight: 22, category: 'harassment',
    anyOf: [
      ['chiamo il tuo datore di lavoro'], ['chiamo il tuo capo'], ['chiamo i tuoi vicini'],
      ['chiamo la tua famiglia'], ['chiamo tutti i tuoi contatti'],
      ['vengo a casa tua'], ['chiamo quando voglio'],
    ],
  },
];

export const benignMarkers = [
  'promemoria del suo appuntamento', 'confermare il suo appuntamento', 'prenotazione',
  'non deve fare nulla', 'solo a titolo informativo', 'chiamata informativa', 'sondaggio',
  'il suo ordine e pronto', 'sono il corriere', 'sono alla porta',
];
export const adviceMarkers = [
  'non lo comunichi a nessuno', 'non lo condivida mai', 'non lo dia',
  'nemmeno alla banca', 'non lo chiediamo mai',
];
export const explicitRequest = [
  'me lo dica', 'me lo comunichi', 'me lo legga',
  'legga il codice', 'dica il codice', 'dica il numero',
];
export const hotWords = [
  'codice di verifica', 'password usa e getta', 'conto sicuro', 'bonifico',
  'la procura', 'riciclaggio', 'anydesk', 'teamviewer', 'cvv', 'dogana', 'cripto',
  'rendimento garantito', 'non riattacchi',
];
