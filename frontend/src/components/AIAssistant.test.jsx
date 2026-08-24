import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIAssistant } from './AIAssistant.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    startAIAnalysis: vi.fn(),
    getAIAnalysisJob: vi.fn(),
  },
}));

const emails = [{
  id: 'message-1',
  subject: 'Votre facture est disponible',
  snippet: 'Le montant est dû avant vendredi.',
  from: { name: 'Service facturation', email: 'billing@example.com' },
  classification: { label: 'Facture' },
}];

describe('Assistant IA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('explique comment activer une configuration absente', () => {
    render(<AIAssistant emails={emails} configured={false} model="gpt-test" />);
    expect(screen.getByText('Assistant IA non configuré')).toBeInTheDocument();
    expect(screen.getByText('AI_PROVIDER')).toBeInTheDocument();
  });

  it('affiche uniquement les données minimisées et exige le consentement', () => {
    render(<AIAssistant emails={emails} configured model="gpt-test" />);

    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.queryByText('billing@example.com')).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Analyser avec l’IA' });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeEnabled();
  });

  it('récupère une analyse en arrière-plan au retour sur la vue', async () => {
    const jobId = '12345678-1234-1234-1234-123456789abc';
    sessionStorage.setItem('mailmind:ai-active-job:v1', JSON.stringify({ jobId, messageId: 'message-1' }));
    api.getAIAnalysisJob.mockResolvedValue({
      status: 'completed',
      result: {
        model: 'qwen3:4b',
        analysis: {
          summary: 'Analyse récupérée après navigation.',
          intention: 'Facturation',
          category: 'facture',
          confidence: 0.9,
          riskLevel: 'faible',
          reasons: ['Document attendu'],
          recommendation: 'conserver',
        },
      },
    });

    render(<AIAssistant emails={emails} configured model="qwen3:4b" provider="ollama" />);

    expect(await screen.findByText('Analyse récupérée après navigation.')).toBeInTheDocument();
    expect(api.getAIAnalysisJob).toHaveBeenCalledWith(jobId);
  });
});
