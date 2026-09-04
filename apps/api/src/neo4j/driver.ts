import neo4j, { type Driver, type Session } from "neo4j-driver";
import { env } from "../config/env.js";

let driver: Driver | undefined;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      env.NEO4J_URI,
      neo4j.auth.basic(env.NEO4J_USERNAME, env.NEO4J_PASSWORD),
      { disableLosslessIntegers: true }
    );
  }
  return driver;
}

export function getSession(): Session {
  return getDriver().session();
}

export async function verifyConnectivity(): Promise<boolean> {
  try {
    await getDriver().verifyConnectivity();
    return true;
  } catch {
    return false;
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = undefined;
  }
}
