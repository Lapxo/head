import { aboutOf, valueOf } from './lock.ts';
import type { Said } from './lock.ts';
import { cellLine, cellOf } from '../ports/surface.ts';

export const fill = (text: string, asked: Readonly<Record<string, string | undefined>>): string =>
  Object.entries(asked).reduce((at, [name, value]) => (value === undefined ? at : at.split(`{${name}}`).join(value)), text);

/** What head says: a cell, its code with its state and next; only a question the person reads is said in its lock words. */
export const sayIn = (lock: readonly Said[]) => (key: string, fields: Readonly<Record<string, string | undefined>> = {}): string => (valueOf(lock, `said/${key}/state`) === 'asked' ? fill(aboutOf(lock, `said/${key}`), fields) : cellLine(cellOf(lock, key, fields)));

/** A red, when what head measured ran past a ceiling of its lock in whole seconds: said with the coordinate it ran at; within it, nothing. */
export const redIn = (lock: readonly Said[]) => (scope: string, coordinate: string, started: number, now: number): readonly string[] =>
  ((seconds, ceiling) => (seconds > Number(ceiling.split('..')[1]) ? [sayIn(lock)('red', { coordinate, seconds: String(seconds), scope, ceiling })] : []))(Math.floor((now - started) / 1000), valueOf(lock, scope));
