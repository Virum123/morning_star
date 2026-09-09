import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const planDate = '2030-04-10';
const targetDate = '2030-04-11';
const pathForDate = (date) => `supabase://schedule_items/${date}`;
const startAt = (date, index = 0) => {
  const value = new Date(`${date}T00:00:00`);
  value.setMinutes(index);
  return value.toISOString();
};
const makeRow = (id, index, extra = {}) => ({
  id,
  title: `Task ${id}`,
  status: 'active',
  memo: `Memo ${id}`,
  item_type: 'task',
  start_at: startAt(planDate, index),
  ...extra,
});

async function createHarness(initialRows, { onRead, onUpdate, onCreate, onDelete } = {}) {
  let rows = initialRows.map((row) => ({ ...row }));
  let nextId = 0;
  const writes = [];
  const repository = {
    getSchedules: async () => {
      await onRead?.();
      return rows.map((row) => ({ ...row }));
    },
    createSchedule: async (input) => {
      await onCreate?.(input);
      const row = { id: `new-${nextId++}`, ...input };
      writes.push({ type: 'create', row });
      rows.push(row);
      return { ...row };
    },
    updateSchedule: async (id, patch) => {
      writes.push({ type: 'update', id, patch: { ...patch } });
      await onUpdate?.(id, patch);
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) throw new Error('Schedule missing');
      rows[index] = { ...rows[index], ...patch };
      return { ...rows[index] };
    },
    deleteSchedule: async (id) => {
      await onDelete?.(id);
      writes.push({ type: 'delete', id });
      rows = rows.filter((row) => row.id !== id);
      return { id };
    },
  };
  const context = vm.createContext({
    console: { error() {} },
    localStorage: { getItem: () => null, setItem() {} },
  });
  const mockedModules = new Map([
    [resolve(sourceRoot, 'repositories/supabaseScheduleRepository.js'), repository],
    [resolve(sourceRoot, 'utils/api.js'), { api: new Proxy({}, {
      get() { throw new Error('Schedule writes must not call the file-based host API'); },
    }) }],
  ]);
  const modules = new Map();

  async function loadModule(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    const mocked = mockedModules.get(identifier);
    const module = mocked
      ? new vm.SyntheticModule(Object.keys(mocked), function () {
        Object.entries(mocked).forEach(([key, value]) => this.setExport(key, value));
      }, { context, identifier })
      : new vm.SourceTextModule(await readFile(identifier, 'utf8'), { context, identifier });
    modules.set(identifier, module);
    return module;
  }

  const serviceModule = await loadModule(resolve(sourceRoot, 'services/scheduleService.js'));
  await serviceModule.link((specifier, parent) => (
    loadModule(resolve(dirname(parent.identifier), `${specifier}.js`))
  ));
  await serviceModule.evaluate();
  return { service: serviceModule.namespace, writes, getRows: () => rows };
}

test('checking a task updates only its own status without rewriting other rows', async () => {
  const first = makeRow('a', 0, { item_type: 'event' });
  const second = makeRow('b', 1);
  const { service, writes, getRows } = await createHarness([first, second]);

  await service.updateSchedule('a', { status: 'completed' });

  assert.deepEqual(writes, [{ type: 'update', id: 'a', patch: { status: 'completed' } }]);
  assert.deepEqual(getRows(), [{ ...first, status: 'completed' }, second]);
});

test('reordering preserves each task ID, title, memo, type and completion state', async () => {
  const initialRows = [makeRow('a', 0), makeRow('b', 1, { status: 'completed', item_type: 'event' })];
  const { service, writes, getRows } = await createHarness(initialRows);

  const result = await service.updateSchedule({ filepath: pathForDate(planDate), scheduleIds: ['b', 'a'] });

  assert.deepEqual(Array.from(result.files.byDate[planDate][0].scheduleIds), ['b', 'a']);
  assert.equal(writes.length, 2);
  assert.ok(writes.every((write) => write.type === 'update' && Object.keys(write.patch).join() === 'start_at'));
  getRows().forEach((row, index) => {
    assert.deepEqual({ ...row, start_at: initialRows[index].start_at }, initialRows[index]);
  });
});

test('a stale or duplicate reorder request fails before writing any rows', async () => {
  const { service, writes } = await createHarness([makeRow('a', 0), makeRow('b', 1)]);

  await assert.rejects(service.updateSchedule({ filepath: pathForDate(planDate), scheduleIds: ['a', 'a'] }));
  await assert.rejects(service.updateSchedule({ filepath: pathForDate(planDate), scheduleIds: ['a'] }));

  assert.equal(writes.length, 0);
  await service.updateSchedule('a', { title: 'Still editable after a failed reorder' });
  assert.equal(writes.length, 1);
});

test('reordering an event preserves its duration', async () => {
  const { service, getRows } = await createHarness([
    makeRow('a', 0),
    makeRow('b', 1, { item_type: 'event', end_at: startAt(planDate, 61) }),
  ]);

  await service.updateSchedule({ filepath: pathForDate(planDate), scheduleIds: ['b', 'a'] });

  const event = getRows().find((row) => row.id === 'b');
  assert.equal(event.start_at, startAt(planDate, 0));
  assert.equal(event.end_at, startAt(planDate, 60));
});

