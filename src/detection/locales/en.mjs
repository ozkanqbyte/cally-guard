/**
 * Locale pack — English-language phone fraud (US / UK / CA / AU / IN / …).
 *
 * Same signal ids as `tr.mjs` so the policy, metrics and app UI don't change.
 * Covers the common English-language playbooks: bank/fraud-dept, government
 * impersonation (IRS / HMRC / Social Security), gift-card & wire "safe account"
 * transfers, remote-access, one-time codes, the "grandkid in trouble" call,
 * fake customs fees, prize bait.
 */
export const code = 'en';

export const signals = [
  {
    id: 'otp_request',
    label: 'Asked for a one-time passcode / verification code',
    severity: 'high',
    weight: 32,
    guardAgainstAdvice: true,
    anyOf: [
      ['code we just sent'], ['code we sent you'], ['one time code'],
      ['one-time code'], ['one time passcode'], ['verification code'],
      ['security code we sent'], ['read me the code'], ['read the code'],
      ['read back the code'], ['tell me the code'], ['six digit code'],
      ['6 digit code'], ['confirm the code'], ['the otp'],
    ],
  },
  {
    id: 'bank_impersonation',
    label: 'Claimed to be from your bank / fraud department',
    severity: 'high',
    weight: 24,
    anyOf: [
      // "calling from your bank" is left out on purpose — a real rep says that.
      ['fraud department'], ['fraud prevention team'], ['bank security department'],
      ['suspicious transaction on your account'], ['suspicious activity on your account'],
      ['unauthorized transaction on your'], ['your account has been compromised'],
      ['your account is at risk'], ['your account has been locked'],
      ['someone is trying to withdraw'],
    ],
  },
  {
    id: 'authority_impersonation',
    label: 'Claimed to be police / IRS / Social Security / a court',
    severity: 'high',
    weight: 26,
    anyOf: [
      ['social security administration'], ['your social security number'],
      ['ssn has been suspended'], ['this is the irs'], ['from the irs'],
      ['hmrc'], ['tax office'], ['arrest warrant'], ['warrant for your arrest'],
      ['federal agent'], ['law enforcement'], ['legal action against you'],
      ['money laundering'], ['your identity has been used'],
    ],
  },
  {
    id: 'money_transfer',
    label: 'Told to move money / buy gift cards / wire to a "safe account"',
    severity: 'high',
    weight: 26,
    anyOf: [
      ['safe account'], ['secure account'], ['government account'],
      ['move your money'], ['move your funds'], ['transfer the funds'],
      ['wire the money'], ['wire transfer'], ['send a wire'],
      ['buy gift cards'], ['purchase gift cards'], ['google play cards'],
      ['apple gift card'], ['bitcoin atm'], ['send bitcoin'], ['crypto wallet'],
      ['routing number', 'send'], ['zelle'], ['cash app'], ['western union'],
    ],
  },
  {
    id: 'remote_access',
    label: 'Told to install a remote-access app',
    severity: 'high',
    weight: 28,
    anyOf: [
      ['anydesk'], ['teamviewer'], ['remote access'], ['let me connect to your'],
      ['share your screen'], ['download this app'], ['install this application'],
      ['support software'],
    ],
  },
  {
    id: 'card_details',
    label: 'Asked for your card number / CVV',
    severity: 'high',
    weight: 22,
    guardAgainstAdvice: true,
    anyOf: [
      ['your card number'], ['the card number'], ['cvv'],
      ['security code on the back'], ['three digits on the back'],
      ['3 digits on the back'], ['16 digit'], ['sixteen digit'],
      ['expiry date', 'card number'],
    ],
  },
  {
    id: 'urgency_threat',
    label: 'Time pressure / threat',
    severity: 'medium',
    weight: 16,
    anyOf: [
      ['right now'], ['immediately'], ['within the hour'], ['within 24 hours'],
      ['final notice'], ['last warning'], ['act now'], ['before it is too late'],
      ['your account will be closed'], ['you will be arrested'],
      ['you could be arrested'], ['legal consequences'],
    ],
  },
  {
    id: 'secrecy',
    label: 'Pressure to keep it secret / stay on the line',
    severity: 'medium',
    weight: 16,
    anyOf: [
      ['do not tell anyone'], ['dont tell anyone'], ['do not discuss this'],
      ['keep this confidential'], ['stay on the line'], ['do not hang up'],
      ['dont hang up'], ['do not call your bank'], ['do not contact anyone'],
      ['this is between us'],
    ],
  },
  {
    id: 'relative_emergency',
    label: '"Your relative is in trouble" scenario',
    severity: 'medium',
    weight: 20,
    anyOf: [
      ['your son'], ['your daughter'], ['your grandson'], ['your granddaughter'],
      ['grandma it is me'], ['grandpa it is me'], ['it is me', 'accident'],
      ['i have been in an accident'], ['i am in jail'], ['i am in the hospital'],
      ['i lost my phone'], ['need bail money'], ['post bail'],
      ['calling from a different number'],
    ],
  },
  {
    id: 'crypto_investment',
    label: 'Guaranteed-return / crypto investment pitch',
    severity: 'medium',
    weight: 18,
    anyOf: [
      ['guaranteed return'], ['guaranteed returns'], ['guaranteed profit'],
      ['double your money'], ['risk free investment'], ['crypto opportunity'],
      ['investment opportunity', 'guaranteed'], ['high return', 'no risk'],
    ],
  },
  {
    id: 'cargo_ransom',
    label: 'Fake parcel / customs fee',
    severity: 'medium',
    weight: 16,
    anyOf: [
      ['held at customs'], ['customs fee'], ['customs charge'], ['clearance fee'],
      ['delivery fee to release'], ['unpaid shipping'], ['redelivery fee'],
      ['your parcel is being returned'], ['import tax', 'pay'],
    ],
  },
  {
    id: 'prize_bait',
    label: 'Fake prize / lottery',
    severity: 'low',
    weight: 10,
    anyOf: [
      ['you have won'], ['you have been selected'], ['claim your prize'],
      ['won a gift card'], ['won a cash prize'], ['congratulations you are a winner'],
    ],
  },
  {
    id: 'task_job_scam',
    label: 'Task-based easy-money scam',
    severity: 'medium',
    weight: 20,
    anyOf: [
      ['earn by completing tasks'], ['daily tasks'], ['like products to earn'],
      ['leave reviews to earn'], ['task on telegram'], ['task on whatsapp'],
      ['membership fee to start'], ['your team leader'], ['task link'],
      ['guaranteed daily earnings'],
    ],
  },
  {
    id: 'tech_support_scam',
    label: 'Fake tech support / virus warning',
    severity: 'high',
    weight: 24,
    anyOf: [
      ['virus detected on your computer'], ['your computer has been hacked'],
      ['your system has been breached'], ['microsoft support'],
      ['windows security alert'], ['let us remote into your computer'],
      ['our technician will connect'], ['security vulnerability on your device'],
    ],
  },
  {
    id: 'romance_scam',
    label: 'Romance / emotional-manipulation scam',
    severity: 'medium',
    weight: 18,
    anyOf: [
      ['i love you', 'money'], ['i am overseas', 'money'],
      ['just between us', 'send money'], ['i want to marry you'],
      ['my gift is stuck at customs'], ['deployed overseas', 'send money'],
      ['platform fee', 'love'], ['i was coming to see you but'],
    ],
  },
  {
    id: 'fake_loan_credit',
    label: 'Fake loan / credit-limit-increase scam',
    severity: 'medium',
    weight: 20,
    anyOf: [
      ['your loan has been approved'], ['increase your limit', 'fee'],
      ['no upfront fee loan'], ['loan processing fee'], ['loan application fee'],
      ['interest free loan offer'], ['your credit score has been upgraded'],
    ],
  },
  {
    id: 'sim_swap_request',
    label: 'SIM swap / carrier-transfer trap',
    severity: 'high',
    weight: 26,
    anyOf: [
      ['swap your sim card'], ['transfer your number to a new device'],
      ['sim card renewal'], ['carrier', 'sim swap'],
      ['port your number to a new sim'], ['esim activation code'],
    ],
  },
  {
    id: 'fake_court_fine',
    label: 'Fake traffic fine / debt-collection threat',
    severity: 'high',
    weight: 22,
    anyOf: [
      ['unpaid fine'], ['your traffic ticket'], ['collections process will start'],
      ['assets will be seized'], ['because of your debt'], ['you will appear in court'],
      ['enforcement action', 'payment'], ['debt collection agency'],
    ],
  },
  {
    id: 'charity_disaster_scam',
    label: 'Fake charity / disaster-relief scam',
    severity: 'medium',
    weight: 16,
    anyOf: [
      ['earthquake donation'], ['disaster relief fund'], ['donation account'],
      ['support our relief campaign'], ['funds go to the victims'],
    ],
  },
  {
    id: 'impersonation_new_number',
    label: 'New number — hijacked-contact impersonation',
    severity: 'high',
    weight: 22,
    anyOf: [
      ['texting from my new number'], ['my phone number changed'],
      ['lost my old number'], ['reaching you from this number now'],
      ['whatsapp account changed'], ['urgently need money', 'new number'],
    ],
  },
  {
    id: 'subscription_cancel_scam',
    label: 'Fake subscription renewal / cancellation scam',
    severity: 'low',
    weight: 12,
    anyOf: [
      ['your subscription will renew'], ['cancel your membership', 'card'],
      ['automatic payment authorization'], ['charge will apply if you do not cancel'],
    ],
  },
  {
    id: 'fake_job_offer_upfront_fee',
    label: 'Fake job offer / upfront-fee scam',
    severity: 'medium',
    weight: 18,
    anyOf: [
      ['you have been hired', 'fee'], ['pay for paperwork'],
      ['pay for equipment'], ['pay a placement fee'], ['pay for training materials'],
      ['guaranteed job, just pay'],
    ],
  },

  // ── non-fraud abuse ── same ids as tr.mjs; category != 'scam' ────────────
  {
    id: 'threat_intimidation',
    label: 'Threats / intimidation',
    severity: 'high',
    weight: 34,
    category: 'threat',
    anyOf: [
      ['i will find you'], ['i know where you live'], ['i have your address'],
      ['i know your address'], ['you will regret this'], ['you will be sorry'],
      ['i will make you pay'], ['i will hurt you'], ['i will kill you'],
      ['i will destroy you'], ['i will ruin you'], ['watch your back'],
      ['i will come to your house'], ['i am sending someone'],
      ['harm your family'], ['hurt your kids'], ['this is your last warning'],
      ['i am threatening you'],
    ],
  },
  {
    id: 'sextortion_blackmail',
    label: 'Blackmail / threat to leak private material',
    severity: 'high',
    weight: 38,
    category: 'threat',
    anyOf: [
      ['i will leak your'], ['i have your photos'], ['i have your videos'],
      ['i will send the video'], ['i will expose you'], ['i will post it'],
      ['send it to your family'], ['send it to your boss'], ['send it to everyone'],
      ['i hacked your camera'], ['i have access to your phone'],
      ['pay or i post'], ['bitcoin', 'or i leak'], ['crypto', 'or i expose'],
      ['screenshots of everything'],
    ],
  },
  {
    id: 'harassment_abuse',
    label: 'Harassment / abuse / repeated unwanted calls',
    severity: 'high',
    weight: 28,
    category: 'harassment',
    anyOf: [
      ['i will not leave you alone'], ['i will keep calling'],
      ['i will call as much as i want'], ['block me and i will call again'],
      ['i will call every day'], ['i will call day and night'],
      ['i am following you'], ['i am watching you'], ['wherever you go'],
      ['you bitch'], ['you piece of'], ['called to insult you'],
      ['called just to swear at you'],
    ],
  },
  {
    id: 'debt_collection_abuse',
    label: 'Abusive / illegal debt-collection pressure',
    severity: 'medium',
    weight: 22,
    category: 'harassment',
    anyOf: [
      ['i will call your employer'], ['i will call your boss'],
      ['i will call your neighbors'], ['i will call your family'],
      ['i will call everyone in your contacts'], ['tell everyone you owe'],
      ['i will show up at your door'], ['i will seize your'],
      ['i call whenever i want'], ['calling at midnight because'],
      ['whatever it takes to collect'],
    ],
  },
];

