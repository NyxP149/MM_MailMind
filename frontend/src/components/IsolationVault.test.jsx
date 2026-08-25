import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IsolationVault } from './IsolationVault.jsx';

afterEach(cleanup);

const message = {
  id: 'message_1',
  subject: 'Message douteux',
  snippet: 'Aperçu prudent',
  date: '2026-08-25T10:00:00Z',
  from: { name: 'Expéditeur', email: 'sender@example.com' },
  classification: { id: 'spam', label: 'Spam', confidence: 0.98 },
  unsubscribe: { available: true, method: 'one-click', url: 'https://example.com/remove', host: 'example.com' },
};

describe('Sas de nettoyage V9', () => {
  it('alerte au seuil et expose uniquement des actions manuelles', () => {
    const onAction = vi.fn();
    const onUnsubscribe = vi.fn();
    render(<IsolationVault data={{ label: 'MailMind/À supprimer', total: 300, alertThreshold: 300, messages: [message] }} onAction={onAction} onUnsubscribe={onUnsubscribe} />);
    expect(screen.getByText('Le seuil de nettoyage est atteint.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir ce libellé dans Gmail/i })).toHaveAttribute('href', expect.stringContaining('mail.google.com'));
    fireEvent.click(screen.getByRole('button', { name: /Spam/i }));
    expect(onAction).toHaveBeenCalledWith(message, 'spam');
    fireEvent.click(screen.getByRole('button', { name: /Désabonner/i }));
    expect(onUnsubscribe).toHaveBeenCalledWith(message);
  });

  it('désactive le nettoyage global lorsque le sas est vide', () => {
    render(<IsolationVault data={{ total: 0, messages: [] }} />);
    expect(screen.getByRole('button', { name: /Vider le sas/i })).toBeDisabled();
    expect(screen.getByText('Le sas est vide')).toBeInTheDocument();
  });
});
