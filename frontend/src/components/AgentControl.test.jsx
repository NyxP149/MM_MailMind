import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentControl } from './AgentControl.jsx';

const emails = [{
  id: 'message-agent',
  subject: 'Contenu non conservé dans le rapport',
  quarantined: false,
  classification: { id: 'spam', label: 'Spam', action: 'quarantine', confidence: 0.98 },
}];

describe('Agent contrôlé V7', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('génère une simulation sans appeler Gmail', async () => {
    const onSaveReport = vi.fn();
    const onQuarantine = vi.fn();
    render(<AgentControl emails={emails} reports={[]} onSaveReport={onSaveReport} onQuarantine={onQuarantine} />);

    fireEvent.click(screen.getByRole('button', { name: 'Générer une simulation' }));

    await waitFor(() => expect(onSaveReport).toHaveBeenCalledTimes(1));
    expect(onQuarantine).not.toHaveBeenCalled();
    expect(onSaveReport.mock.calls[0][0].mode).toBe('simulation');
  });

  it('exige l’armement puis exécute uniquement le lot confirmé', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSaveReport = vi.fn();
    const onQuarantine = vi.fn().mockResolvedValue({ quarantined: true });
    const { container } = render(<AgentControl emails={emails} reports={[]} onSaveReport={onSaveReport} onQuarantine={onQuarantine} />);

    fireEvent.click(container.querySelector('.agent-mode input'));
    const execute = screen.getByRole('button', { name: 'Exécuter 1 action(s)' });
    expect(execute).toBeDisabled();
    fireEvent.click(container.querySelector('.agent-arm input'));
    expect(execute).toBeEnabled();
    fireEvent.click(execute);

    await waitFor(() => expect(onQuarantine).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaveReport).toHaveBeenCalledTimes(1));
    expect(onSaveReport.mock.calls[0][0].metrics.executed).toBe(1);
  });
});
