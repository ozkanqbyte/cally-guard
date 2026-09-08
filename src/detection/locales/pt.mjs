/**
 * Locale pack — Portuguese-language phone fraud + abuse (BR / PT).
 * Same signal ids as tr.mjs. category: 'threat' | 'harassment' on the abuse rows.
 */
export const code = 'pt';

export const signals = [
  {
    id: 'otp_request', label: 'Pediu um codigo de uso unico / verificacao',
    severity: 'high', weight: 32, guardAgainstAdvice: true,
    anyOf: [
      ['o codigo que enviamos'], ['codigo de verificacao'], ['codigo de seguranca'],
      ['senha de uso unico'], ['me passe o codigo'], ['me diga o codigo'], ['leia o codigo'],
      ['o codigo do sms'], ['codigo de seis digitos'], ['confirme o codigo'], ['o otp'],
      ['o numero que voce recebeu'],
    ],
  },
  {
    id: 'bank_impersonation', label: 'Se passa pelo banco / setor de fraude',
    severity: 'high', weight: 24,
    anyOf: [
      ['setor de fraude'], ['setor de seguranca do banco'],
      ['transacao suspeita na sua conta'], ['movimentacao suspeita na sua conta'],
      ['cobranca nao autorizada'], ['sua conta esta em risco'], ['sua conta foi bloqueada'],
      ['alguem tentando sacar'],
    ],
  },
  {
    id: 'authority_impersonation', label: 'Se passa por promotor / policia / receita',
    severity: 'high', weight: 26,
    anyOf: [
      ['ministerio publico'], ['policia federal'], ['policia civil'], ['delegacia'],
      ['mandado de prisao contra voce'], ['investigacao contra voce'], ['lavagem de dinheiro'],
      ['conta no seu nome'],
    ],
  },
  {
    id: 'money_transfer', label: 'Pede transferencia / "conta segura"',
    severity: 'high', weight: 26,
    anyOf: [
      ['conta segura'], ['conta do governo'], ['conta judicial'],
      ['transfira o dinheiro'], ['faca a transferencia'], ['envie o dinheiro'],
      ['deposite nesta conta'], ['faca um pix'],
    ],
  },
  {
    id: 'remote_access', label: 'Faz instalar um app de acesso remoto',
    severity: 'high', weight: 28,
    anyOf: [
      ['anydesk'], ['teamviewer'], ['acesso remoto'], ['compartilhe sua tela'],
      ['instale este aplicativo'], ['aplicativo de suporte'],
    ],
  },
  {
    id: 'card_details', label: 'Pede numero do cartao / CVV',
    severity: 'high', weight: 22, guardAgainstAdvice: true,
    anyOf: [
      ['numero do cartao'], ['os 16 digitos'], ['codigo de seguranca do cartao'],
      ['o cvv'], ['atras do cartao'], ['data de validade do cartao'], ['dados do cartao'],
    ],
  },
  {
    id: 'urgency_threat', label: 'Pressao de tempo / ameaca',
    severity: 'medium', weight: 16,
    anyOf: [
      ['agora mesmo'], ['e urgente'], ['ultima chance'], ['caso contrario'],
      ['sua conta sera bloqueada'], ['voce sera preso'], ['nos proximos minutos'],
      ['a operacao sera cancelada'], ['nao desligue'],
    ],
  },
  {
    id: 'secrecy', label: 'Pressao de "nao conte a ninguem"',
    severity: 'medium', weight: 16,
    anyOf: [
      ['nao conte a ninguem'], ['nao fale com ninguem'], ['mantenha em segredo'],
      ['nao ligue para o banco'], ['nao desligue o telefone'], ['fique na linha'],
    ],
  },
  {
    id: 'relative_emergency', label: 'Cenario "um parente em apuros"',
    severity: 'medium', weight: 20,
    anyOf: [
      ['mae sou eu'], ['pai sou eu'], ['sofri um acidente'], ['estou no hospital'],
      ['fui preso'], ['meu telefone quebrou'], ['estou ligando de outro numero'],
    ],
  },
  {
    id: 'crypto_investment', label: 'Promessa de investimento / cripto garantido',
    severity: 'medium', weight: 18,
    anyOf: [
      ['retorno garantido'], ['lucro garantido'], ['oportunidade de cripto'],
      ['oportunidade de investimento'], ['plataforma de trading'], ['dobre seu dinheiro'],
    ],
  },
  {
    id: 'cargo_ransom', label: 'Falsa taxa de alfandega / encomenda',
    severity: 'medium', weight: 16,
    anyOf: [
      ['sua encomenda esta retida na alfandega'], ['taxa de alfandega'], ['pagamento da alfandega'],
      ['taxa de entrega'], ['imposto de importacao'], ['sua encomenda sera devolvida'],
    ],
  },
  {
    id: 'prize_bait', label: 'Premio / sorteio falso',
    severity: 'low', weight: 10,
    anyOf: [
      ['parabens voce ganhou'], ['voce foi selecionado'], ['para receber seu premio'],
    ],
  },
  {
    id: 'tech_support_scam', label: 'Falso suporte tecnico / alerta de virus',
    severity: 'high', weight: 24,
    anyOf: [
      ['seu computador esta com virus'], ['seu computador foi hackeado'], ['suporte da microsoft'],
      ['seguranca do windows'], ['detectamos um virus'],
    ],
  },

  {
    id: 'threat_intimidation', label: 'Ameacas / intimidacao',
    severity: 'high', weight: 34, category: 'threat',
    anyOf: [
      ['eu sei onde voce mora'], ['tenho seu endereco'], ['voce vai se arrepender'],
      ['vou te machucar'], ['vou te matar'], ['vou mandar alguem'],
      ['vou fazer mal a sua familia'], ['este e seu ultimo aviso'], ['vou ate a sua casa'],
    ],
  },
  {
    id: 'sextortion_blackmail', label: 'Chantagem / ameaca de vazar conteudo privado',
    severity: 'high', weight: 38, category: 'threat',
    anyOf: [
      ['vou publicar suas fotos'], ['tenho seus videos'], ['tenho suas fotos'],
      ['vou enviar o video'], ['vou te expor'], ['vou mandar pra sua familia'],
      ['vou mandar pro seu chefe'], ['hackeei sua camera'], ['pague ou eu posto'],
    ],
  },
  {
    id: 'harassment_abuse', label: 'Assedio / insultos / ligacoes repetidas',
    severity: 'high', weight: 28, category: 'harassment',
    anyOf: [
      ['nao vou te deixar em paz'], ['vou continuar te ligando'], ['ligo quantas vezes eu quiser'],
      ['me bloqueia que eu ligo de novo'], ['vou te ligar todo dia'], ['estou te seguindo'],
      ['estou te vigiando'],
    ],
  },
  {
    id: 'debt_collection_abuse', label: 'Cobranca de divida abusiva / ilegal',
    severity: 'medium', weight: 22, category: 'harassment',
    anyOf: [
      ['vou ligar pro seu trabalho'], ['vou ligar pro seu chefe'], ['vou ligar pros seus vizinhos'],
      ['vou ligar pra sua familia'], ['vou ligar pra todos os seus contatos'],
      ['vou ate a sua casa'], ['ligo na hora que eu quiser'],
    ],
  },
];

export const benignMarkers = [
  'lembrete da sua consulta', 'confirmar sua consulta', 'reserva', 'nao precisa fazer nada',
  'apenas informativo', 'ligacao informativa', 'pesquisa', 'seu pedido esta pronto',
  'sou o entregador', 'estou na porta',
];
export const adviceMarkers = [
  'nao compartilhe com ninguem', 'nunca compartilhe', 'nao informe',
  'nem mesmo o banco', 'nunca pedimos isso',
];
export const explicitRequest = [
  'me diga', 'me informe', 'me passe', 'leia pra mim',
  'leia o codigo', 'diga o codigo', 'diga o numero',
];
export const hotWords = [
  'codigo de verificacao', 'senha de uso unico', 'conta segura', 'transferencia', 'pix',
  'ministerio publico', 'lavagem de dinheiro', 'anydesk', 'teamviewer', 'cvv', 'alfandega',
  'cripto', 'retorno garantido', 'nao desligue',
];
