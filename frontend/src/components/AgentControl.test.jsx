import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentControl } from './AgentControl.jsx';

const apiMocks = vi.hoisted(() => ({
  getAgentSchedule: vi.fn(),
  getAgentScheduleReports: vi.fn(),
  saveAgentSchedule: vi.fn(),
  disableAgentSchedule: vi.fn(),
  runAgentScheduleNow: vi.fn(),
}));

vi.mock('../api.js', () => ({ api: apiMocks }));

const emails = [{
  id: 'message-agent',
  subject: 'Contenu non conservé dans le rapport',
  quarantined: false,
  classification: { id: 'spam', label: 'Spam', action: 'quarantine', confidence: 0.98 },
}];

describe('Agent contrôlé V7', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiMocks.getAgentSchedule.mockResolvedValue({ enabled: false, time: '08:00', maxMessages: 50 });
    apiMocks.getAgentScheduleReports.mockResolvedValue({ reports: [] });
  });

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

  it('active une planification qui reste une simulation', async () => {
    apiMocks.saveAgentSchedule.mockResolvedValue({ enabled: true, time: '08:00', maxMessages: 50 });
    render(<AgentControl emails={emails} reports={[]} onSaveReport={vi.fn()} onQuarantine={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Activer' }));

    await waitFor(() => expect(apiMocks.saveAgentSchedule).toHaveBeenCalledTimes(1));
    expect(apiMocks.saveAgentSchedule.mock.calls[0][0]).toMatchObject({
      threshold: 0.9,
      categories: ['adultes', 'rencontres', 'spam', 'arnaque'],
      maxMessages: 50,
    });
    expect(await screen.findByText('Active')).toBeInTheDocument();
  });
});
