import { spawn } from 'child_process';
import path from 'path';
import { redis } from '../../utils/database';
import { logger } from '../../utils/logger';
import { EmbeddingVector } from './types';

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export class EmbeddingGenerationService {
  private readonly scriptPath = path.join(process.cwd(), 'ml_engine', 'embeddings.py');

  async generateEmbedding(text: string): Promise<EmbeddingVector> {
    const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
    const cacheKey = `embedding:all-MiniLM-L6-v2:${this.hash(normalized)}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as EmbeddingVector;
    }

    const embedding = await this.generateSentenceTransformerEmbedding(normalized)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Sentence transformer embedding unavailable; using hash fallback', { error: message });
        return this.generateHashFallback(normalized);
      });

    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(embedding));
    return embedding;
  }

  cosineSimilarity(left: number[], right: number[]): number {
    const length = Math.min(left.length, right.length);
    if (length === 0) return 0;

    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;

    for (let index = 0; index < length; index++) {
      dot += left[index] * right[index];
      leftMagnitude += left[index] ** 2;
      rightMagnitude += right[index] ** 2;
    }

    if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
    return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
  }

  private async generateSentenceTransformerEmbedding(text: string): Promise<EmbeddingVector> {
    const pythonPath = process.env.PYTHON_PATH || 'python';

    return new Promise<EmbeddingVector>((resolve, reject) => {
      const py = spawn(pythonPath, [this.scriptPath, JSON.stringify({ text })]);
      let stdout = '';
      let stderr = '';

      py.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      py.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      py.on('error', reject);
      py.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Embedding process exited with code ${code}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdout) as { vector?: number[]; error?: string };
          if (parsed.error || !Array.isArray(parsed.vector)) {
            reject(new Error(parsed.error || 'Embedding process returned no vector'));
            return;
          }

          resolve({
            provider: 'sentence-transformers',
            model: 'all-MiniLM-L6-v2',
            vector: parsed.vector,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private generateHashFallback(text: string): EmbeddingVector {
    const dimensions = 384;
    const vector = Array.from({ length: dimensions }, () => 0);
    const tokens = text.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const tokenHash = this.hash(token);
      const index = tokenHash % dimensions;
      vector[index] += 1;
      vector[(index * 31) % dimensions] += 0.5;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0)) || 1;
    return {
      provider: 'hash-fallback',
      model: 'hash-v1',
      vector: vector.map((value) => Number((value / magnitude).toFixed(8))),
    };
  }

  private hash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}

export const embeddingGenerationService = new EmbeddingGenerationService();
