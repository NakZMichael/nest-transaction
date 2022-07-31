# TypeScriptでもSpring Bootの@Transactionalみたいな機能を使いたい

最近、Spring Bootをがっつり勉強する機会がありました。
Javaの言語仕様いけてないところあるなーなどと思いつつも、Spring Bootめっちゃいいなー、好きだなーとなってました。
Spring Bootの中でも一際私の心を掴んだのは[`@Transactional`](https://spring.pleiades.io/guides/gs/managing-transactions/)でした。

こんな感じでトランザクションができます。

```java
@Repository
public class UserDao {
  @Autowired
  private UserMapper userMapper;

  @Transactional
  public List<User> selectAll() {
    return this.userMapper.selectAll();
  }

  @Transactional
  public void create(User user) {
    this.userMapper.create(user);
  }
}
```

```java
@Service
public class UserService {

  @Autowired
  UserDao userDao;

  @Transactional
  public void createMultipleUser() {
    // 挿入するデータをまとめて生成
    User user1 = new User();
    user1.setName("user1");
    user1.setEmail("user1@example.com");
    User user2 = new User();
    user1.setName("user2");
    user1.setEmail("user2@example.com");
    User user3 = new User();
    user1.setName("user3");
    user1.setEmail("user3@example.com");

    // データを順に挿入していく
    this.userDao.create(user1);
    this.userDao.create(user2);
    // たとえば、ここで例外が発生したら上の二つのcreate()の呼び出しがロールバックされる。
    this.userDao.create(user3);
  }
}
```

え？`@Transactional`ってデコレーター(Javaではアノテーションと言いますが、TypeScriptの話がメインなのでデコレーターと呼ぶことにします)つけただけでトランザクション管理してくれるの？しかも、`@Transactional`がついたメソッドの中で他の`@Transactional`がついたメソッドを呼び出したら同一のトランザクションの中にいれてくれるの？？？？どうやってんの？？？？すごいな？？？？

となってました。
で、色々どうやって実現しているのか調べ回ってみたところ、どうやらThreadローカルな変数を使って実現しているらしいということだけわかりました(Javaほぼ初心者なのでSpring Bootのコード読めなかったのでインターネットの雑情報鵜呑みです)。
そりゃそうだよなと、引数にトランザクション管理用のオブジェクトを渡したりしてないし、メソッドの呼び出しごとにアクセスが制御される何らかのグローバル変数みたいなもの使わないと無理だよなとなり、シングルスレッドのTypeScriptでは無理だよなと諦めていました。

ところが、JavaScriptにも`AsyncLocalStorage`という他の言語のThreadローカルな変数と同等の機能を実現できるAPIが存在することを知り、TypeScript版`@Transaction`を作ってみることにしました。
Spring Bootの`@Transactional`はトランザクションの伝搬に色々とオプションを設定できるのですが、今回はそういったことはせずとにかく`@Transactional`がついたメソッドの中で他の`@Transactional`がついたメソッドを呼び出したら同一のトランザクションの中にいれて管理する機能の実現だけに焦点を絞ります。

## TypeScriptで普通にトランザクション管理しようとしたらどうなのよ

TypeScriptのフレームワークでSpring Bootと比較するならNestJSになるのかなと思うんですが、NestJSの公式ドキュメントのなかで紹介されているトランザクションをハンドリングする方法は以下のようになってます。

```typescript
@Injectable()
export class UsersService {
  constructor(private dataSource: DataSource) {}

  async createMany(users: User[]) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.save(users[0]);
      await queryRunner.manager.save(users[1]);

      await queryRunner.commitTransaction();
    } catch (err) {
      // since we have errors lets rollback the changes we made
      await queryRunner.rollbackTransaction();
    } finally {
      // you need to release a queryRunner which was manually instantiated
      await queryRunner.release();
    }
  }
}
```

まあ、あまりカッコ良くはない、、、
アノテーションとかAsyncLocalStorageとかを使わなければ`DataSource`を引数に受け取るヘルパー関数を作って、その引数の中では`QueryRunner`が使えて、トランザクション管理をいい感じにやってくれるとかにするかなあ、、、(サービス内で直接データベースの操作するの嫌なので間にDao層(TypeScript界隈だとRepository層ということが多いかも)を挟むことにします。)

```typescript
@Injectable()
export class UsersService {
  constructor(private dataSource: DataSource,private userDao: UserDao) {}

  async createMany(users: User[]) {
    return manageTransaction(this.dataSource,async(queryRunner)=>{
      await this.userDao.save(users[0],queryRunner);
      await this.userDao.save(users[1],queryRunner);
      return users;
    })
  }
}

// 下の関数はファイル分ける
const manageTransaction = async <T>(dataSource:DataSource,callbackFn:(queryRunner:QueryRunner) => Promise<T>) => {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const result = await callbackFn(queryRunner);
    await queryRunner.commitTransaction();
    return result;
  } catch (err) {
    await queryRunner.rollbackTransaction();
  } finally {
    await queryRunner.release();
  }
}
```

まあ、こんな感じでやるのがKISSの原則とか考えると自分たちで実装するなら丁度いい落とし所な気がします。
ただし、今回は`@Transactional`っぽいものを作りたいということでメタプログラミングの深みにはまっていきます(他のメンバーが同じコード書いてきたら頭を冷やすように勧めると思います)。

今回、私が作ったSpring Bootの`@Transactional`もどきのAPIは以下のような感じになりました。
例えば、サービス層のなかの`createAndUpdateUser`は`createUser`と`updateUser`は同じトランザクションに入っていて、`updateUser`でエラーが発生したら`createUser`もロールバックされます。

```typescript
// DAO層
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

// サービス層
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
```

Spring Bootのものと比較した際にいけてないなーと思うのは本来データベースへのアクセス方法を知っている必要がないサービス層に`DataSource`型のフィールドを持たせないといけないことです。
デコレーターの中でNestJSの仕組みを使ってよしなに`DataSource`を取得できればいいんですが、業務でNestJSを使ったことがないのでちょっと思い付かなかったです。。。
DAO層に関しても、一見一歳`DataSource`が使われていないように見えるのも良くないですね。。。
実際は`@Transactional`デコレーターの中でインスタンスが持つフィールドを検査して、DataSource型のものがあれば、`QueryRunner`を生成するために使用するというような使い方をしています。
要するに特にNestJSの仕組みを有効活用できてるわけではないので、いい風に言えばNestJS使ってなくても同じコードで`@Transactional`を使えます。

## 自家製`@Transactional`の説明

この`@Transactional`は以下のような流れで動作します。

- `@Transactional`がついているメソッドが実行されると`AsyncLocalStorage`から`QueryRunner`を取得しようとします。取得できなかった場合、インスタンスのフィールドの中から`DataSource`型のオブジェクトを見つけて、それを使って`QueryRunner`を生成して、`AsyncLocalStorage`にセットします。これはスタックトレース上の次のメソッド呼び出しのときに `AsyncLocalStorage`から取得されます。
- `@Transactional`がついているメソッドの引数に`@TransactionalQueryRunner()`がついているものがあれば、先ほど取得、または生成した`QueryRunner`に置換されます。デフォルト値を指定しているのは不要なNullチェックを省略するためです。`TRANSACTIONAL_QUERY_RUNNER`は`const TRANSACTIONAL_QUERY_RUNNER = {} as QueryRunner;`のように雑に定義されています。
- 一番最初に`@Transactional`がついているメソッドの場合(上のコードの場合サービス層のメソッド)、トランザクションを開始後、本来のメソッドを呼び出して、成否に応じてコミットしたり、ロールバックしたりしたあとにリソースを解放します。二番目以降のもの(今回の場合DAO層のコード)の場合は単に本来のメソッドを実行するだけです。

たぶん、実際にコードを読むほうがまだわかりやすいと思うのでコードをそのまま載せます(といってもめちゃくちゃ読みにくいと思います)。

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import { DataSource, QueryRunner } from 'typeorm';

export const TRANSACTIONAL_QUERY_RUNNER = {} as QueryRunner;
const ASYNC_LOCAL_STORAGE = new AsyncLocalStorage<{
  queryRunner: QueryRunner;
}>();
const transactionalQueryRunnerKey =
  'custom:annotations:TransactionalQueryRunner';

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
      // トランザクション管理の責任の判定
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
```


## `AsyncLocalStorage`についての簡単な説明

`AsyncLocalStorage`使ったことない人多いと思うので、[このページ](https://nodejs.org/api/async_context.html#asynclocalstoragerunstore-callback-args)読んでみてください。\
さすがにそれじゃ不親切だと思うので私が`AsyncLocalStorage`の挙動を確認するために雑に書いたテストコードも貼っておきます。
デバッガーとか使って挙動を確認してみてください。

```typescript
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
```

## 作ってみての感想

もっとNestJSに寄り添えば設計的にクリーンなAPIにできるのではないかと思いました。
サービス層にデータベース操作のためのオブジェクトである`DataSource`を持たせることになったのが心残りです。

あと、記事を書くために雑に考え出したトランザクション管理用のヘルパー関数が思いのほか使い勝手が良さそうだったので、実務でTypeScriptとRDBMSをセットで使う機会があったら同じようなもの定義して使うと思います。
デコレーターで頑張ろうとするとどうしてもメタプログラミングすることになるので、プロジェクトのコードとして書かれると保守できなくなって辛くなる気がします。
内部的にメタプログラミングを多用してるライブラリを使うのはいいんですが、プロダクションコードとして自分たちで管理するのは、、、、

## コードのレポジトリ

コードのレポジトリーは[ここ](https://github.com/NakZMichael/nest-transaction)です。