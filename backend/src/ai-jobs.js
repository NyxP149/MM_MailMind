import { randomUUID } from 'node:crypto';
import { AIServiceError, analyzeEmailWithAI } from './ai.js';

const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 20;

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    result: job.result,
    error: job.error,
  };
}

export function createAIJobManager({ analyze = analyzeEmailWithAI, createId = randomUUID, now = Date.now } = {}) {
  const jobs = new Map();

  function prune() {
    const cutoff = now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
      if (job.status !== 'running' && job.completedAtMs < cutoff) jobs.delete(id);
    }
  }

  function start(config, email) {
    prune();
    if (jobs.size >= MAX_JOBS) {
      const oldestFinished = [...jobs.values()].find((job) => job.status !== 'running');
      if (oldestFinished) jobs.delete(oldestFinished.id);
      else throw new AIServiceError('AI_JOB_LIMIT', 'Trop d’analyses sont déjà en cours. Réessayez dans quelques instants.');
    }

    const id = createId();
    const job = {
      id,
      status: 'running',
      createdAt: new Date(now()).toISOString(),
      completedAt: null,
      completedAtMs: null,
      result: null,
      error: null,
    };
    jobs.set(id, job);

    Promise.resolve()
      .then(() => analyze(config, email))
      .then((analysis) => {
        job.status = 'completed';
        job.completedAtMs = now();
        job.completedAt = new Date(job.completedAtMs).toISOString();
        job.result = { analysis, provider: config.aiProvider, model: config.aiModel };
      })
      .catch((error) => {
        job.status = 'failed';
        job.completedAtMs = now();
        job.completedAt = new Date(job.completedAtMs).toISOString();
        job.error = {
          code: error.code || 'AI_ERROR',
          message: error.message || 'L’analyse IA a échoué.',
        };
      });

    return publicJob(job);
  }

  function get(id) {
    prune();
    const job = jobs.get(id);
    return job ? publicJob(job) : null;
  }

  return { start, get };
}
