import test from 'node:test';
import assert from 'node:assert/strict';
import { imageProse } from './lib/image-prose.mjs';
test('image metadata is not a financial claim, but alt text remains audited', () => {
  assert.equal(imageProse('<img src="/study-1536.webp" width="1536" alt="">'), ' ');
  assert.equal(imageProse('<img src="/study.webp" alt="Return of 27%">'), 'Return of 27%');
  assert.equal(imageProse('<p>Return of 27%</p>'), '<p>Return of 27%</p>');
});
