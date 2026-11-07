/** The current time, behind a port so tests can move it. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol("CLOCK");

export const systemClock: Clock = { now: () => new Date() };
