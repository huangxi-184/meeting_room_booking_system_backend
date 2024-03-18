import { Injectable, Logger, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { RegisterUserDto } from './dto/registeruser.dto'
import { InjectRepository } from '@nestjs/typeorm';
import { md5 } from 'src/utils';
import { Like, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { RedisService } from 'src/redis/redis.service'
import { Role } from './entities/role.entity'
import { Permission } from './entities/permission.entity'
import { LoginUserDto } from './dto/loginuser.dto';
import { LoginUserVo } from './vo/loginuser.vo';
import { UpdateUserPasswordDto } from './dto/updateuserpassword.dto';
import { UpdateUserDto } from './dto/udpateuser.dto';


@Injectable()
export class UserService {

    private logger = new Logger();

    @InjectRepository(User)
    private userRepository: Repository<User>;

    @InjectRepository(Role)
    private roleRepository: Repository<Role>;

    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>;

    @Inject(RedisService)
    private redisService: RedisService;


    async register(user: RegisterUserDto) {
        const captcha = await this.redisService.get(`captcha_${user.email}`);

        if (!captcha) {
            throw new HttpException('验证码已失效', HttpStatus.BAD_REQUEST);
        }

        if (user.captcha !== captcha) {
            throw new HttpException('验证码不正确', HttpStatus.BAD_REQUEST);
        }

        const foundUser = await this.userRepository.findOneBy({
            username: user.username
        });

        if (foundUser) {
            throw new HttpException('用户已存在', HttpStatus.BAD_REQUEST);
        }

        const newUser = new User();
        newUser.username = user.username;
        newUser.password = md5(user.password);
        newUser.email = user.email;
        newUser.nickName = user.nickName;

        try {
            await this.userRepository.save(newUser);
            return '注册成功';
        } catch (e) {
            this.logger.error(e, UserService);
            return '注册失败';
        }
    }

    async login(loginUserDto: LoginUserDto, isAdmin: boolean) {
        const user = await this.userRepository.findOne({
            where: {
                username: loginUserDto.username,
                isAdmin
            },
            relations: ['roles', 'roles.permissions']
        });

        if (!user) {
            throw new HttpException('用户不存在', HttpStatus.BAD_REQUEST);
        }

        if (user.password !== md5(loginUserDto.password)) {
            throw new HttpException('密码错误', HttpStatus.BAD_REQUEST);
        }

        const vo = new LoginUserVo();

        vo.userInfo = {
            id: user.id,
            username: user.username,
            nickName: user.nickName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            headPic: user.headPic,
            createTime: user.createTime.getTime(),
            isFrozen: user.isFrozen,
            isAdmin: user.isAdmin,
            roles: user.roles.map(item => item.name),
            permissions: user.roles.reduce((arr, item) => {
                item.permissions.forEach(permission => {
                    if (arr.indexOf(permission) === -1) {
                        arr.push(permission);
                    }
                })
                return arr;
            }, [])
        }

        return vo;
    }

    async findUserById(userId: number, isAdmin: boolean) {
        const user = await this.userRepository.findOne({
            where: {
                id: userId,
                isAdmin
            },
            relations: ['roles', 'roles.permissions']
        });

        return {
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin,
            roles: user.roles.map(item => item.name),
            permissions: user.roles.reduce((arr, item) => {
                item.permissions.forEach(permission => {
                    if (arr.indexOf(permission) === -1) {
                        arr.push(permission);
                    }
                })
                return arr;
            }, [])
        }
    }

    async findUserDetailById(userId: number) {
        const user = await this.userRepository.findOne({
            where: {
                id: userId
            }
        });
        return user;
    }

    async updatePassword(userId: number, passwordDto: UpdateUserPasswordDto) {
        const captcha = await this.redisService.get(`update_password_captcha_${passwordDto.email}`);

        if (!captcha) {
            throw new HttpException('验证码已失效', HttpStatus.BAD_REQUEST);
        }

        if (passwordDto.captcha !== captcha) {
            throw new HttpException('验证码不正确', HttpStatus.BAD_REQUEST);
        }

        const foundUser = await this.userRepository.findOneBy({
            id: userId
        });

        foundUser.password = md5(passwordDto.password);

        try {
            await this.userRepository.save(foundUser);
            return '密码修改成功';
        } catch (e) {
            this.logger.error(e, UserService);
            return '密码修改失败';
        }
    }

    async update(userId: number, updateUserDto: UpdateUserDto) {
        const captcha = await this.redisService.get(`update_user_captcha_${updateUserDto.email}`);

        if (!captcha) {
            throw new HttpException('验证码已失效', HttpStatus.BAD_REQUEST);
        }

        if (updateUserDto.captcha !== captcha) {
            throw new HttpException('验证码不正确', HttpStatus.BAD_REQUEST);
        }

        const foundUser = await this.userRepository.findOneBy({
            id: userId
        });

        if (updateUserDto.nickName) {
            foundUser.nickName = updateUserDto.nickName;
        }
        if (updateUserDto.headPic) {
            foundUser.headPic = updateUserDto.headPic;
        }

        try {
            await this.userRepository.save(foundUser);
            return '用户信息修改成功';
        } catch (e) {
            this.logger.error(e, UserService);
            return '用户信息修改成功';
        }
    }

    async freezeUserById(id: number) {
        const user = await this.userRepository.findOneBy({
            id
        });

        user.isFrozen = true;

        await this.userRepository.save(user);
    }

    async findUsersByPage(username: string, nickName: string, email: string, pageNo: number, pageSize: number) {
        const skipCount = (pageNo - 1) * pageSize;

        const condition: Record<string, any> = {};

        if (username) {
            condition.username = Like(`%${username}%`);
        }
        if (nickName) {
            condition.nickName = Like(`%${nickName}%`);
        }
        if (email) {
            condition.email = Like(`%${email}%`);
        }

        const [users, totalCount] = await this.userRepository.findAndCount({
            select: ['id', 'username', 'nickName', 'email', 'phoneNumber', 'isFrozen', 'headPic', 'createTime'],
            skip: skipCount,
            take: pageSize,
            where: condition
        });

        return {
            users,
            totalCount
        }
    }


}
