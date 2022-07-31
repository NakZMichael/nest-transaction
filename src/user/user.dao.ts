import { Injectable } from '@nestjs/common';
import { User } from '../entity/user.entity';
import { DataSource } from 'typeorm';
import {
  Transactional,
  TransactionalQueryRunner,
  TRANSACTIONAL_QUERY_RUNNER,
} from '../lib/transaction';

@Injectable()
export class UserDao {
  constructor(private dataSource: DataSource) {}

  @Transactional()
  public async getUsers(
    @TransactionalQueryRunner() queryRunner = TRANSACTIONAL_QUERY_RUNNER,
  ): Promise<User[]> {
    return queryRunner.manager.find(User);
  }

  @Transactional()
  public async createUser(
    @TransactionalQueryRunner() queryRunner = TRANSACTIONAL_QUERY_RUNNER,
  ) {
    const user = new User();
    Object.assign(user, { name: 'user5' });
    await queryRunner.manager.save(user, { reload: true });
    return user;
  }

  @Transactional()
  public async updateUser(
    user: User,
    @TransactionalQueryRunner() queryRunner = TRANSACTIONAL_QUERY_RUNNER,
  ): Promise<User> {
    return await queryRunner.manager.save(user);
  }
}
