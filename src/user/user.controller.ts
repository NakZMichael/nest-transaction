import { Controller, Get, Post, Put } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('/')
  public getUsers() {
    return this.userService.getUsers();
  }
  @Post('/')
  public createAndUpdateUser() {
    return this.userService.createAndUpdateUser();
  }
  @Put('/')
  public createUserAndThrow() {
    return this.userService.createUserAndThrow();
  }
}
