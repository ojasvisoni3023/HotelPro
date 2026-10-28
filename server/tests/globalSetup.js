import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;

/** Starts one in-memory MongoDB for the whole test run. No real database or credentials needed. */
export async function setup({ provide }) {
  mongod = await MongoMemoryServer.create();
  provide('mongoUri', mongod.getUri());
}

export async function teardown() {
  await mongod?.stop();
}