test('moving a task changes its date with one update, preserving identity and duration', async () => {
  const original = makeRow('a', 0, { status: 'completed', end_at: startAt(planDate, 30) });
  const { service, writes, getRows } = await createHarness([
    original,
    makeRow('b', 0, { start_at: startAt(targetDate, 4) }),
  ]);

  const result = await service.updateSchedule({ id: 'a', targetDate });
  const moved = getRows().find((row) => row.id === 'a');

  assert.equal(writes.length, 1);
  assert.equal(writes[0].type, 'update');
  assert.equal(moved.start_at, startAt(targetDate, 5));
  assert.equal(moved.end_at, startAt(targetDate, 35));
  assert.equal(moved.memo, original.memo);
  assert.equal(moved.status, original.status);
  assert.equal(result.files.byDate[planDate], undefined);
  assert.deepEqual(Array.from(result.files.byDate[targetDate][0].scheduleIds), ['b', 'a']);
});

test('a quick add is appended after existing rows even when a deleted task left an order gap', async () => {
  const { service, getRows } = await createHarness([makeRow('a', 0), makeRow('c', 2)]);

  await service.createSchedule({ taskLine: '- [ ] New task', targetDate: planDate });

  assert.equal(getRows().at(-1).start_at, startAt(planDate, 3));
});

test('rapid updates and reads wait for the previous mutation to finish', async () => {
  let releaseFirstUpdate;
  let notifyFirstStarted;
  const firstStarted = new Promise((resolveStarted) => { notifyFirstStarted = resolveStarted; });
  const firstUpdate = new Promise((resolveUpdate) => { releaseFirstUpdate = resolveUpdate; });
  const { service, writes, getRows } = await createHarness([makeRow('a', 0), makeRow('b', 1)], {
    onUpdate: async (id) => {
      if (id === 'a') {
        notifyFirstStarted();
        await firstUpdate;
      }
    },
  });

  const first = service.updateSchedule('a', { status: 'completed' });
  await firstStarted;
  const second = service.updateSchedule('b', { status: 'completed' });
  let readCompleted = false;
  const read = service.getSchedules().then((files) => { readCompleted = true; return files; });
  await Promise.resolve();
  assert.equal(writes.length, 1);
  assert.equal(readCompleted, false);

  releaseFirstUpdate();
  const [, , files] = await Promise.all([first, second, read]);
  assert.ok(getRows().every((row) => row.status === 'completed'));
  assert.equal(files.byDate[planDate][0].content, '- [x] Task a\n- [x] Task b\n');
});

test('an acknowledged checkbox write remains successful when the refresh fails', async () => {
  let failReads = false;
  const { service, writes } = await createHarness([makeRow('a', 0), makeRow('b', 1)], {
    onRead: () => { if (failReads) throw new Error('Refresh unavailable'); },
    onUpdate: () => { failReads = true; },
  });
  await service.getSchedules();

  const result = await service.updateSchedule('a', { status: 'completed' });

  assert.equal(result.success, true);
  assert.equal(writes.length, 1);
  assert.equal(result.files.byDate[planDate][0].content, '- [x] Task a\n- [ ] Task b\n');
});

test('an acknowledged insert is returned with existing tasks even when the refresh fails', async () => {
  let failReads = false;
  const { service, writes } = await createHarness([makeRow('a', 0)], {
    onRead: () => { if (failReads) throw new Error('Refresh unavailable'); },
    onCreate: () => { failReads = true; },
  });
  await service.getSchedules();

  const result = await service.createSchedule({ taskLine: '- [ ] New task', targetDate: planDate });

  assert.equal(result.success, true);
  assert.equal(writes.length, 1);
  assert.equal(result.files.byDate[planDate][0].content, '- [ ] Task a\n- [ ] New task\n');
});

test('an acknowledged deletion stays removed when the refresh fails', async () => {
  let failReads = false;
  const { service } = await createHarness([makeRow('a', 0), makeRow('b', 1)], {
    onRead: () => { if (failReads) throw new Error('Refresh unavailable'); },
    onDelete: () => { failReads = true; },
  });
  await service.getSchedules();

  const result = await service.deleteSchedule('a');

  assert.equal(result.success, true);
  assert.deepEqual(Array.from(result.files.byDate[planDate][0].scheduleIds), ['b']);
});

test('a partially failed reorder reports the rows already saved even if recovery reads fail', async () => {
  let failReads = false;
  const { service, getRows } = await createHarness([makeRow('a', 0), makeRow('b', 1), makeRow('c', 2)], {
    onRead: () => { if (failReads) throw new Error('Refresh unavailable'); },
    onUpdate: (id) => {
      if (id === 'a') {
        failReads = true;
        throw new Error('Second write failed');
      }
    },
  });

  await assert.rejects(
    service.updateSchedule({ filepath: pathForDate(planDate), scheduleIds: ['c', 'a', 'b'] }),
    (error) => {
      const confirmedRows = error.files.byDate[planDate][0].scheduleRows;
      assert.equal(error.message, 'Second write failed');
      assert.equal(confirmedRows.find((row) => row.id === 'c').start_at, startAt(planDate, 0));
      assert.equal(confirmedRows.find((row) => row.id === 'a').start_at, startAt(planDate, 0));
      assert.deepEqual(Array.from(confirmedRows).sort((a, b) => a.id.localeCompare(b.id)), getRows());
      return true;
    },
  );
});

test('a failed DB write still rejects instead of being mistaken for a refresh failure', async () => {
  const { service, getRows } = await createHarness([makeRow('a', 0)], {
    onUpdate: () => { throw new Error('Write rejected'); },
  });

  await assert.rejects(service.updateSchedule('a', { status: 'completed' }), /Write rejected/);

  assert.equal(getRows()[0].status, 'active');
});
