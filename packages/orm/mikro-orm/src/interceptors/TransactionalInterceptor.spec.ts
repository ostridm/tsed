import {TransactionalInterceptor} from "./TransactionalInterceptor";
import {anyFunction, anything, deepEqual, instance, mock, reset, verify, when} from "ts-mockito";
import {InterceptorContext} from "@tsed/di";
import {Logger} from "@tsed/logger";
import {EntityManager, MikroORM, OptimisticLockError} from "@mikro-orm/core";
import {MikroOrmRegistry} from "../services/MikroOrmRegistry";
import {RetryStrategy} from "../services/RetryStrategy";
import {MikroOrmContext} from "../services/MikroOrmContext";

describe("TransactionalInterceptor", () => {
  const mockedMikroOrmRegistry = mock<MikroOrmRegistry>();
  const mockedMikroOrm = mock<MikroORM>();
  const mockedEntityManager = mock<EntityManager>();
  const mockedLogger = mock<Logger>();
  const mockedRetryStrategy = mock<RetryStrategy>();
  const mockedMikroOrmContext = mock<MikroOrmContext>();
  const next = jest.fn();

  let transactionalInterceptor!: TransactionalInterceptor;

  afterEach(() => {
    next.mockReset();
    reset<MikroOrmRegistry | MikroORM | EntityManager | Logger | RetryStrategy | MikroOrmContext>(
      mockedMikroOrmRegistry,
      mockedMikroOrm,
      mockedEntityManager,
      mockedLogger,
      mockedMikroOrmContext,
      mockedRetryStrategy
    );
  });
  beforeEach(() => {
    when(mockedMikroOrm.em).thenReturn(instance(mockedEntityManager));

    transactionalInterceptor = new TransactionalInterceptor(
      instance(mockedMikroOrmRegistry),
      instance(mockedMikroOrmContext),
      instance(mockedLogger)
    );
  });

  describe("intercept", () => {
    it("should run within a existing context", async () => {
      // arrange
      const context = {} as InterceptorContext;

      when(mockedMikroOrmRegistry.get(anything())).thenReturn(instance(mockedMikroOrm));
      when(mockedMikroOrmContext.has(anything())).thenReturn(true);
      when(mockedMikroOrmContext.get(anything())).thenReturn(instance(mockedEntityManager));

      // act
      await transactionalInterceptor.intercept(context, next);

      // assert
      verify(mockedEntityManager.flush()).once();
    });

    it("should run within a new context", async () => {
      // arrange
      const context = {} as InterceptorContext;
      const entityManger = instance(mockedEntityManager);

      when(mockedMikroOrmRegistry.get(anything())).thenReturn(instance(mockedMikroOrm));
      when(mockedMikroOrmContext.has(anything())).thenReturn(false);
      when(mockedMikroOrmContext.get(anything())).thenReturn(entityManger);
      when(mockedMikroOrmContext.run(anything(), anything())).thenCall((_: EntityManager[], func: (...args: unknown[]) => unknown) =>
        func()
      );

      // act
      await transactionalInterceptor.intercept(context, next);

      // assert
      verify(mockedMikroOrmContext.run(deepEqual([entityManger]), anyFunction())).once();
      verify(mockedEntityManager.flush()).once();
    });

    it("should throw an error if no such context", async () => {
      // arrange
      const context = {} as InterceptorContext;

      when(mockedMikroOrmRegistry.get(anything())).thenReturn();

      // act
      const result = transactionalInterceptor.intercept(context, next);

      // assert
      await expect(result).rejects.toThrow("No such context");
    });

    it("should throw an optimistic lock exception immediately if no retry strategy", async () => {
      // arrange
      const context = {} as InterceptorContext;

      when(mockedMikroOrmContext.has(anything())).thenReturn(true);
      when(mockedMikroOrmRegistry.get(anything())).thenReturn(instance(mockedMikroOrm));
      when(mockedEntityManager.flush()).thenReject(OptimisticLockError.lockFailed("Lock"));
      when(mockedMikroOrmContext.get(anything())).thenReturn(instance(mockedEntityManager));

      // act
      const result = transactionalInterceptor.intercept(context, next);

      // assert
      await expect(result).rejects.toThrowError("Lock");
      verify(mockedEntityManager.flush()).times(1);
    });

    it("should apply a retry mechanism if retry is enabled", async () => {
      // arrange
      transactionalInterceptor = new TransactionalInterceptor(
        instance(mockedMikroOrmRegistry),
        instance(mockedMikroOrmContext),
        instance(mockedLogger),
        instance(mockedRetryStrategy)
      );
      const context = {options: {retry: true}} as InterceptorContext;

      when(mockedMikroOrmContext.has(anything())).thenReturn(true);
      when(mockedRetryStrategy.acquire(anything())).thenResolve();
      when(mockedMikroOrmRegistry.get(anything())).thenReturn(instance(mockedMikroOrm));
      when(mockedEntityManager.flush()).thenReject(OptimisticLockError.lockFailed("Lock"));
      when(mockedMikroOrmContext.get(anything())).thenReturn(instance(mockedEntityManager));

      // act
      await transactionalInterceptor.intercept(context, next);

      // assert
      verify(mockedRetryStrategy.acquire(anything())).once();
    });

    it("should log a warning if the retry is enabled, while a retry strategy is not resolved", async () => {
      // arrange
      const context = {options: {retry: true}} as InterceptorContext;

      when(mockedMikroOrmRegistry.get(anything())).thenReturn(instance(mockedMikroOrm));

      // act
      await transactionalInterceptor.intercept(context, next);

      // assert
      verify(mockedLogger.warn(`To retry a transaction you have to implement a "${RetryStrategy.description}" interface`)).once();
    });
  });
});