export const benignMarkers = [
  'appointment reminder', 'reminder about your appointment', 'reservation',
  'no action is needed', 'no action is required', 'this is a courtesy call',
  'just a courtesy call', 'customer satisfaction survey', 'quick survey',
  'feedback', 'your order is ready', 'your order is on its way',
  'delivery driver', 'i am at your door', 'nobody answered the door',
];

export const adviceMarkers = [
  'never share', 'do not share', 'dont share', 'never give out',
  'we will never ask', 'we will never call you', 'should not be shared',
  'no one should ask you', 'not even our staff', 'including our staff',
  'keep your code private',
];

export const explicitRequest = [
  'tell me the code', 'give me the code', 'read me the code', 'read the code',
  'read it back to me', 'read it to me', 'what is the code', 'whats the code',
  'share it with me', 'read me the number', 'confirm the code for me',
];

export const hotWords = [
  'IRS', 'HMRC', 'Social Security', 'SSN', 'gift card', 'Google Play',
  'Bitcoin', 'crypto wallet', 'wire transfer', 'routing number', 'Zelle',
  'Cash App', 'Western Union', 'one-time code', 'verification code', 'OTP',
  'CVV', 'AnyDesk', 'TeamViewer', 'remote access', 'safe account',
  'arrest warrant', 'customs fee', 'fraud department', 'suspicious transaction',
];
