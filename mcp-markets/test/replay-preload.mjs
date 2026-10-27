// Loaded with --import by the stdio test: the server's fetch replays the captured responses, and its
// clock starts at the capture time (as the in-process tests' sessions do), so dated answers such as
// unexpired options do not age out of the fixtures.
import { NOW, replayFetch } from "./replay.mjs";
globalThis.fetch = replayFetch().fetchImpl;
const shift = Date.now() - NOW, wall = Date.now;
Date.now = () => wall() - shift;
