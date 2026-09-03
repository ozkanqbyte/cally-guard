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
