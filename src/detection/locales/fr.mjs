/**
 * Locale pack — French-language phone fraud + abuse (FR / BE / CH / CA-fr / MA / …).
 * Same signal ids as tr.mjs. category: 'threat' | 'harassment' on the abuse rows.
 */
export const code = 'fr';

export const signals = [
  {
    id: 'otp_request', label: 'A demande un code a usage unique / de verification',
    severity: 'high', weight: 32, guardAgainstAdvice: true,
    anyOf: [
      ['le code que nous vous avons envoye'], ['code de verification'], ['code de securite'],
      ['mot de passe a usage unique'], ['lisez moi le code'], ['donnez moi le code'],
      ['dites moi le code'], ['le code du sms'], ['code a six chiffres'],
      ['confirmez le code'], ['le otp'], ['le numero que vous avez recu'],
    ],
  },
  {
    id: 'bank_impersonation', label: 'Se fait passer pour la banque / service fraude',
    severity: 'high', weight: 24,
    anyOf: [
      ['service des fraudes'], ['service securite de la banque'],
      ['operation suspecte sur votre compte'], ['activite suspecte sur votre compte'],
      ['prelevement non autorise'], ['votre compte est en danger'], ['votre compte a ete bloque'],
      ['quelqu un tente de retirer'],
    ],
  },
  {
    id: 'authority_impersonation', label: 'Se fait passer pour le procureur / la police / l administration',
    severity: 'high', weight: 26,
    anyOf: [
      ['le procureur'], ['police judiciaire'], ['gendarmerie'], ['brigade financiere'],
      ['mandat d arret contre vous'], ['enquete vous concernant'], ['blanchiment d argent'],
      ['un compte a votre nom'],
    ],
  },
  {
    id: 'money_transfer', label: 'Demande un virement / "compte securise"',
    severity: 'high', weight: 26,
    anyOf: [
      ['compte securise'], ['compte de l etat'], ['compte sequestre'],
      ['transferez l argent'], ['effectuez le virement'], ['envoyez l argent'],
      ['deposez sur ce compte'],
    ],
  },
  {
    id: 'remote_access', label: 'Fait installer une appli d acces a distance',
    severity: 'high', weight: 28,
    anyOf: [
      ['anydesk'], ['teamviewer'], ['connexion a distance'], ['partagez votre ecran'],
      ['installez cette application'], ['appli de support'],
    ],
  },
  {
    id: 'card_details', label: 'Demande le numero de carte / CVV',
    severity: 'high', weight: 22, guardAgainstAdvice: true,
    anyOf: [
      ['numero de la carte'], ['les 16 chiffres'], ['code de securite de la carte'],
      ['le cvv'], ['au dos de la carte'], ['date d expiration de la carte'], ['donnees de la carte'],
    ],
  },
  {
    id: 'urgency_threat', label: 'Pression temporelle / menace',
    severity: 'medium', weight: 16,
    anyOf: [
      ['tout de suite'], ['c est urgent'], ['derniere chance'], ['faute de quoi'],
      ['votre compte sera bloque'], ['vous serez arrete'], ['dans les prochaines minutes'],
      ['l operation sera annulee'], ['ne raccrochez pas'],
    ],
  },
  {
    id: 'secrecy', label: 'Pression "n en parlez a personne"',
    severity: 'medium', weight: 16,
    anyOf: [
      ['n en parlez a personne'], ['ne le dites a personne'], ['gardez le secret'],
      ['n appelez pas la banque'], ['ne raccrochez pas'], ['restez en ligne'],
    ],
  },
  {
    id: 'relative_emergency', label: 'Scenario "un proche en difficulte"',
    severity: 'medium', weight: 20,
    anyOf: [
      ['maman c est moi'], ['papa c est moi'], ['j ai eu un accident'], ['je suis a l hopital'],
      ['j ai ete arrete'], ['mon telephone est casse'], ['je t appelle d un autre numero'],
    ],
  },
  {
    id: 'crypto_investment', label: 'Promesse d investissement / crypto garantie',
    severity: 'medium', weight: 18,
    anyOf: [
      ['rendement garanti'], ['gain garanti'], ['opportunite crypto'],
      ['opportunite d investissement'], ['plateforme de trading'], ['doublez votre argent'],
    ],
  },
  {
    id: 'cargo_ransom', label: 'Faux frais de douane / colis',
    severity: 'medium', weight: 16,
    anyOf: [
      ['votre colis est bloque a la douane'], ['frais de douane'], ['paiement des douanes'],
      ['frais de livraison'], ['taxe d importation'], ['votre colis sera renvoye'],
    ],
  },
  {
    id: 'prize_bait', label: 'Faux prix / tirage au sort',
    severity: 'low', weight: 10,
    anyOf: [
      ['felicitations vous avez gagne'], ['vous avez ete selectionne'],
      ['pour recevoir votre prix'],
    ],
  },
  {
    id: 'tech_support_scam', label: 'Faux support technique / alerte virus',
    severity: 'high', weight: 24,
    anyOf: [
      ['votre ordinateur a un virus'], ['votre ordinateur a ete pirate'], ['support microsoft'],
      ['securite windows'], ['nous avons detecte un virus'],
    ],
  },

  {
    id: 'threat_intimidation', label: 'Menaces / intimidation',
    severity: 'high', weight: 34, category: 'threat',
    anyOf: [
      ['je sais ou tu habites'], ['j ai ton adresse'], ['tu vas le regretter'],
      ['je vais te faire du mal'], ['je vais te tuer'], ['j envoie quelqu un'],
      ['je m en prends a ta famille'], ['c est ton dernier avertissement'],
      ['je viens chez toi'],
    ],
  },
  {
    id: 'sextortion_blackmail', label: 'Chantage / menace de diffuser du contenu prive',
    severity: 'high', weight: 38, category: 'threat',
    anyOf: [
      ['je vais publier tes photos'], ['j ai tes videos'], ['j ai tes photos'],
      ['je vais envoyer la video'], ['je vais te denoncer'], ['je l envoie a ta famille'],
      ['je l envoie a ton patron'], ['j ai pirate ta camera'], ['paie ou je publie'],
    ],
  },
  {
    id: 'harassment_abuse', label: 'Harcelement / insultes / appels repetes',
    severity: 'high', weight: 28, category: 'harassment',
    anyOf: [
      ['je ne te laisserai pas tranquille'], ['je vais continuer a t appeler'],
      ['j appelle autant que je veux'], ['bloque moi et je rappelle'], ['je t appelle tous les jours'],
      ['je te suis'], ['je te surveille'],
    ],
  },
  {
    id: 'debt_collection_abuse', label: 'Recouvrement de dette abusif / illegal',
    severity: 'medium', weight: 22, category: 'harassment',
    anyOf: [
      ['je vais appeler ton employeur'], ['je vais appeler ton patron'],
      ['je vais appeler tes voisins'], ['je vais appeler ta famille'],
      ['je vais appeler tous tes contacts'], ['je viens chez toi'], ['j appelle quand je veux'],
    ],
  },
];

export const benignMarkers = [
  'rappel de votre rendez vous', 'confirmer votre rendez vous', 'reservation',
  'vous n avez rien a faire', 'a titre informatif', 'appel d information', 'sondage',
  'votre commande est prete', 'je suis le livreur', 'je suis devant la porte',
];
export const adviceMarkers = [
  'ne le communiquez a personne', 'ne le partagez jamais', 'ne le donnez pas',
  'meme pas a la banque', 'nous ne le demandons jamais',
];
export const explicitRequest = [
  'dites le moi', 'communiquez le moi', 'lisez le moi',
  'lisez le code', 'dites le code', 'dites le numero',
];
export const hotWords = [
  'code de verification', 'mot de passe a usage unique', 'compte securise', 'virement',
  'procureur', 'blanchiment', 'anydesk', 'teamviewer', 'cvv', 'douane', 'crypto',
  'rendement garanti', 'ne raccrochez pas',
];
