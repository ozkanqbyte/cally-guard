import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CallRecorder } from '../src/agent/call-recorder.mjs';

const pcm = (n) => Buffer.alloc(n, 1);

test('fromEnv is off unless GUARD_RECORD_DIR is set', () => {
  assert.equal(CallRecorder.fromEnv('c1', {}), null);
  assert.ok(CallRecorder.fromEnv('c1', { GUARD_RECORD_DIR: '/tmp/x' }) instanceof CallRecorder);
});

test('drops everything when never armed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rec-'));
  const r = new CallRecorder({ dir, callId: 'c2' });
  r.write(pcm(3200));
  const path = await r.finish();
  assert.equal(path, null);
  assert.deepEqual(await readdir(dir), []);
});

test('armed → writes one valid mono 16-bit WAV', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rec-'));
  const r = new CallRecorder({ dir, callId: 'c/3', sampleRate: 16000 });
  r.write(pcm(1600));
  r.arm();
  r.write(pcm(1600));
  const path = await r.finish();
  assert.ok(path, 'should return a path');
  const buf = await readFile(path);
  assert.equal(buf.subarray(0, 4).toString(), 'RIFF');
  assert.equal(buf.subarray(8, 12).toString(), 'WAVE');
  assert.equal(buf.readUInt16LE(22), 1, 'mono');
  assert.equal(buf.readUInt32LE(24), 16000, 'sample rate');
  assert.equal(buf.readUInt16LE(34), 16, 'bits per sample');
  assert.equal(buf.readUInt32LE(40), 3200, 'data length = bytes written');
  assert.ok(path.includes('guard-c_3-'), 'call id is sanitised in the name');
});

test('honours the duration cap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rec-'));
  const r = new CallRecorder({ dir, callId: 'c4', sampleRate: 8000, maxSeconds: 1 });
  r.arm();
  r.write(pcm(8000 * 2)); // exactly the cap (1s @ 8k, 16-bit)
  r.write(pcm(8000 * 2)); // over — ignored
  const path = await r.finish();
  const buf = await readFile(path);
  assert.equal(buf.readUInt32LE(40), 16000);
});

test('finish is idempotent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rec-'));
  const r = new CallRecorder({ dir, callId: 'c5' });
  r.arm();
  r.write(pcm(320));
  assert.ok(await r.finish());
  assert.equal(await r.finish(), null);
});
