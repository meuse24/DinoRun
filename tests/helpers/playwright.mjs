import path from 'node:path';
import { pathToFileURL } from 'node:url';

// One resolution rule for browser suites, child runners and the CDP relay.
// Relative overrides are relative to the invoking working directory.
export function playwrightUrl(override = process.env.DINO_PLAYWRIGHT) {
  return override ? pathToFileURL(path.resolve(override)).href : import.meta.resolve('playwright');
}

export function loadPlaywright() {
  return import(playwrightUrl());
}
