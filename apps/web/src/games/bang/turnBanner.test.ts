import assert from 'node:assert/strict';
import test from 'node:test';
import { turnBanner } from './turnBanner.ts';

const names = new Map([[0, 'Hân'], [1, 'Mai']]);
const table = (turn: number, waiting: unknown = null, winner: unknown = null) => ({ turn: { player: turn }, waiting, winner }) as never;

test('lượt của mình và của người khác', () => {
  assert.deepEqual(turnBanner(table(0), names, 0), { own: true, key: 'turn:0', text: 'Đến lượt bạn!' });
  assert.equal(turnBanner(table(1), names, 0)?.text, 'Lượt của Mai');
  assert.equal(turnBanner(table(1), names, null)?.text, 'Lượt của Mai');
});

test('chờ phản ứng: bạn hoặc người khác; chờ kiểu turn không tính', () => {
  assert.equal(turnBanner(table(1, { player: 0, kind: { type: 'attack_response' } }), names, 0)?.text, 'Chờ bạn phản ứng');
  assert.equal(turnBanner(table(0, { player: 1, kind: { type: 'duel' } }), names, 0)?.text, 'Mai đang phản ứng');
  assert.equal(turnBanner(table(1, { player: 1, kind: { type: 'turn' } }), names, 0)?.text, 'Lượt của Mai');
});

test('hết ván không có băng rôn; thiếu nickname dùng ghế', () => {
  assert.equal(turnBanner(table(0, null, 'outlaws'), names, 0), null);
  assert.equal(turnBanner(table(5), names, 0)?.text, 'Lượt của Ghế 6');
});

test('General Store announces a blind choice rather than an attack response', () => {
  const store = table(0, { player: 0, pending_id: 8, kind: { type: 'general_store' } });
  assert.equal(turnBanner(store, names, 0)?.text, 'Chờ bạn chọn');
  assert.equal(turnBanner(store, names, 1)?.text, 'Hân đang chọn');
});

test('blind hand banner names the target for actor and observers', () => {
  const pick = table(0, { player: 0, pending_id: 9, kind: { type: 'pick_hand_slot', target: 1, kind: 'panic', count: 3 } });
  assert.equal(turnBanner(pick, names, 0)?.text, 'Chọn lá từ tay Mai');
  assert.equal(turnBanner(pick, names, 1)?.text, 'Hân đang chọn lá từ tay Mai');
  assert.equal(turnBanner(pick, names, null)?.text, 'Hân đang chọn lá từ tay Mai');
});
