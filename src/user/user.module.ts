import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserDao } from './user.dao';
import { UserService } from './user.service';

@Module({
  controllers: [UserController],
  exports: [UserDao],
  providers: [UserService, UserDao],
})
export class UserModule {}
