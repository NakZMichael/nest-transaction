import { DataSource, QueryRunner } from 'typeorm';
import { ASYNC_LOCAL_STORAGE } from './transaction.const';

/**
 * トランザクションとして実行したいメソッドにつけるデコレーター
 * そのメソッドの中で実行された別のメソッド(他のクラスのメソッドでもよい)にも
 * Transactionalデコレーターが付いていた場合、同一のトランザクション内で実行する。
 */
export const Transactional =
  () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      // トランザクションに使用するQueryRunnerを取得する
      // QueryRunnerが取得できないならば作成し、トランザクション管理の責任を持つ。
      let queryRunner: QueryRunner;
      const { queryRunner: initialQueryRunner } =
        ASYNC_LOCAL_STORAGE.getStore() || {};
      const hasResponsibility = !initialQueryRunner;
      if (hasResponsibility) {
        // TODO: 複数DataSourceがあるときに適切なものを選べるようにしたい
        // Transactionalデコレーターの引数にDataSourceのフィールド名でも指定できるようにする？
        const dataSource = Object.values(this).find(
          (value) => value instanceof DataSource,
        ) as DataSource | undefined;
        if (!dataSource) {
          throw new Error('DataSource型のフィールドが存在しません');
        }
        queryRunner = dataSource.createQueryRunner();
      } else {
        queryRunner = initialQueryRunner;
      }
      // ダミーの引数にqueryRunnerを割り当てる
      const replacedArgumentIndex: number = Reflect.getMetadata(
        transactionalQueryRunnerKey,
        target,
        propertyKey,
      );
      const newArgs = [...args];
      newArgs[replacedArgumentIndex] = queryRunner;
      // トランザクション管理の責任があるときの処理
      if (hasResponsibility) {
        return ASYNC_LOCAL_STORAGE.run({ queryRunner }, async () => {
          try {
            await queryRunner.connect();
            await queryRunner.startTransaction();
            // 本来のメソッドを実行する
            const result = await originalMethod.apply(this, newArgs);
            await queryRunner.commitTransaction();
            return result;
          } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
          } finally {
            await queryRunner.release();
          }
        });
      }
      // トランザクション管理の責任がない時は関数を実行するだけ
      return originalMethod.apply(this, newArgs);
    };
  };

/**
 * Transactionalアノテーションがついているメソッドの
 * このアノテーションがついている引数は
 * トランザクション管理されているQueryRunnerに置換される。
 */
export const TransactionalQueryRunner =
  () => (target: any, propertyKey: string, index: number) => {
    Reflect.defineMetadata(
      transactionalQueryRunnerKey,
      index,
      target,
      propertyKey,
    );
  };

const transactionalQueryRunnerKey =
  'custom:annotations:TransactionalQueryRunner';
