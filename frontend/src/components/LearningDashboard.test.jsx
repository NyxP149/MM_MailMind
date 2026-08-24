import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningDashboard } from './LearningDashboard.jsx';

const examples = [
  { id: '1', categoryId: 'facture', domain: 'shop.example', keywords: ['facture'], correctedAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', categoryId: 'facture', domain: 'shop.example', keywords: ['recu'], correctedAt: '2026-01-02T00:00:00.000Z' },
];

afterEach(cleanup);

describe('LearningDashboard', () => {
  it('affiche une préférence devenue active', () => {
    render(<LearningDashboard examples={examples} onReset={vi.fn()} />);
    expect(screen.getByText('shop.example')).toBeInTheDocument();
    expect(screen.getByText('2 confirmations sur 2')).toBeInTheDocument();
    expect(screen.getByText('préférences actives').parentElement).toHaveTextContent('1');
  });

  it('désactive la réinitialisation lorsque la mémoire est vide', () => {
    render(<LearningDashboard examples={[]} onReset={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Réinitialiser l’apprentissage' })).toBeDisabled();
  });
});
