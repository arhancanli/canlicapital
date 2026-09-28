// The hosted build of canli-execution-mcp (canlicapital.com/mcp/execution, once released): the
// cost and order-level checks only. It imports the check and the pure cores and nothing else, so
// no broker, journal or file code can reach the hosted function (a test walks the import graph).
// It keeps no state and takes no book: the account fields are refused, and position, gross and net
// caps need the package run locally.
import { advertised, CHECK_ORDERS_OUTPUT, HOSTED_CHECK_ORDERS_DESCRIPTION, HOSTED_CHECK_ORDERS_JSON, hostedCheckOrdersInput, parseInput, runCheckOrders } from "./check-orders.mjs";
import { SERVER_INFO } from "./info.mjs";

export { SERVER_INFO };

export const HOSTED_INSTRUCTIONS = "Checks orders before they are sent. check_orders estimates each order's cost and checks it against the limits and market state given; it rejects with every reason and never resizes. This hosted build keeps nothing and takes no positions; run canli-execution-mcp locally to check orders against your own book, limits file and kill switch. Nothing here is investment advice.";

const asText = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

export async function toolHostedCheckOrders(args, { now } = {}) {
  const input = parseInput(hostedCheckOrdersInput, args, "check_orders");
  return asText(runCheckOrders(input, { now }));
}

const CHECK = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function registerHostedTools(server, { now } = {}) {
  server.registerTool("check_orders", { title: "Check orders", annotations: { title: "Check orders", ...CHECK }, description: HOSTED_CHECK_ORDERS_DESCRIPTION, inputSchema: advertised(hostedCheckOrdersInput, HOSTED_CHECK_ORDERS_JSON), outputSchema: CHECK_ORDERS_OUTPUT }, (args) => toolHostedCheckOrders(args, { now }));
}
