import { AsyncLocalStorage } from 'async_hooks';
import { QueryRunner } from 'typeorm';

export const TRANSACTIONAL_QUERY_RUNNER = {} as QueryRunner;
export const ASYNC_LOCAL_STORAGE = new AsyncLocalStorage<{
  queryRunner: QueryRunner;
}>();
