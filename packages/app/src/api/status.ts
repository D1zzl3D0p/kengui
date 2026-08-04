import { apiRequest } from './client';
import type { Schemas } from './schemas';

export type MultivoiceStatusResponse = Schemas['MultivoiceStatusResponse'];

export const fetchMultivoiceStatus = () =>
  apiRequest<MultivoiceStatusResponse>('/status/multivoice');
