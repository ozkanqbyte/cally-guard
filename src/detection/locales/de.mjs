/**
 * Locale pack — German-language phone fraud + abuse (DE / AT / CH).
 * Same signal ids as tr.mjs. category: 'threat' | 'harassment' on the abuse rows.
 */
export const code = 'de';

export const signals = [
  {
    id: 'otp_request', label: 'Nach einem Einmalcode / Bestätigungscode gefragt',
    severity: 'high', weight: 32, guardAgainstAdvice: true,
    anyOf: [
      ['den code den wir ihnen geschickt'], ['bestatigungscode'], ['verifizierungscode'],
      ['sicherheitscode'], ['einmalpasswort'], ['lesen sie mir den code'],
      ['nennen sie mir den code'], ['sagen sie mir den code'], ['den code aus der sms'],
      ['sechsstelliger code'], ['bestatigen sie den code'], ['die tan'], ['das otp'],
    ],
  },
  {
    id: 'bank_impersonation', label: 'Gibt sich als Bank / Betrugsabteilung aus',
    severity: 'high', weight: 24,
    anyOf: [
      ['betrugsabteilung'], ['sicherheitsabteilung der bank'],
      ['verdachtige transaktion auf ihrem konto'], ['verdachtige aktivitat auf ihrem konto'],
      ['nicht autorisierte abbuchung'], ['ihr konto ist gefahrdet'], ['ihr konto wurde gesperrt'],
      ['jemand versucht abzuheben'],
    ],
  },
  {
    id: 'authority_impersonation', label: 'Gibt sich als Staatsanwaltschaft / Polizei / Behorde aus',
    severity: 'high', weight: 26,
    anyOf: [
      ['staatsanwaltschaft'], ['kriminalpolizei'], ['europol'], ['bundespolizei'],
      ['haftbefehl gegen sie'], ['ermittlungen gegen sie'], ['geldwasche'],
      ['konto auf ihren namen'],
    ],
  },
  {
    id: 'money_transfer', label: 'Fordert Uberweisung / "sicheres Konto"',
    severity: 'high', weight: 26,
    anyOf: [
      ['sicheres konto'], ['treuhandkonto'], ['auf ein amtliches konto'],
      ['uberweisen sie das geld'], ['tatigen sie die uberweisung'], ['schicken sie das geld'],
      ['auf dieses konto einzahlen'],
    ],
  },
  {
    id: 'remote_access', label: 'Lasst Fernwartungs-App installieren',
    severity: 'high', weight: 28,
    anyOf: [
      ['anydesk'], ['teamviewer'], ['fernzugriff'], ['teilen sie ihren bildschirm'],
      ['installieren sie diese app'], ['support app'],
    ],
  },
  {
    id: 'card_details', label: 'Fragt nach Kartennummer / CVV',
    severity: 'high', weight: 22, guardAgainstAdvice: true,
    anyOf: [
      ['kartennummer'], ['die 16 stellen'], ['sicherheitscode der karte'], ['die cvv'],
      ['ruckseite der karte'], ['ablaufdatum der karte'], ['kartendaten'],
    ],
  },
  {
    id: 'urgency_threat', label: 'Zeitdruck / Drohung',
    severity: 'medium', weight: 16,
    anyOf: [
      ['sofort'], ['dringend'], ['letzte chance'], ['andernfalls'],
      ['ihr konto wird gesperrt'], ['sie werden verhaftet'], ['in den nachsten minuten'],
      ['der vorgang wird storniert'], ['legen sie nicht auf'],
    ],
  },
  {
    id: 'secrecy', label: '"Sagen Sie niemandem etwas"-Druck',
    severity: 'medium', weight: 16,
    anyOf: [
      ['sagen sie niemandem etwas'], ['erzahlen sie niemandem'], ['halten sie es geheim'],
      ['rufen sie die bank nicht an'], ['legen sie nicht auf'], ['bleiben sie in der leitung'],
    ],
  },
  {
    id: 'relative_emergency', label: '"Ein Angehoriger in Not"-Szenario',
    severity: 'medium', weight: 20,
    anyOf: [
      ['mama ich bins'], ['papa ich bins'], ['ich hatte einen unfall'], ['ich bin im krankenhaus'],
      ['ich wurde festgenommen'], ['mein handy ist kaputt'], ['ich rufe von einer anderen nummer'],
    ],
  },
  {
    id: 'crypto_investment', label: 'Garantierte Investition / Krypto-Versprechen',
    severity: 'medium', weight: 18,
    anyOf: [
      ['garantierte rendite'], ['garantierter gewinn'], ['krypto gelegenheit'],
      ['investitionsmoglichkeit'], ['trading plattform'], ['verdoppeln sie ihr geld'],
    ],
  },
  {
    id: 'cargo_ransom', label: 'Falscher Zoll / Paketgebuhr',
    severity: 'medium', weight: 16,
    anyOf: [
      ['ihr paket wird beim zoll festgehalten'], ['zollgebuhr'], ['zollzahlung'],
      ['zustellgebuhr'], ['einfuhrsteuer'], ['ihr paket wird zuruckgeschickt'],
    ],
  },
  {
    id: 'prize_bait', label: 'Gefalschter Gewinn / Verlosung',
    severity: 'low', weight: 10,
    anyOf: [
      ['herzlichen gluckwunsch sie haben gewonnen'], ['sie wurden ausgewahlt'],
      ['um ihren preis zu erhalten'],
    ],
  },
  {
    id: 'tech_support_scam', label: 'Falscher technischer Support / Viruswarnung',
    severity: 'high', weight: 24,
    anyOf: [
      ['ihr computer hat einen virus'], ['ihr computer wurde gehackt'], ['microsoft support'],
      ['windows sicherheit'], ['wir haben einen virus entdeckt'],
    ],
  },

  {
    id: 'threat_intimidation', label: 'Drohungen / Einschuchterung',
    severity: 'high', weight: 34, category: 'threat',
    anyOf: [
      ['ich weiss wo du wohnst'], ['ich habe deine adresse'], ['du wirst es bereuen'],
      ['ich werde dir wehtun'], ['ich bringe dich um'], ['ich schicke jemanden'],
      ['ich tue deiner familie etwas an'], ['das ist deine letzte warnung'],
      ['ich komme zu dir nach hause'],
    ],
  },
  {
    id: 'sextortion_blackmail', label: 'Erpressung / Drohung private Inhalte zu verbreiten',
    severity: 'high', weight: 38, category: 'threat',
    anyOf: [
      ['ich veroffentliche deine fotos'], ['ich habe deine videos'], ['ich habe deine fotos'],
      ['ich schicke das video'], ['ich stelle dich blos'], ['ich schicke es deiner familie'],
      ['ich schicke es deinem chef'], ['ich habe deine kamera gehackt'], ['zahl oder ich poste es'],
    ],
  },
  {
    id: 'harassment_abuse', label: 'Belastigung / Beschimpfung / wiederholte Anrufe',
    severity: 'high', weight: 28, category: 'harassment',
    anyOf: [
      ['ich lasse dich nicht in ruhe'], ['ich rufe weiter an'], ['ich rufe so oft ich will'],
      ['blockier mich und ich rufe wieder an'], ['ich rufe jeden tag an'], ['ich verfolge dich'],
      ['ich beobachte dich'],
    ],
  },
  {
    id: 'debt_collection_abuse', label: 'Missbrauchliches / illegales Inkasso',
    severity: 'medium', weight: 22, category: 'harassment',
    anyOf: [
      ['ich rufe deinen arbeitgeber an'], ['ich rufe deinen chef an'], ['ich rufe deine nachbarn an'],
      ['ich rufe deine familie an'], ['ich rufe alle deine kontakte an'],
      ['ich stehe vor deiner tur'], ['ich rufe an wann ich will'],
    ],
  },
];

export const benignMarkers = [
  'terminerinnerung', 'ihren termin bestatigen', 'reservierung', 'sie mussen nichts tun',
  'nur zur information', 'informationsanruf', 'umfrage', 'ihre bestellung ist fertig',
  'ich bin der zusteller', 'ich stehe vor der tur',
];
export const adviceMarkers = [
  'geben sie ihn nicht weiter', 'teilen sie ihn mit niemandem', 'niemals weitergeben',
  'auch nicht der bank', 'wir fragen niemals danach',
];
export const explicitRequest = [
  'sagen sie es mir', 'nennen sie es mir', 'lesen sie ihn mir vor',
  'lesen sie den code', 'nennen sie den code', 'nennen sie die nummer',
];
export const hotWords = [
  'bestatigungscode', 'einmalpasswort', 'tan', 'sicheres konto', 'uberweisung',
  'staatsanwaltschaft', 'geldwasche', 'anydesk', 'teamviewer', 'cvv', 'zoll', 'krypto',
  'garantierte rendite', 'legen sie nicht auf',
];
