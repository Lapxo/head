// Loaded with --import into head and every bound it starts: answers each request for a world's pinned address from the
// file the tests filled once by digest, and passes every other request on unchanged.
import { readFileSync } from 'node:fs';

const served = JSON.parse(process.env.HEAD_TEST_WORLDS ?? '{}');
const fetched = globalThis.fetch;
globalThis.fetch = async (url, init) => ((at) => (at === undefined ? fetched(url, init) : new Response(readFileSync(at), { status: 200 })))(served[String(url instanceof Request ? url.url : url)]);
