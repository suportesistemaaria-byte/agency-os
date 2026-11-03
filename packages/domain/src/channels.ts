import { childLogger } from '@aos/logger';

const log = childLogger({ module: 'channels' });

export interface DeliveryResult {
  status: 'sent' | 'skipped' | 'failed';
  provider: string;
  providerId?: string;
  error?: string;
}

/** E-mail transacional (produção: Resend). Em dev o envio vai para o log — adaptador "mockado". */
export interface EmailAdapter {
  send(to: string, subject: string, text: string): Promise<DeliveryResult>;
}
export const logEmail: EmailAdapter = {
  async send(to, subject) {
    log.info({ to, subject, adapter: 'email-log' }, 'E-mail (dev)');
    return { status: 'sent', provider: 'email-log' };
  },
};

/**
 * WhatsApp (V3, seção 11): provedor oficial por adaptador, DESLIGADO por feature flag até a fase F1.5.
 * Só envia template aprovado para quem deu opt-in; aqui nunca envia.
 */
export interface WhatsAppProvider {
  sendTemplate(
    to: string,
    templateName: string,
    language: string,
    variables: Record<string, string>,
  ): Promise<DeliveryResult>;
}
export const disabledWhatsApp: WhatsAppProvider = {
  async sendTemplate() {
    return {
      status: 'skipped',
      provider: 'whatsapp-disabled',
      error: 'WhatsApp desligado (feature flag WHATSAPP_ENABLED)',
    };
  },
};

let email: EmailAdapter = logEmail;
let whatsapp: WhatsAppProvider = disabledWhatsApp;
export const channels = () => ({ email, whatsapp, whatsappEnabled: process.env.WHATSAPP_ENABLED === '1' });
export function setChannels(c: { email?: EmailAdapter; whatsapp?: WhatsAppProvider }) {
  if (c.email) email = c.email;
  if (c.whatsapp) whatsapp = c.whatsapp;
}
