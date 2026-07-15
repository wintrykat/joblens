import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPageTextForBoard, getBoardById } from './boards';

function loadFixture(name: string): Document {
  const html = readFileSync(
    resolve(import.meta.dirname, `../../tests/fixtures/pages/${name}`),
    'utf8'
  );
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('boards DOM extractors', () => {
  it('extracts Indeed job description from fixture', () => {
    const doc = loadFixture('indeed-job.html');
    const text = extractPageTextForBoard(getBoardById('indeed'), doc);
    expect(text).toMatch(/Software Engineer/);
    expect(text).toMatch(/TypeScript/);
  });

  it('extracts ZipRecruiter detail pane from fixture', () => {
    const doc = loadFixture('ziprecruiter-detail.html');
    const text = extractPageTextForBoard(getBoardById('ziprecruiter'), doc);
    expect(text).toMatch(/Matrix Retail/);
    expect(text).toMatch(/Javascript/i);
  });
});
