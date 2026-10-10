// Loaded with --import by the stdio test: the server's fetch replays the captured responses.
import { replayFetch } from "./replay.mjs";
globalThis.fetch = replayFetch().fetchImpl;
