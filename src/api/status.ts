import { apiRequest } from './client';

export interface MultivoiceStatusResponse {
  spacy_ok: boolean;
  spacy_model: string | null;
  ollama_ok: boolean;
  ollama_url: string | null;
  message: string;
}

export const fetchMultivoiceStatus = () =>
  apiRequest<MultivoiceStatusResponse>('/status/multivoice');
