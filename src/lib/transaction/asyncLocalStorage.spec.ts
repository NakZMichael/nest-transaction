import { AsyncLocalStorage } from 'async_hooks';

describe('AsyncLocalStorageのテスト', () => {
  const asyncLocalStorage = new AsyncLocalStorage<{ value: string }>();
  const getStore = async () => {
    return asyncLocalStorage.getStore();
  };
  const updateStore = async (
    store: { value: string },
    callback?: () => Promise<void>,
  ) => {
    asyncLocalStorage.enterWith(store);
    if (callback) await callback();
  };
  test('runのスコープの中からは状態の変化を参照できるが、外からはできない', async () => {
    asyncLocalStorage.enterWith({ value: '初期状態' });
    const initialStore = asyncLocalStorage.getStore();
    expect(initialStore).toEqual({ value: '初期状態' });
    const returnedStore = asyncLocalStorage.run(
      { value: '内部の初期状態' },
      async () => {
        const insideInitialStore = await getStore();
        expect(insideInitialStore).toEqual({ value: '内部の初期状態' });
        await updateStore({ value: '内部の次の状態' }, async () => {
          const insideSecondStore = await getStore();
          expect(insideSecondStore).toEqual({ value: '内部の次の状態' });
        });
        return getStore();
      },
    );
    await asyncLocalStorage.run({ value: '別の状態0' }, async () => {
      await updateStore({ value: '別の状態1' });
      await updateStore({ value: '別の状態2' });
      await updateStore({ value: '別の状態3' });
    });
    // runの外なのでrunの中での状態の変化は共有されない
    expect(await getStore()).toEqual({ value: '初期状態' });
    // 同じrunの中なので同じ状態が共有される
    expect(await returnedStore).toEqual({ value: '内部の次の状態' });
  });
});
