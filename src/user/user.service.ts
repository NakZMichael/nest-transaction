import { Injectable } from '@nestjs/common';
import { Transactional } from '../lib/transaction';
import { DataSource } from 'typeorm';
import { UserDao } from './user.dao';

@Injectable()
export class UserService {
  constructor(private userDao: UserDao, private dataSource: DataSource) {}

  @Transactional()
  public async getUsers() {
    const users = await this.userDao.getUsers();
    return users;
  }

  @Transactional()
  public async createAndUpdateUser() {
    const user = await this.userDao.createUser();
    user.name = user.name + '!';
    return this.userDao.updateUser(user);
  }
  @Transactional()
  public async createUserAndThrow() {
    await this.userDao.createUser();
    throw new Error('Unknown Error');
  }
}
