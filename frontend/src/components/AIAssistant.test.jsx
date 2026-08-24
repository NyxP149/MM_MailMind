import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AIAssistant } from './AIAssistant.jsx';

const emails = [{
  id: 'message-1',
  subject: 'Votre facture est disponible',
  snippet: 'Le montant est dû avant vendredi.',
  from: { name: 'Service facturation', email: 'billing@example.com' },
  classification: { label: 'Facture' },
}];

describe('Assistant IA', () => {
  it('explique comment activer une configuration absente', () => {
    render(<AIAssistant emails={emails} configured={false} model="gpt-test" />);
    expect(screen.getByText('Assistant IA non configuré')).toBeInTheDocument();
    expect(screen.getByText('OPENAI_API_KEY')).toBeInTheDocument();
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
});
