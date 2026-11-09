// Dados carregados do banco que outras partes da página reutilizam
// (o agendamento usa o WhatsApp e os horários). Começa com os valores
// padrão do HTML e é atualizado pelo content-loader.js.
import { DEFAULT_WHATSAPP } from './utils.js';
import { DEFAULT_HOURS } from './hours.js';

export const siteData = {
  whatsapp: DEFAULT_WHATSAPP,
  hours: DEFAULT_HOURS,
};
